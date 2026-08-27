"""Turn a listing's free text into retrievable chunks with metadata.

Deliberately narrow: only `description` and `requirements` are chunked.
Structured fields (deadline, stipend, eligibility rules) are NOT embedded —
they are already queryable exactly, and answering "when does it close?" from a
fuzzy nearest-neighbour match instead of the `deadline` column is precisely how
a confident wrong date reaches a student.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Literal

from langchain_text_splitters import RecursiveCharacterTextSplitter

SourceField = Literal["description", "requirements"]

# ~900 characters is roughly a long paragraph: big enough that a requirement
# and its qualifier ("3+ years — internships count") stay together, small
# enough that a citation points at something a person can actually check.
CHUNK_SIZE = 900
CHUNK_OVERLAP = 150

# Below this, a "chunk" is a fragment like a lone heading — retrievable noise
# that dilutes the context window without supporting any claim.
MIN_CHUNK_CHARS = 80


@dataclass(frozen=True)
class Chunk:
    opportunity_id: str
    source_field: SourceField
    chunk_index: int
    content: str
    content_hash: str


_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    # Prefer paragraph, then line, then sentence, then word boundaries, so a
    # split lands somewhere a human would also break.
    separators=["\n\n", "\n", ". ", " ", ""],
    length_function=len,
)


def normalize(text: str) -> str:
    """Collapse the whitespace noise that survives HTML-to-text conversion.

    Job boards emit runs of blank lines, non-breaking spaces and stray
    carriage returns. Left alone these inflate chunk counts and make the
    content hash change when nothing meaningful did, which defeats the
    skip-unchanged path in the indexer.
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def content_hash(text: str) -> str:
    """Stable hash of the *normalized* source text.

    Hashing after normalization is the point: a board that reflows its
    whitespace should not force a re-embed of every chunk.
    """
    return hashlib.sha256(normalize(text).encode("utf-8")).hexdigest()


def chunk_field(
    opportunity_id: str, source_field: SourceField, text: str | None
) -> list[Chunk]:
    """Split one field into chunks. Returns [] for empty or absent text.

    Returning [] rather than raising matters: most listings publish no
    description at all (job boards vary wildly), and that is an ordinary
    condition the pipeline handles by abstaining — not an error.
    """
    if not text:
        return []

    normalized = normalize(text)
    if len(normalized) < MIN_CHUNK_CHARS:
        return []

    digest = content_hash(normalized)
    pieces = [p.strip() for p in _splitter.split_text(normalized)]

    chunks: list[Chunk] = []
    for piece in pieces:
        if len(piece) < MIN_CHUNK_CHARS:
            continue
        chunks.append(
            Chunk(
                opportunity_id=opportunity_id,
                source_field=source_field,
                # Index over KEPT chunks, so indexes are contiguous and a
                # citation's "passage 3 of 5" means what it says.
                chunk_index=len(chunks),
                content=piece,
                content_hash=digest,
            )
        )
    return chunks


def chunk_opportunity(
    opportunity_id: str, description: str | None, requirements: str | None
) -> list[Chunk]:
    """All chunks for one listing, description first."""
    return [
        *chunk_field(opportunity_id, "description", description),
        *chunk_field(opportunity_id, "requirements", requirements),
    ]
