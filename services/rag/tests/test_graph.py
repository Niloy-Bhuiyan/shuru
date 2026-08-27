"""The pipeline's refusal behaviour.

These are the tests that matter most in this service. Shuru's product rule is
that it never manufactures confidence the evidence does not support, and in a
RAG pipeline the pressure is always toward answering anyway. Each test below
pins one way the pipeline is required to decline.
"""

from __future__ import annotations

import pytest

from app import graph as G
from app.db import Passage
from app.graph import AbstainReason, _build_context, _citations, grade, verify_grounding


def passage(
    content: str = "You will write Python and SQL.",
    distance: float = 0.2,
    opportunity_id: str = "opp-1",
    company: str = "Notion",
    role: str = "SWE Intern",
    suspected_injection: bool = False,
) -> Passage:
    return Passage(
        opportunity_id=opportunity_id,
        company=company,
        role=role,
        source_field="description",
        chunk_index=0,
        content=content,
        distance=distance,
        apply_url="https://example.com/apply",
        source="ashby",
        suspected_injection=suspected_injection,
    )


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    """Deterministic thresholds, independent of the environment."""
    from app.config import Settings, get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("SHURU_RAG_MAX_COSINE_DISTANCE", "0.75")
    monkeypatch.setenv("SHURU_RAG_MIN_CHUNKS_TO_ANSWER", "1")
    monkeypatch.setenv("SHURU_RAG_MAX_CONTEXT_CHARS", "1000")
    monkeypatch.delenv("SHURU_RAG_ANTHROPIC_API_KEY", raising=False)
    yield
    get_settings.cache_clear()


class TestGrade:
    def test_keeps_close_passages(self):
        out = grade({"passages": [passage(distance=0.1), passage(distance=0.7)]})
        assert len(out["passages"]) == 2

    def test_drops_passages_past_the_distance_bound(self):
        # Without this bound the nearest chunk always wins no matter how
        # unrelated, and the pipeline could never honestly abstain.
        out = grade({"passages": [passage(distance=0.1), passage(distance=0.95)]})
        assert len(out["passages"]) == 1


class TestBuildContext:
    def test_numbers_passages_from_one(self):
        ctx, used = _build_context([passage(), passage()], max_chars=10_000)
        assert "[1]" in ctx and "[2]" in ctx
        assert len(used) == 2

    def test_fences_every_passage(self):
        ctx, _ = _build_context([passage()], max_chars=10_000)
        assert ctx.count("<<<SHURU_DOCUMENT>>>") == 1
        assert ctx.count("<<<END_SHURU_DOCUMENT>>>") == 1

    def test_returns_only_the_passages_that_fit(self):
        # Citations must list what the model was actually shown. Citing a
        # source that was trimmed out of the prompt is a fabricated citation.
        long = passage(content="x" * 800)
        ctx, used = _build_context([long, long, long], max_chars=1000)
        assert len(used) == 1
        assert ctx.count("<<<SHURU_DOCUMENT>>>") == 1

    def test_always_includes_at_least_one_passage(self):
        _, used = _build_context([passage(content="y" * 5000)], max_chars=100)
        assert len(used) == 1


class TestGenerateWithoutProvider:
    def test_abstains_with_the_exact_reason(self):
        # Retrieval succeeded; only the writing step is unavailable. The
        # feature degrades to "here are the sources", never to invented prose.
        out = G.generate({"question": "python?", "passages": [passage()]})
        assert out["abstained"] is True
        assert out["abstain_reason"] == AbstainReason.NO_PROVIDER
        assert out["answer"] == ""

    def test_still_returns_the_citations(self):
        out = G.generate({"question": "python?", "passages": [passage()]})
        assert len(out["citations"]) == 1
        assert out["citations"][0]["company"] == "Notion"


class TestVerifyGrounding:
    def test_accepts_an_answer_that_cites(self):
        out = verify_grounding(
            {"answer": "The role asks for Python [1].", "citations": _citations([passage()])}
        )
        assert not out.get("abstained")

    def test_rejects_an_answer_with_no_citation_at_all(self):
        # The failure that actually happens: a fluent paragraph with no
        # bracketed reference, because the passages did not really cover it.
        out = verify_grounding(
            {
                "answer": "This role is a great fit for you and you should apply.",
                "citations": _citations([passage()]),
            }
        )
        assert out["abstained"] is True
        assert out["abstain_reason"] == AbstainReason.UNGROUNDED
        assert out["answer"] == ""

    def test_rejects_a_citation_that_points_at_nothing(self):
        out = verify_grounding(
            {"answer": "It requires Go [7].", "citations": _citations([passage()])}
        )
        assert out["abstained"] is True

    def test_rejects_an_empty_answer(self):
        out = verify_grounding({"answer": "", "citations": _citations([passage()])})
        assert out["abstained"] is True

    def test_drops_citations_the_answer_did_not_use(self):
        # Listing a source implies it backed something. It must not appear if
        # the answer never referenced it.
        out = verify_grounding(
            {
                "answer": "Python is required [1].",
                "citations": _citations([passage(), passage(company="Replit")]),
            }
        )
        assert [c["n"] for c in out["citations"]] == [1]

    def test_passes_an_already_abstained_state_through(self):
        out = verify_grounding(
            {"abstained": True, "abstain_reason": AbstainReason.NO_PROVIDER}
        )
        assert out == {}


class TestRouting:
    def test_no_surviving_passages_routes_to_abstain(self):
        assert G._after_grade({"passages": []}) == "abstain"

    def test_surviving_passages_route_to_generate(self):
        assert G._after_grade({"passages": [passage()]}) == "generate"

    def test_ungrounded_routes_to_abstain(self):
        assert G._after_verify({"abstained": True}) == "abstain"


class TestCitations:
    def test_carries_everything_needed_to_check_a_claim(self):
        c = _citations([passage()])[0]
        # A citation a student cannot follow is not a citation.
        for field in ("opportunity_id", "company", "role", "source_field", "excerpt"):
            assert c[field]
        assert c["n"] == 1

    def test_surfaces_the_injection_flag(self):
        c = _citations([passage(suspected_injection=True)])[0]
        assert c["suspected_injection"] is True


class TestFullGraphAbstains:
    def test_a_question_with_no_matching_sources_abstains(self, monkeypatch):
        """End to end through the compiled graph, with retrieval stubbed."""
        monkeypatch.setattr(G, "search", lambda *a, **k: [])
        monkeypatch.setattr(
            G, "get_embedder", lambda: type("E", (), {"embed_query": lambda s, t: [0.0] * 384})()
        )
        result = G.build_graph().invoke({"question": "is there a marketing role?"})
        assert result["abstained"] is True
        assert result["abstain_reason"] == AbstainReason.NO_MATCHES
        assert result["answer"] == ""
