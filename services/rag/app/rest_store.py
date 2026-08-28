"""PostgREST-backed store — the no-database-password path.

Why this exists: `db.py` talks to Postgres directly, which needs
`SHURU_RAG_DATABASE_URL` and therefore the database password. That password is
not derivable from anything else a Supabase project hands you — not the
service-role key, not the management API — so a deployment holding every other
credential still could not index or answer.

Supabase already exposes the same database over PostgREST, and the service-role
key is enough. The only thing PostgREST cannot express is
`order by embedding <=> query`, which migration 0015 supplies as the
`match_rag_chunks` RPC.

Both stores implement the same three operations and `store.py` picks between
them. Direct Postgres stays the default where it is available — it is faster,
transactional, and the delete-then-insert swap in `replace_field_chunks` is a
real transaction there rather than two requests.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .config import get_settings
from .db import Passage
from .security import looks_like_injection


class RestError(RuntimeError):
    pass


def _request(
    method: str, path: str, body: Any | None = None, headers: dict | None = None
) -> Any:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{path.lstrip('/')}"
    key = settings.supabase_service_key

    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)

    try:
        with urllib.request.urlopen(req, timeout=settings.request_timeout_s) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        # The URL carries no secrets (the key is a header), so it is safe to
        # name the path — that is usually the whole diagnosis.
        raise RestError(f"{method} {path} -> {e.code}: {detail}") from None
    except urllib.error.URLError as e:
        raise RestError(f"{method} {path} unreachable: {e.reason}") from None


def _vector_literal(v: list[float]) -> str:
    """pgvector's text input format. Sent as a string; Postgres casts it."""
    return "[" + ",".join(f"{x:.6f}" for x in v) + "]"


# ── retrieval ───────────────────────────────────────────────────────────


def search(
    query_vector: list[float],
    top_k: int,
    max_distance: float,
    opportunity_id: str | None = None,
) -> list[Passage]:
    rows = _request(
        "POST",
        "rpc/match_rag_chunks",
        {
            "query_embedding": _vector_literal(query_vector),
            "match_count": top_k,
            "max_distance": max_distance,
            "filter_opportunity": opportunity_id,
        },
    )
    return [
        Passage(
            opportunity_id=r["opportunity_id"],
            company=r["company"],
            role=r["role"],
            source_field=r["source_field"],
            chunk_index=r["chunk_index"],
            content=r["content"],
            distance=float(r["distance"]),
            apply_url=r.get("apply_url"),
            source=r["source"],
            suspected_injection=looks_like_injection(r["content"]),
        )
        for r in (rows or [])
    ]


# ── indexing ────────────────────────────────────────────────────────────


def fetch_indexable() -> list[dict]:
    """Approved, unexpired listings — the same visibility rule as `search`."""
    now = urllib.parse.quote(__import__("datetime").datetime.now(
        __import__("datetime").timezone.utc
    ).isoformat())
    rows = _request(
        "GET",
        "opportunities?select=id,description,requirements"
        "&status=eq.approved"
        f"&or=(expires_at.is.null,expires_at.gt.{now})"
        "&order=id",
    )
    return rows or []


def existing_hashes() -> dict[tuple[str, str], str]:
    settings = get_settings()
    model = urllib.parse.quote(settings.embedding_model)
    rows = _request(
        "GET",
        f"rag_chunks?select=opportunity_id,source_field,content_hash&embedding_model=eq.{model}",
    )
    return {
        (r["opportunity_id"], r["source_field"]): r["content_hash"]
        for r in (rows or [])
    }


def replace_field_chunks(
    opportunity_id: str,
    source_field: str,
    chunks: list,
    vectors: list[list[float]],
    model: str,
) -> None:
    """Delete then insert.

    NOT atomic here — PostgREST has no transaction across two requests, unlike
    the direct-Postgres store. The failure window is small and self-healing: an
    interrupted run leaves that field with no chunks, and the next reindex sees
    a missing hash and rewrites it. Worth stating rather than implying.
    """
    _request(
        "DELETE",
        f"rag_chunks?opportunity_id=eq.{opportunity_id}&source_field=eq.{source_field}",
    )
    if not chunks:
        return
    _request(
        "POST",
        "rag_chunks",
        [
            {
                "opportunity_id": c.opportunity_id,
                "source_field": c.source_field,
                "chunk_index": c.chunk_index,
                "content": c.content,
                "embedding": _vector_literal(v),
                "embedding_model": model,
                "content_hash": c.content_hash,
            }
            for c, v in zip(chunks, vectors)
        ],
    )


def delete_orphans() -> int:
    """Drop chunks whose listing is no longer visible.

    Two steps rather than the direct store's single `not exists` DELETE:
    PostgREST cannot express a correlated subquery, so the visible set is
    fetched and the complement removed.
    """
    now = __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc
    ).isoformat()
    visible = _request(
        "GET",
        "opportunities?select=id&status=eq.approved"
        f"&or=(expires_at.is.null,expires_at.gt.{urllib.parse.quote(now)})",
    ) or []
    visible_ids = {r["id"] for r in visible}

    indexed = _request("GET", "rag_chunks?select=opportunity_id") or []
    stale = {r["opportunity_id"] for r in indexed} - visible_ids
    for opp in stale:
        _request("DELETE", f"rag_chunks?opportunity_id=eq.{opp}")
    return len(stale)
