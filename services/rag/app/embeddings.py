"""Embedding provider.

Only `local` is implemented, and that is a deliberate product decision rather
than a placeholder: fastembed runs a real ONNX model (BAAI/bge-small-en-v1.5)
in-process, so the retrieval half of this service needs no third-party
credential and can be run and verified by anyone who clones the repo. A hosted
provider is a better choice at scale; it plugs in at `get_embedder`.

The model loads lazily and once. Loading it at import time would make every
`pytest` collection and every `--help` pay for a model load.
"""

from __future__ import annotations

import threading
from typing import Protocol

from .config import EMBEDDING_DIM, get_settings


class Embedder(Protocol):
    model_name: str

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class LocalEmbedder:
    """fastembed / ONNX, in-process, no network at inference time.

    Note the asymmetry between the two methods: bge models are trained with a
    query prefix, and retrieval quality drops measurably if a question is
    embedded the same way as a document. `query_embed` applies it; `embed`
    does not.
    """

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._model = None
        self._lock = threading.Lock()

    def _ensure(self):
        # Double-checked under a lock: uvicorn serves requests on a thread
        # pool, and two concurrent first-requests would otherwise each pay for
        # a model load.
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from fastembed import TextEmbedding

                    self._model = TextEmbedding(model_name=self.model_name)
        return self._model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._ensure()
        vectors = [list(map(float, v)) for v in model.embed(texts)]
        _assert_width(vectors)
        return vectors

    def embed_query(self, text: str) -> list[float]:
        model = self._ensure()
        vectors = [list(map(float, v)) for v in model.query_embed([text])]
        _assert_width(vectors)
        return vectors[0]


def _assert_width(vectors: list[list[float]]) -> None:
    """Fail loudly on a width mismatch.

    pgvector would reject the insert anyway, but the error it raises names a
    column, not a model. Catching it here says which one is wrong.
    """
    for v in vectors:
        if len(v) != EMBEDDING_DIM:
            raise RuntimeError(
                f"Embedding model returned {len(v)} dimensions, but "
                f"public.rag_chunks.embedding is vector({EMBEDDING_DIM}). "
                "Changing the model width requires a migration."
            )


_embedder: Embedder | None = None
_embedder_lock = threading.Lock()


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        with _embedder_lock:
            if _embedder is None:
                settings = get_settings()
                if settings.embedding_provider == "local":
                    _embedder = LocalEmbedder(settings.embedding_model)
                else:  # pragma: no cover - guarded by the Literal type
                    raise RuntimeError(
                        f"Unsupported EMBEDDING_PROVIDER "
                        f"{settings.embedding_provider!r}"
                    )
    return _embedder
