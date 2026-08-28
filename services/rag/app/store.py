"""Picks the storage backend and re-exports one stable interface.

Two ways to reach the same database:

  direct  psycopg over SHURU_RAG_DATABASE_URL — needs the database password.
          Preferred where available: faster, and `replace_field_chunks` is a
          real transaction.
  rest    PostgREST over SHURU_RAG_SUPABASE_URL + service-role key. Needs no
          database password, which matters because that password cannot be
          derived from any other Supabase credential.

Selection is automatic and explicit: a direct URL wins if present, otherwise
the REST pair, otherwise a startup error naming both options. Nothing silently
degrades.
"""

from __future__ import annotations

from .config import get_settings


def backend() -> str:
    s = get_settings()
    if s.database_url:
        return "direct"
    if s.supabase_url and s.supabase_service_key:
        return "rest"
    return "none"


def _impl():
    which = backend()
    if which == "direct":
        from . import db

        return db
    if which == "rest":
        from . import rest_store

        return rest_store
    raise RuntimeError(
        "No storage backend configured. Set EITHER "
        "SHURU_RAG_DATABASE_URL (direct Postgres) OR both "
        "SHURU_RAG_SUPABASE_URL and SHURU_RAG_SUPABASE_SERVICE_KEY (PostgREST)."
    )


def search(*a, **k):
    return _impl().search(*a, **k)


def fetch_indexable():
    return _impl().fetch_indexable()


def existing_hashes():
    return _impl().existing_hashes()


def replace_field_chunks(*a, **k):
    return _impl().replace_field_chunks(*a, **k)


def delete_orphans() -> int:
    return _impl().delete_orphans()
