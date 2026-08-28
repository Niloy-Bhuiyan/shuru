"""Test isolation from the developer's local environment.

`Settings` reads `env_file=".env"` so the service can be configured normally.
That is right for the app and wrong for tests: the moment someone creates a
real `services/rag/.env`, every test asserting "behaviour when X is unset"
starts reading X from that file and silently changes meaning.

This bit us for real. After writing a `.env` to index the corpus,
`test_an_unset_token_refuses_rather_than_running_open` began failing with
401 instead of 503 — not because the code regressed, but because the test's
`monkeypatch.delenv` was being undone by the file underneath it.

Disabling the env file for the whole test session makes the suite depend only
on what each test sets explicitly, which is the only way "unset" can mean
anything.
"""

from __future__ import annotations

import pytest

from app.config import Settings, get_settings


@pytest.fixture(autouse=True, scope="session")
def _ignore_local_env_file() -> None:
    Settings.model_config["env_file"] = None


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    """`get_settings` is lru_cached, so a stale instance would leak between
    tests that set different variables."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
