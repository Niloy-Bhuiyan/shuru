"""FastAPI surface for the Shuru retrieval service.

Called server-to-server by the Next.js app, never by a browser. Authentication
is a shared bearer token; the caller passes the end user's id so the daily cap
can be applied per student.

Every endpoint that can be unavailable says so explicitly with the exact
environment variable that is missing, rather than 500-ing or — worse —
answering from a degraded path.
"""

from __future__ import annotations

import logging
import time
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import ratelimit
from .config import get_settings
from .graph import AbstainReason, get_graph
from .security import secrets_match

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
log = logging.getLogger("shuru.rag")

app = FastAPI(
    title="Shuru retrieval service",
    description=(
        "Answers questions about internship listings using only the text those "
        "listings publish, with a citation for every claim — and abstains when "
        "the sources do not support an answer."
    ),
    version="1.0.0",
)


# ── auth ────────────────────────────────────────────────────────────────


async def require_service_token(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    settings = get_settings()

    # An unset token must never mean "open". This service can spend money and
    # reads the listings corpus; refusing is the only safe default.
    if not settings.service_token:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "service_not_configured",
                "missing": ["SHURU_RAG_SERVICE_TOKEN"],
            },
        )

    presented = ""
    if authorization and authorization.lower().startswith("bearer "):
        presented = authorization[7:].strip()

    if not secrets_match(presented, settings.service_token):
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})


# ── schemas ─────────────────────────────────────────────────────────────


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    # Supplied by the Next.js app from the verified session. This service
    # never sees the user's JWT and does not need to: the corpus is the public
    # listing set, and the id is only used for the per-user daily cap.
    user_id: str = Field(min_length=1, max_length=128)


class Citation(BaseModel):
    n: int
    opportunity_id: str
    company: str
    role: str
    source_field: str
    chunk_index: int
    source: str
    apply_url: str | None = None
    excerpt: str
    distance: float
    suspected_injection: bool


class AskResponse(BaseModel):
    answer: str
    abstained: bool
    abstain_reason: str | None = None
    citations: list[Citation]
    took_ms: int


# ── endpoints ───────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    """Liveness only. Deliberately unauthenticated and deliberately empty.

    It reports nothing about configuration: an unauthenticated endpoint that
    listed which providers are set would tell a stranger exactly what this
    deployment runs. Configuration lives on /ready, behind the token.
    """
    return {"status": "ok"}


@app.get("/ready", dependencies=[Depends(require_service_token)])
async def ready() -> dict:
    """Operator view: what is configured and what is missing, by exact name."""
    settings = get_settings()
    missing_retrieval = settings.missing_for_retrieval()
    missing_answers = settings.missing_for_answers()

    return {
        "retrieval": {
            "available": not missing_retrieval,
            "missing": missing_retrieval,
        },
        "answers": {
            "available": not missing_answers,
            "missing": missing_answers,
            # Stated plainly so an operator is never surprised that retrieval
            # works and prose does not.
            "note": (
                "Retrieval returns cited passages without a generation key. "
                "Only the written answer needs one."
            ),
        },
        "embedding_model": settings.embedding_model,
        "answer_model": settings.anthropic_model,
    }


@app.post(
    "/ask",
    response_model=AskResponse,
    dependencies=[Depends(require_service_token)],
)
async def ask(req: AskRequest) -> AskResponse:
    settings = get_settings()

    missing = settings.missing_for_retrieval()
    if missing:
        raise HTTPException(
            status_code=503,
            detail={"error": "retrieval_not_configured", "missing": missing},
        )

    allowed, remaining = ratelimit.check_and_increment(
        req.user_id, settings.daily_answer_limit
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "daily_limit_reached",
                "limit": settings.daily_answer_limit,
            },
        )

    started = time.perf_counter()
    try:
        result = get_graph().invoke(
            {"question": req.question, "user_id": req.user_id}
        )
    except Exception:
        # Never leak an internal message to the caller; it can quote the
        # prompt or the connection string back.
        log.exception("ask pipeline failed")
        raise HTTPException(
            status_code=502, detail={"error": "pipeline_failed"}
        ) from None

    took_ms = int((time.perf_counter() - started) * 1000)

    log.info(
        "ask completed",
        extra={
            "abstained": bool(result.get("abstained")),
            "reason": result.get("abstain_reason"),
            "citations": len(result.get("citations", [])),
            "took_ms": took_ms,
            "remaining_today": remaining,
        },
    )

    return AskResponse(
        answer=result.get("answer", ""),
        abstained=bool(result.get("abstained")),
        abstain_reason=result.get("abstain_reason"),
        citations=[Citation(**c) for c in result.get("citations", [])],
        took_ms=took_ms,
    )


@app.post("/reindex", dependencies=[Depends(require_service_token)])
async def reindex_endpoint(force: bool = False) -> dict:
    """Rebuild the index from the listings table. Safe to re-run."""
    from .db import reindex

    settings = get_settings()
    missing = settings.missing_for_retrieval()
    if missing:
        raise HTTPException(
            status_code=503,
            detail={"error": "retrieval_not_configured", "missing": missing},
        )

    started = time.perf_counter()
    report = reindex(force=force)
    took_ms = int((time.perf_counter() - started) * 1000)
    log.info("reindex completed", extra={**report.as_dict(), "took_ms": took_ms})
    return {**report.as_dict(), "took_ms": took_ms}


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, dict) else {"error": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=detail)
