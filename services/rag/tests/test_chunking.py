from app.chunking import (
    MIN_CHUNK_CHARS,
    Chunk,
    chunk_field,
    chunk_opportunity,
    content_hash,
    normalize,
)

OPP = "11111111-1111-4111-8111-000000000001"


class TestNormalize:
    def test_collapses_the_whitespace_html_conversion_leaves_behind(self):
        assert normalize("a  \t b") == "a b"
        assert normalize("a\r\nb") == "a\nb"
        assert normalize("a\n\n\n\n\nb") == "a\n\nb"
        assert normalize("a\xa0b") == "a b"

    def test_trims(self):
        assert normalize("  hello  ") == "hello"


class TestContentHash:
    def test_is_stable_across_whitespace_reflow(self):
        # The whole point: a board that reflows its markup must not force a
        # re-embed of every chunk.
        a = "We are hiring an   intern.\r\n\r\n\r\nApply now."
        b = "We are hiring an intern.\n\nApply now."
        assert content_hash(a) == content_hash(b)

    def test_changes_when_the_words_change(self):
        assert content_hash("hiring an intern") != content_hash("hiring a manager")


class TestChunkField:
    def test_returns_nothing_for_absent_text(self):
        # Most listings publish no description at all. That is an ordinary
        # condition the pipeline answers by abstaining, not an error.
        assert chunk_field(OPP, "description", None) == []
        assert chunk_field(OPP, "description", "") == []

    def test_returns_nothing_for_a_fragment(self):
        assert chunk_field(OPP, "description", "Apply now") == []

    def test_chunks_real_prose(self):
        text = "We are hiring a backend intern. " * 100
        chunks = chunk_field(OPP, "description", text)
        assert len(chunks) > 1
        assert all(isinstance(c, Chunk) for c in chunks)
        assert all(len(c.content) >= MIN_CHUNK_CHARS for c in chunks)

    def test_chunk_indexes_are_contiguous_from_zero(self):
        # A citation that says "passage 3" must mean the third kept passage.
        # If indexes were assigned before the short-chunk filter, they would
        # have holes and the label would be a lie.
        text = "Requirements include Python, SQL and communication skills. " * 60
        chunks = chunk_field(OPP, "requirements", text)
        assert [c.chunk_index for c in chunks] == list(range(len(chunks)))

    def test_every_chunk_of_a_field_shares_the_field_hash(self):
        text = "We are hiring a backend intern with Python experience. " * 60
        chunks = chunk_field(OPP, "description", text)
        assert len({c.content_hash for c in chunks}) == 1

    def test_carries_its_field_and_opportunity(self):
        text = "We are hiring a backend intern with Python experience. " * 40
        chunks = chunk_field(OPP, "requirements", text)
        assert all(c.opportunity_id == OPP for c in chunks)
        assert all(c.source_field == "requirements" for c in chunks)


class TestChunkOpportunity:
    def test_description_comes_before_requirements(self):
        d = "About the role. We build developer tools for the web. " * 40
        r = "You should know Python, SQL and version control. " * 40
        chunks = chunk_opportunity(OPP, d, r)
        fields = [c.source_field for c in chunks]
        assert "description" in fields and "requirements" in fields
        assert fields.index("description") < fields.index("requirements")

    def test_handles_a_listing_with_neither_field(self):
        assert chunk_opportunity(OPP, None, None) == []
