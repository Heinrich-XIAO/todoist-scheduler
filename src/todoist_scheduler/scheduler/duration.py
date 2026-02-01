from __future__ import annotations

import re
from typing import Optional, Tuple

from todoist_scheduler.integrations.openrouter import estimate_minutes
from todoist_scheduler.scheduler.constants import (
    DEFAULT_DURATION,
    INTERVAL_MINUTES,
    MIN_DURATION,
)


class TaskDurationEstimator:
    """Estimate task duration.

    Order:
    1) user duration marker in description (e.g. 25m)
    2) OpenRouter AI (if configured)
    3) simple keyword heuristics
    """

    DURATION_PATTERN = re.compile(r"(\d+)m\b")

    QUICK_KEYWORDS = [
        "check",
        "quick",
        "brief",
        "short",
        "email",
        "text",
        "call",
        "review",
        "confirm",
        "verify",
        "remind",
        "note",
        "list",
    ]
    MEDIUM_KEYWORDS = [
        "read",
        "watch",
        "install",
        "setup",
        "configure",
        "update",
        "change",
        "cancel",
        "make",
        "create",
        "write",
    ]
    LONG_KEYWORDS = [
        "build",
        "develop",
        "implement",
        "research",
        "study",
        "learn",
        "clean",
        "organize",
        "project",
        "essay",
    ]

    DURATIONS = {"quick": 10, "medium": 25, "long": 45, "default": DEFAULT_DURATION}

    @classmethod
    def parse_duration_from_description(cls, description: str) -> Optional[int]:
        if not description:
            return None

        matches = cls.DURATION_PATTERN.findall(description)
        if not matches:
            return None

        minutes = int(matches[-1])
        rounded = round(minutes / INTERVAL_MINUTES) * INTERVAL_MINUTES
        return max(MIN_DURATION, rounded)

    @classmethod
    def add_duration_to_description(cls, description: str, duration: int) -> str:
        if not description:
            return f"{duration}m"

        if cls.DURATION_PATTERN.search(description):
            return cls.DURATION_PATTERN.sub(f"{duration}m", description, count=1)
        return f"{description} {duration}m".strip()

    @classmethod
    def estimate_heuristic(cls, content: str, description: str = "") -> int:
        text = (content + " " + description).lower()
        if any(kw in text for kw in cls.QUICK_KEYWORDS):
            return cls.DURATIONS["quick"]
        if any(kw in text for kw in cls.MEDIUM_KEYWORDS):
            return cls.DURATIONS["medium"]
        if any(kw in text for kw in cls.LONG_KEYWORDS):
            return cls.DURATIONS["long"]
        return cls.DURATIONS["default"]

    @classmethod
    def estimate_with_ai(cls, content: str, description: str = "") -> Optional[int]:
        return estimate_minutes(
            task=content,
            description=description,
            interval_minutes=INTERVAL_MINUTES,
            min_minutes=MIN_DURATION,
        )

    @classmethod
    def estimate(cls, content: str, description: str = "") -> Tuple[int, bool]:
        user_duration = cls.parse_duration_from_description(description)
        if user_duration is not None:
            return user_duration, True

        ai_estimate = cls.estimate_with_ai(content, description)
        if ai_estimate is not None:
            return ai_estimate, False

        return cls.estimate_heuristic(content, description), False
