"""API surface: the authorization boundary and the honest-unavailability rules."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import ratelimit
from app.config import get_settings

TOKEN = "test-service-token-0123456789"


@pytest.fixture
def client(monkeypatch):
    get_settings.cache_clear()
    ratelimit._reset_for_tests()
    monkeypatch.setenv("SHURU_RAG_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("SHURU_RAG_DATABASE_URL", "postgresql://stub/stub")
    monkeypatch.delenv("SHURU_RAG_ANTHROPIC_API_KEY", raising=False)
    from app.main import app

    yield TestClient(app)
    get_settings.cache_clear()


@pytest.fixture
def unconfigured_client(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.delenv("SHURU_RAG_SERVICE_TOKEN", raising=False)
    monkeypatch.delenv("SHURU_RAG_DATABASE_URL", raising=False)
    from app.main import app

    yield TestClient(app)
    get_settings.cache_clear()


class TestHealth:
    def test_is_open(self, client):
        assert client.get("/health").status_code == 200

    def test_reveals_nothing_about_configuration(self, client):
        # An unauthenticated endpoint listing configured providers would tell
        # a stranger exactly what this deployment runs.
        body = client.get("/health").json()
        assert body == {"status": "ok"}


class TestAuthBoundary:
    @pytest.mark.parametrize("path", ["/ready", "/ask", "/reindex"])
    def test_refuses_without_a_token(self, client, path):
        r = client.request(
            "GET" if path == "/ready" else "POST",
            path,
            json={"question": "q", "user_id": "u"},
        )
        assert r.status_code == 401

    @pytest.mark.parametrize("header", ["", "Bearer ", "Bearer wrong", "Basic " + TOKEN, TOKEN])
    def test_refuses_a_malformed_or_wrong_token(self, client, header):
        r = client.get("/ready", headers={"Authorization": header})
        assert r.status_code == 401

    def test_accepts_the_right_token(self, client):
        r = client.get("/ready", headers={"Authorization": f"Bearer {TOKEN}"})
        assert r.status_code == 200

    def test_an_unset_token_refuses_rather_than_running_open(self, unconfigured_client):
        # The failure mode that matters: a deployment that forgot the variable
        # must not accept everyone.
        r = unconfigured_client.get("/ready", headers={"Authorization": "Bearer anything"})
        assert r.status_code == 503
        assert r.json()["error"] == "service_not_configured"
        assert "SHURU_RAG_SERVICE_TOKEN" in r.json()["missing"]


class TestReady:
    def test_names_the_exact_missing_variable(self, client):
        r = client.get("/ready", headers={"Authorization": f"Bearer {TOKEN}"})
        body = r.json()
        assert body["retrieval"]["available"] is True
        assert body["answers"]["available"] is False
        assert "SHURU_RAG_ANTHROPIC_API_KEY" in body["answers"]["missing"]


class TestAskValidation:
    def auth(self):
        return {"Authorization": f"Bearer {TOKEN}"}

    def test_rejects_an_empty_question(self, client):
        r = client.post("/ask", headers=self.auth(), json={"question": "", "user_id": "u"})
        assert r.status_code == 422

    def test_rejects_a_missing_user_id(self, client):
        r = client.post("/ask", headers=self.auth(), json={"question": "hi"})
        assert r.status_code == 422

    def test_rejects_an_oversized_question(self, client):
        r = client.post(
            "/ask", headers=self.auth(), json={"question": "x" * 5000, "user_id": "u"}
        )
        assert r.status_code == 422


class TestRateLimit:
    def test_allows_up_to_the_limit_then_refuses(self):
        ratelimit._reset_for_tests()
        for i in range(3):
            allowed, remaining = ratelimit.check_and_increment("user-a", limit=3)
            assert allowed, f"call {i} should be allowed"
            assert remaining == 2 - i
        allowed, remaining = ratelimit.check_and_increment("user-a", limit=3)
        assert not allowed
        assert remaining == 0

    def test_counts_per_user(self):
        ratelimit._reset_for_tests()
        ratelimit.check_and_increment("user-a", limit=1)
        allowed, _ = ratelimit.check_and_increment("user-b", limit=1)
        assert allowed, "one user's spend must not consume another's"

    def test_refuses_rather_than_growing_without_bound(self, monkeypatch):
        ratelimit._reset_for_tests()
        monkeypatch.setattr(ratelimit, "_MAX_KEYS", 2)
        assert ratelimit.check_and_increment("a", limit=10)[0]
        assert ratelimit.check_and_increment("b", limit=10)[0]
        # A flood of distinct ids is itself the thing worth stopping.
        assert not ratelimit.check_and_increment("c", limit=10)[0]
