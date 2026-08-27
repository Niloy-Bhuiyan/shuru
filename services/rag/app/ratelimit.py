"""Per-user daily cap on generated answers.

A COST SEATBELT, NOT A SECURITY BOUNDARY. The counter lives in process memory,
so a multi-instance deployment gets one counter per instance and the effective
limit scales with instance count. That is the same trade the web app makes for
its agent cap, documented the same way, and it is stated here so nobody later
mistakes this for an abuse control.

If a hard global limit is ever needed, back it with a Postgres table — the
database is already a dependency.
"""

from __future__ import annotations

import threading
from datetime import date

# Bounds a flood of distinct user ids in one day. Well above any plausible
# real user count for this service; the point is that the map cannot grow
# without limit.
_MAX_KEYS = 10_000

_lock = threading.Lock()
_day: date | None = None
_counts: dict[str, int] = {}


def check_and_increment(user_id: str, limit: int) -> tuple[bool, int]:
    """Returns (allowed, remaining_after_this_call)."""
    global _day, _counts

    today = date.today()
    with _lock:
        if _day != today:
            # Whole-map reset on the day boundary; no per-key expiry to leak.
            _day = today
            _counts = {}

        used = _counts.get(user_id, 0)
        if used >= limit:
            return False, 0

        if user_id not in _counts and len(_counts) >= _MAX_KEYS:
            # Refuse rather than grow unboundedly. Reached only under a flood
            # of distinct ids, which is itself the thing worth stopping.
            return False, 0

        _counts[user_id] = used + 1
        return True, limit - (used + 1)


def _reset_for_tests() -> None:
    global _day, _counts
    with _lock:
        _day = None
        _counts = {}
