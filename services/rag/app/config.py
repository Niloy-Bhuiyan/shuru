"""Environment-driven configuration, validated at import time.

The rule this module exists to enforce: a misconfigured deployment must fail
loudly at startup with an actionable message, never at the first user request
with a stack trace — and never by quietly degrading into something that
answers anyway.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The vector column in migration 0013 is declared vector(384). A model of any
# other width would produce rows that are accepted by pgvector's type check
# only if they match — so a mismatch is a startup error, not a runtime
# surprise. Changing the model width is a migration.
EMBEDDING_DIM = 384

# Model -> dimension, for the providers this service knows how to run.
KNOWN_EMBEDDING_MODELS: dict[str, int] = {
    "BAAI/bge-small-en-v1.5": 384,
    "sentence-transformers/all-MiniLM-L6-v2": 384,
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── database ────────────────────────────────────────────────────────
    # The same Supabase Postgres the web app uses. Service-role connection:
    # the indexer writes rag_chunks, which has no write policy by design.
    database_url: str = Field(
        default="",
        description="Postgres URI. Supabase -> Project Settings -> Database -> URI.",
    )

    # ── auth ────────────────────────────────────────────────────────────
    # Shared secret for the Next.js app -> this service hop. Server-to-server
    # only; it is never sent to a browser.
    service_token: str = Field(default="")

    # ── embeddings ──────────────────────────────────────────────────────
    embedding_provider: Literal["local"] = Field(
        default="local",
        description=(
            "Only 'local' is implemented. It runs a real ONNX model in-process "
            "(no API key). Hosted providers plug in at embeddings.py."
        ),
    )
    embedding_model: str = Field(default="BAAI/bge-small-en-v1.5")

    # ── answer generation ───────────────────────────────────────────────
    anthropic_api_key: str = Field(default="")
    anthropic_model: str = Field(default="claude-opus-5")

    # ── retrieval behaviour ─────────────────────────────────────────────
    # How many chunks to pull before grading.
    retrieval_top_k: int = Field(default=8, ge=1, le=50)

    # Cosine distance above which a chunk is not considered related at all.
    # pgvector's <=> returns distance (0 = identical), so this is an upper
    # bound. Tuned against the live corpus; see tests/test_retrieval.py.
    max_cosine_distance: float = Field(default=0.75, ge=0.0, le=2.0)

    # Below this many surviving chunks, the pipeline abstains rather than
    # answering from thin evidence. This is the knob that implements Shuru's
    # core rule inside the RAG pipeline.
    min_chunks_to_answer: int = Field(default=1, ge=1)

    # ── cost and safety controls ────────────────────────────────────────
    max_question_chars: int = Field(default=500, ge=1)
    max_context_chars: int = Field(default=12_000, ge=1000)
    answer_max_tokens: int = Field(default=4096, ge=256)
    request_timeout_s: float = Field(default=30.0, gt=0)

    # Per-user daily cap on generated answers. A cost seatbelt, not a security
    # boundary — see the note in app/ratelimit.py.
    daily_answer_limit: int = Field(default=30, ge=1)

    @field_validator("embedding_model")
    @classmethod
    def _known_width(cls, v: str) -> str:
        dim = KNOWN_EMBEDDING_MODELS.get(v)
        if dim is None:
            raise ValueError(
                f"Unknown embedding model {v!r}. Known: "
                f"{', '.join(sorted(KNOWN_EMBEDDING_MODELS))}. "
                "Add it to KNOWN_EMBEDDING_MODELS with its dimension first."
            )
        if dim != EMBEDDING_DIM:
            raise ValueError(
                f"Model {v!r} emits {dim}-dim vectors but public.rag_chunks.embedding "
                f"is vector({EMBEDDING_DIM}). Changing the model width needs a "
                "migration, not a config change."
            )
        return v

    # ── readiness ───────────────────────────────────────────────────────

    def missing_for_retrieval(self) -> list[str]:
        """Env vars needed to search the index at all."""
        missing = []
        if not self.database_url:
            missing.append("SHURU_RAG_DATABASE_URL")
        if not self.service_token:
            missing.append("SHURU_RAG_SERVICE_TOKEN")
        return missing

    def missing_for_answers(self) -> list[str]:
        """Extra env vars needed to generate a written answer.

        Retrieval works without a generation key — the service still returns
        the passages and their citations. It just will not write prose over
        them, and says so, rather than pretending the feature is present.
        """
        missing = self.missing_for_retrieval()
        if not self.anthropic_api_key:
            missing.append("SHURU_RAG_ANTHROPIC_API_KEY")
        return missing


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings.

    Env prefix is SHURU_RAG_ so this service's variables can never be confused
    with the web app's (both read ANTHROPIC_* style names otherwise).
    """
    return Settings(_env_prefix="SHURU_RAG_")  # type: ignore[call-arg]
