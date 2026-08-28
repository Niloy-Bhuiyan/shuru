"""The abstention threshold, and why it is the number it is.

`max_cosine_distance` is the single knob that decides when the pipeline says
"nothing relevant" instead of answering. It shipped at 0.75 in the first draft
and that was wrong in a way no unit test would have caught, because nothing
was measured against a real corpus.

These tests do not need a database. They pin the *decision* — the recorded
measurement and the rule derived from it — so that changing the threshold
without re-measuring fails loudly.
"""

from __future__ import annotations

import pytest

from app.config import Settings, get_settings
from app.graph import _after_grade, grade
from tests.test_graph import passage

# ── the measurement ─────────────────────────────────────────────────────
#
# Taken against the live corpus on 2026-08-28: 27 chunks across the 5 listings
# that publish description text. Best (smallest) distance per question.
#
# Reproduce with the recipe in services/rag/README.md.

ON_TOPIC = {
    "does this role require python?": 0.239,
    "do they want machine learning experience?": 0.255,
    "what programming languages are mentioned?": 0.323,
    "what degree or education do they ask for?": 0.331,
    "when does the internship start?": 0.361,
    "is prior internship experience required?": 0.385,
}

OFF_TOPIC = {
    "what is the weather in dhaka today?": 0.598,
    "how do I cook biryani": 0.532,
    "what is the capital of France": 0.534,
    "my laptop battery is not charging": 0.548,
    "recommend a good movie to watch tonight": 0.569,
    "what time does the bus to chittagong leave": 0.587,
}


class TestRecordedSeparation:
    def test_on_topic_and_off_topic_do_not_overlap(self):
        # If this ever fails, the corpus has changed character and the
        # threshold must be re-measured rather than nudged.
        assert max(ON_TOPIC.values()) < min(OFF_TOPIC.values())

    def test_the_gap_is_wide_enough_to_place_a_threshold_in(self):
        gap = min(OFF_TOPIC.values()) - max(ON_TOPIC.values())
        assert gap > 0.1, f"only {gap:.3f} of separation — the gate is fragile"


class TestConfiguredThreshold:
    def test_sits_inside_the_measured_gap(self):
        threshold = Settings().max_cosine_distance
        assert max(ON_TOPIC.values()) < threshold < min(OFF_TOPIC.values()), (
            f"max_cosine_distance={threshold} is outside the measured gap "
            f"({max(ON_TOPIC.values())}, {min(OFF_TOPIC.values())}). "
            "Re-measure against the live corpus before changing it."
        )

    def test_admits_every_recorded_on_topic_question(self):
        threshold = Settings().max_cosine_distance
        rejected = [q for q, d in ON_TOPIC.items() if d > threshold]
        assert rejected == [], f"these real questions would find nothing: {rejected}"

    def test_rejects_every_recorded_off_topic_question(self):
        # The failure the first draft had: at 0.75 all six of these were
        # admitted, and the model was asked to answer "what is the weather in
        # Dhaka" from a Notion job description.
        threshold = Settings().max_cosine_distance
        admitted = [q for q, d in OFF_TOPIC.items() if d <= threshold]
        assert admitted == [], f"these would be answered from job listings: {admitted}"

    def test_the_old_default_would_fail_this_suite(self):
        # Guards the guard: proves these assertions can actually fail.
        old = 0.75
        admitted = [q for q, d in OFF_TOPIC.items() if d <= old]
        assert len(admitted) == len(OFF_TOPIC)


class TestGradeUsesTheThreshold:
    @pytest.fixture(autouse=True)
    def _clear(self):
        get_settings.cache_clear()
        yield
        get_settings.cache_clear()

    def test_drops_a_passage_beyond_the_threshold(self, monkeypatch):
        monkeypatch.setenv("SHURU_RAG_MAX_COSINE_DISTANCE", "0.46")
        kept = grade({"passages": [passage(distance=0.30), passage(distance=0.60)]})
        assert len(kept["passages"]) == 1

    def test_empty_result_routes_to_abstain(self, monkeypatch):
        monkeypatch.setenv("SHURU_RAG_MAX_COSINE_DISTANCE", "0.46")
        monkeypatch.setenv("SHURU_RAG_MIN_CHUNKS_TO_ANSWER", "1")
        assert _after_grade({"passages": []}) == "abstain"
