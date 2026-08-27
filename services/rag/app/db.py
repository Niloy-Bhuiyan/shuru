"""Postgres access: the connection pool, the indexer, and retrieval.

This service connects with the service role, which bypasses RLS. That makes
the access filter in `search` load-bearing rather than decorative — it is
re-applied in SQL here, and the RLS policy on `rag_chunks` is the second line
behind it, not the only one.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator

import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .chunking import Chunk, chunk_opportunity
from .config import get_settings
from .security import looks_like_injection

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        settings = get_settings()
        if not settings.database_url:
            raise RuntimeError(
                "SHURU_RAG_DATABASE_URL is not set. Supabase Dashboard -> "
                "Project Settings -> Database -> Connection string -> URI."
            )
        _pool = ConnectionPool(
            settings.database_url,
            min_size=1,
            max_size=4,
            open=True,
            # pgvector types must be registered per connection, not per query.
            configure=register_vector,
            kwargs={"row_factory": dict_row},
        )
    return _pool


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    with get_pool().connection() as conn:
        yield conn


# ── retrieval ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Passage:
    """One retrieved chunk, with everything a citation needs."""

    opportunity_id: str
    company: str
    role: str
    source_field: str
    chunk_index: int
    content: str
    distance: float
    apply_url: str | None
    source: str
    suspected_injection: bool

    @property
    def citation_label(self) -> str:
        return f"{self.company} — {self.role} ({self.source_field})"


# A chunk is visible only while its parent listing is approved and unexpired.
#
# This mirrors the public arm of the `opportunities_select` RLS policy on
# purpose. It deliberately does NOT include that policy's private arms (own
# company, own posting): the retrieval corpus is the public listing set, and
# widening it here would let one employer's unapproved draft be quoted into
# another student's answer.
_VISIBILITY_SQL = """
    o.status = 'approved'
    and (o.expires_at is null or o.expires_at > now())
"""


def search(query_vector: list[float], top_k: int, max_distance: float) -> list[Passage]:
    """Nearest-neighbour search over visible chunks only.

    `<=>` is pgvector's cosine distance: 0 is identical, larger is less
    similar. The `max_distance` bound is what makes "we found nothing relevant"
    possible — without it, the nearest chunk always wins no matter how
    unrelated it is, and the pipeline could never honestly abstain.
    """
    sql = f"""
        select
            c.opportunity_id::text as opportunity_id,
            c.source_field,
            c.chunk_index,
            c.content,
            (c.embedding <=> %(q)s::vector) as distance,
            o.company,
            o.role,
            o.apply_url,
            o.source
        from public.rag_chunks c
        join public.opportunities o on o.id = c.opportunity_id
        where {_VISIBILITY_SQL}
          and (c.embedding <=> %(q)s::vector) <= %(max_distance)s
        order by c.embedding <=> %(q)s::vector
        limit %(k)s
    """
    with connection() as conn:
        rows = conn.execute(
            sql, {"q": query_vector, "k": top_k, "max_distance": max_distance}
        ).fetchall()

    return [
        Passage(
            opportunity_id=r["opportunity_id"],
            company=r["company"],
            role=r["role"],
            source_field=r["source_field"],
            chunk_index=r["chunk_index"],
            content=r["content"],
            distance=float(r["distance"]),
            apply_url=r["apply_url"],
            source=r["source"],
            suspected_injection=looks_like_injection(r["content"]),
        )
        for r in rows
    ]


# ── indexing ────────────────────────────────────────────────────────────


@dataclass
class IndexReport:
    scanned: int = 0
    indexed: int = 0
    skipped_unchanged: int = 0
    skipped_no_text: int = 0
    chunks_written: int = 0
    deleted_stale: int = 0

    def as_dict(self) -> dict[str, int]:
        return self.__dict__.copy()


def fetch_indexable() -> list[dict]:
    """Every listing whose text is eligible for the index.

    Same visibility rule as `search`. A listing that is pending, rejected or
    expired is not indexed at all, so it cannot be retrieved even momentarily.
    """
    with connection() as conn:
        return conn.execute(
            f"""
            select o.id::text as id, o.description, o.requirements
            from public.opportunities o
            where {_VISIBILITY_SQL}
            order by o.id
            """
        ).fetchall()


def existing_hashes() -> dict[tuple[str, str], str]:
    """(opportunity_id, source_field) -> content_hash already in the index."""
    with connection() as conn:
        rows = conn.execute(
            """
            select distinct opportunity_id::text as opportunity_id,
                   source_field, content_hash
            from public.rag_chunks
            where embedding_model = %(model)s
            """,
            {"model": get_settings().embedding_model},
        ).fetchall()
    return {(r["opportunity_id"], r["source_field"]): r["content_hash"] for r in rows}


def replace_field_chunks(
    opportunity_id: str,
    source_field: str,
    chunks: list[Chunk],
    vectors: list[list[float]],
    model: str,
) -> None:
    """Atomically swap one field's chunks for a new set.

    Delete-then-insert in one transaction rather than upsert-by-index: a
    re-chunk can produce FEWER chunks than before, and an upsert would leave
    the surplus behind as retrievable text that no longer exists in the source.
    """
    with connection() as conn, conn.transaction():
        conn.execute(
            """
            delete from public.rag_chunks
            where opportunity_id = %(id)s and source_field = %(field)s
            """,
            {"id": opportunity_id, "field": source_field},
        )
        if not chunks:
            return
        conn.cursor().executemany(
            """
            insert into public.rag_chunks
                (opportunity_id, source_field, chunk_index, content,
                 embedding, embedding_model, content_hash)
            values (%s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    c.opportunity_id,
                    c.source_field,
                    c.chunk_index,
                    c.content,
                    v,
                    model,
                    c.content_hash,
                )
                for c, v in zip(chunks, vectors)
            ],
        )


def delete_orphans() -> int:
    """Drop chunks whose listing is no longer visible.

    The FK cascade covers deletion, but not a listing that was un-approved or
    that expired. Without this, retrieval could quote a role that is closed —
    the citation would be real and the answer would still be wrong.
    """
    with connection() as conn:
        cur = conn.execute(
            f"""
            delete from public.rag_chunks c
            where not exists (
                select 1 from public.opportunities o
                where o.id = c.opportunity_id and {_VISIBILITY_SQL}
            )
            """
        )
        return cur.rowcount or 0


def reindex(force: bool = False) -> IndexReport:
    """Bring the index in line with the listings table.

    Incremental by default: a field whose content hash is unchanged is left
    alone, which is what makes re-running this on a schedule cheap.
    """
    from .embeddings import get_embedder

    settings = get_settings()
    embedder = get_embedder()
    report = IndexReport()

    report.deleted_stale = delete_orphans()
    known = {} if force else existing_hashes()

    for row in fetch_indexable():
        report.scanned += 1
        opp_id = row["id"]
        by_field = {
            "description": row["description"],
            "requirements": row["requirements"],
        }

        wrote_any = False
        had_text = False

        for field, text in by_field.items():
            chunks = [
                c
                for c in chunk_opportunity(
                    opp_id,
                    text if field == "description" else None,
                    text if field == "requirements" else None,
                )
                if c.source_field == field
            ]
            if not chunks:
                continue
            had_text = True

            if known.get((opp_id, field)) == chunks[0].content_hash:
                continue

            vectors = embedder.embed_documents([c.content for c in chunks])
            replace_field_chunks(
                opp_id, field, chunks, vectors, settings.embedding_model
            )
            report.chunks_written += len(chunks)
            wrote_any = True

        if not had_text:
            report.skipped_no_text += 1
        elif wrote_any:
            report.indexed += 1
        else:
            report.skipped_unchanged += 1

    return report
