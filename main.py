"""
Task Updater - Automatically reschedules overdue Todoist tasks.

This script:
1. Reschedules overdue recurring tasks while preserving their patterns
2. Schedules non-recurring overdue tasks with smart duration estimation
3. Avoids time conflicts with recurring tasks and respects sleep/work hours
"""

from todoist_api_python.api import TodoistAPI
import datetime as dt
from pathlib import Path
from dotenv import load_dotenv
from typing import Optional, Tuple, Union
import os
import re
import requests

# Configuration
BASE_DIR = Path(__file__).resolve().parent
_ = load_dotenv(BASE_DIR / ".env.local")

# Time constants
INTERVAL_MINUTES = 5
SLEEP_TIME = dt.time(20, 45)
WEEKDAY_START_HOUR = 15
WEEKEND_START_HOUR = 9
DEFAULT_DURATION = 30
MIN_DURATION = 5


def get_env_var(name: str, required: bool = True) -> Optional[str]:
    """Get environment variable with optional validation."""
    value = os.getenv(name)
    if required and not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


class TaskDurationEstimator:
    """Estimates task duration using AI (OpenRouter/Kimi), heuristics, or user-specified time in description."""

    # Pattern to match duration in description (e.g., "15m", "65m", "120m")
    DURATION_PATTERN = re.compile(r"(\d+)m\b")

    # Keywords for heuristic estimation
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
        """Parse duration from description if user specified it (e.g., '15m', '65m')."""
        if not description:
            return None

        matches = cls.DURATION_PATTERN.findall(description)
        if matches:
            # Use the last match (in case there are multiple)
            minutes = int(matches[-1])
            return max(
                MIN_DURATION, round(minutes / INTERVAL_MINUTES) * INTERVAL_MINUTES
            )
        return None

        matches = cls.DURATION_PATTERN.findall(description)
        if matches:
            # Use the last match (in case there are multiple)
            minutes = int(matches[-1])
            return max(
                MIN_DURATION, round(minutes / INTERVAL_MINUTES) * INTERVAL_MINUTES
            )
        return None

    @classmethod
    def add_duration_to_description(cls, description: str, duration: int) -> str:
        """Add or update duration marker in description."""
        if not description:
            return f"{duration}m"

        # Check if there's already a duration marker
        if cls.DURATION_PATTERN.search(description):
            # Replace existing duration
            return cls.DURATION_PATTERN.sub(f"{duration}m", description, count=1)
        else:
            # Append duration to description
            return f"{description} {duration}m".strip()

    @classmethod
    def estimate_heuristic(cls, content: str, description: str = "") -> int:
        """Estimate duration based on task content keywords."""
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
        """Estimate duration using OpenRouter/Kimi K2.5 API."""
        api_key = get_env_var("OPENROUTER_KEY", required=False)
        if not api_key:
            return None

        prompt = f"""Task: {content}
Description: {description}

Estimate how many minutes this task will take. Reply with ONLY a number (in minutes).
Give a LOW estimate - assume optimal conditions with no interruptions or complications.
It's better to underestimate than overestimate.
Round to the nearest {INTERVAL_MINUTES} minutes. Minimum {MIN_DURATION} minutes."""

        try:
            proxy_url = os.getenv(
                "OPENROUTER_PROXY", "https://openrouter.ai/api/v1"
            ).rstrip("/")
            response = requests.post(
                f"{proxy_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://task-updater.local",
                    "X-Title": "Task Updater",
                },
                json={
                    "model": "moonshotai/kimi-k2-5",
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a task duration estimator. Reply with only a number (minutes).",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 50,
                    "temperature": 0.3,
                },
                timeout=10,
            )
            response.raise_for_status()

            content_text = response.json()["choices"][0]["message"]["content"]
            numbers = re.findall(r"\d+", content_text)

            if numbers:
                minutes = int(numbers[0])
                return max(
                    MIN_DURATION, round(minutes / INTERVAL_MINUTES) * INTERVAL_MINUTES
                )

            return None
        except Exception:
            return None

    @classmethod
    def estimate(cls, content: str, description: str = "") -> Tuple[int, bool]:
        """
        Estimate task duration.

        Returns:
            Tuple of (duration_in_minutes, was_user_specified)
            was_user_specified is True if the duration was parsed from description
        """
        # First, check if user specified duration in description
        user_duration = cls.parse_duration_from_description(description)
        if user_duration is not None:
            print(f"  (Using user-specified duration: {user_duration} minutes)")
            return user_duration, True

        # Try AI estimation
        ai_estimate = cls.estimate_with_ai(content, description)
        if ai_estimate is not None:
            return ai_estimate, False

        # Fall back to heuristics
        heuristic = cls.estimate_heuristic(content, description)
        print(f"  (Using heuristic estimate: {heuristic} minutes)")
        return heuristic, False


class TaskScheduler:
    """Handles task scheduling logic and time slot management."""

    def __init__(self, api: TodoistAPI):
        self.api = api
        self.tasks = []
        self.today = dt.date.today()
        self.blocked_slots = set()
        self.recurring_slots = set()

    def fetch_tasks(self) -> None:
        """Fetch all tasks from Todoist API, filtering out test notification tasks."""
        self.tasks = []
        for page in self.api.get_tasks():
            self.tasks.extend(page)

        # Remove tasks with #testnotification label
        self.tasks = [
            task
            for task in self.tasks
            if not (
                hasattr(task, "labels")
                and task.labels
                and "#testnotification" in task.labels
            )
        ]

    def is_task_completed(self, task) -> bool:
        """Check if a task is completed."""
        if hasattr(task, "is_completed") and task.is_completed:
            return True
        if hasattr(task, "completed_at") and task.completed_at is not None:
            return True
        return False

    def to_datetime(self, d: Union[dt.date, dt.datetime]) -> dt.datetime:
        """Convert date to datetime, preserving time if already a datetime."""
        if isinstance(d, dt.datetime):
            # Already has time, return as-is
            return d
        elif isinstance(d, dt.date):
            # Date only, convert to datetime at midnight
            return dt.datetime.combine(d, dt.time())
        return d

    def get_date(self, due_date) -> dt.date:
        """Extract date from due date which could be date or datetime."""
        if isinstance(due_date, dt.datetime):
            return due_date.date()
        return due_date

    def is_time_blocked(self, datetime: dt.datetime) -> bool:
        """Check if a time is blocked (outside hours, sleep time, or already taken)."""
        if datetime in self.blocked_slots:
            return True

        start_hour = (
            WEEKEND_START_HOUR if datetime.weekday() >= 5 else WEEKDAY_START_HOUR
        )
        if datetime.time() >= SLEEP_TIME or datetime.hour < start_hour:
            return True

        return False

    def build_blocked_times(self) -> None:
        """Build sets of blocked time slots and recurring task slots."""
        self.blocked_slots = set()
        self.recurring_slots = set()

        for task in self.tasks:
            if self.is_task_completed(task):
                continue

            if task.due and task.due.date:
                due = self.to_datetime(task.due.date)
                if due.date() == self.today:
                    # Get duration for this task
                    current_desc = task.description or ""
                    user_duration = (
                        TaskDurationEstimator.parse_duration_from_description(
                            current_desc
                        )
                    )
                    if user_duration is not None:
                        duration = user_duration
                    else:
                        # Try AI estimation first
                        ai_duration = TaskDurationEstimator.estimate_with_ai(
                            task.content, current_desc
                        )
                        if ai_duration is not None:
                            duration = ai_duration
                        else:
                            # Fallback to 10 minutes if no API key or AI fails
                            duration = 10

                    num_blocks = max(
                        1, (duration + INTERVAL_MINUTES - 1) // INTERVAL_MINUTES
                    )

                    # Block all time slots for this task's duration
                    for j in range(num_blocks):
                        block_time = due + dt.timedelta(minutes=INTERVAL_MINUTES * j)
                        self.blocked_slots.add(block_time)
                        if task.due.is_recurring:
                            self.recurring_slots.add(block_time)

    def reschedule_overdue_recurring(self) -> int:
        """Reschedule overdue recurring tasks to today."""
        overdue = [
            task
            for task in self.tasks
            if not self.is_task_completed(task)
            and task.due is not None
            and task.due.is_recurring
            and self.get_date(task.due.date) < self.today
        ]

        print(f"Found {len(overdue)} overdue recurring tasks")

        for task in overdue:
            print(f"\nRescheduling: {task.content} (Priority: {task.priority})")
            print(f"  Was due: {task.due.date}")
            print(f"  Pattern: {task.due.string}")
            self.api.update_task(task.id, due_string=task.due.string)
            print(f"  → Rescheduled to today")

        return len(overdue)

    def is_slot_available(self, time: dt.datetime, num_blocks: int) -> bool:
        """Check if a time slot is available and doesn't conflict with recurring tasks."""
        for j in range(num_blocks):
            check_time = time + dt.timedelta(minutes=INTERVAL_MINUTES * j)
            if self.is_time_blocked(check_time) or check_time in self.recurring_slots:
                return False
        return True

    def find_available_slot(
        self, start_time: dt.datetime, num_blocks: int
    ) -> dt.datetime:
        """Find the next available time slot."""
        time = start_time
        for _ in range(10000):  # Safety limit
            if self.is_slot_available(time, num_blocks):
                return time
            time += dt.timedelta(minutes=INTERVAL_MINUTES)
        raise RuntimeError("Could not find available time slot")

    def block_time_slots(self, start_time: dt.datetime, num_blocks: int) -> None:
        """Block time slots for a scheduled task."""
        for j in range(num_blocks):
            block_time = start_time + dt.timedelta(minutes=INTERVAL_MINUTES * j)
            self.blocked_slots.add(block_time)

    def is_current_slot_valid(self, task, duration: int) -> bool:
        """Check if task's current time slot doesn't violate any rules.

        Only checks for:
        - Time is today or future
        - Within work hours (before sleep time, after start hour)
        - Doesn't conflict with RECURRING tasks only (not other non-recurring tasks)

        NOTE: This intentionally does NOT check against blocked_slots to allow
        tasks to keep their time even when running over the estimated duration.
        """
        if not task.due or not task.due.date:
            return False

        task_due = self.to_datetime(task.due.date)

        # Check if it's today or future (not overdue from previous days)
        if task_due.date() < self.today:
            return False

        # Check all duration blocks
        num_blocks = max(1, (duration + INTERVAL_MINUTES - 1) // INTERVAL_MINUTES)
        for j in range(num_blocks):
            check_time = task_due + dt.timedelta(minutes=INTERVAL_MINUTES * j)

            # Check work hours (don't use is_time_blocked which checks blocked_slots)
            start_hour = (
                WEEKEND_START_HOUR if check_time.weekday() >= 5 else WEEKDAY_START_HOUR
            )
            if check_time.time() >= SLEEP_TIME or check_time.hour < start_hour:
                return False

            # Only check for conflicts with RECURRING tasks, not other non-recurring tasks
            if check_time in self.recurring_slots:
                return False

        return True

    def get_bad_tasks(self) -> list:
        """Get non-recurring tasks that need scheduling.

        Only includes tasks that:
        - Have no due date at all
        - Are from previous days (overdue)
        - Does NOT include tasks scheduled for today that are running over time
        """
        bad_tasks = []

        for task in self.tasks:
            if self.is_task_completed(task):
                continue

            # No due date - needs scheduling
            if task.due is None:
                bad_tasks.append(task)
                continue

            # Recurring tasks are handled separately
            if task.due.is_recurring:
                continue

            task_due = self.to_datetime(task.due.date)

            # Only reschedule if task is from a previous day (actually overdue)
            # Don't reschedule tasks that are simply running over time today
            if task_due.date() < self.today:
                # Task is from yesterday or earlier - needs rescheduling
                bad_tasks.append(task)
            elif task_due.date() == self.today:
                # Task is scheduled for today - check if it has a user-specified duration
                # and if that slot is still valid (doesn't conflict with recurring tasks)
                current_desc = task.description or ""
                user_duration = TaskDurationEstimator.parse_duration_from_description(
                    current_desc
                )

                if user_duration is not None:
                    if self.is_current_slot_valid(task, user_duration):
                        # Valid slot with user-specified duration - skip it
                        print(
                            f"  Skipping '{task.content}' - valid slot today with user-specified {user_duration}m"
                        )
                        continue
                    else:
                        # Slot conflicts with recurring tasks or is outside hours
                        time_str = (
                            task_due.strftime("%H:%M")
                            if hasattr(task_due, "hour")
                            else "today"
                        )
                        print(
                            f"  Rescheduling '{task.content}' - slot conflicts (was {time_str})"
                        )
                        bad_tasks.append(task)
                # If no user-specified duration, let it be - don't reschedule just because it's running late

        return bad_tasks

    def find_gaps_in_schedule(self, start_time: dt.datetime) -> list:
        """Find available time gaps in today's schedule starting from start_time."""
        gaps = []

        # Get end of work day
        start_hour = (
            WEEKEND_START_HOUR if start_time.weekday() >= 5 else WEEKDAY_START_HOUR
        )
        end_of_day = dt.datetime.combine(self.today, SLEEP_TIME)

        # Collect all blocked times for today that are >= start_time
        today_blocked = sorted(
            [
                t
                for t in self.blocked_slots
                if t.date() == self.today and t >= start_time
            ]
        )

        if not today_blocked:
            # No blocks at all - the whole day is a gap
            return [(start_time, end_of_day)]

        # Check for gap before first blocked slot
        if today_blocked[0] > start_time:
            gaps.append((start_time, today_blocked[0]))

        # Check for gaps between blocked slots
        for i in range(len(today_blocked) - 1):
            current_end = today_blocked[i]
            next_start = today_blocked[i + 1]

            # Find the actual end of this block (consecutive blocked times)
            while (
                current_end + dt.timedelta(minutes=INTERVAL_MINUTES)
                in self.blocked_slots
            ):
                current_end += dt.timedelta(minutes=INTERVAL_MINUTES)

            if next_start > current_end + dt.timedelta(minutes=INTERVAL_MINUTES):
                gaps.append(
                    (current_end + dt.timedelta(minutes=INTERVAL_MINUTES), next_start)
                )

        # Check for gap after last blocked slot
        last_blocked = today_blocked[-1]
        while (
            last_blocked + dt.timedelta(minutes=INTERVAL_MINUTES) in self.blocked_slots
        ):
            last_blocked += dt.timedelta(minutes=INTERVAL_MINUTES)

        if last_blocked + dt.timedelta(minutes=INTERVAL_MINUTES) < end_of_day:
            gaps.append(
                (last_blocked + dt.timedelta(minutes=INTERVAL_MINUTES), end_of_day)
            )

        return gaps

    def find_gap_for_task(self, gaps: list, num_blocks: int) -> Optional[dt.datetime]:
        """Find a gap that can fit a task of num_blocks duration."""
        for gap_start, gap_end in gaps:
            gap_duration = int((gap_end - gap_start).total_seconds() / 60)
            required_duration = num_blocks * INTERVAL_MINUTES

            if gap_duration >= required_duration:
                # Check if this gap is actually available (no recurring tasks)
                is_available = True
                for j in range(num_blocks):
                    check_time = gap_start + dt.timedelta(minutes=INTERVAL_MINUTES * j)
                    if check_time in self.recurring_slots or self.is_time_blocked(
                        check_time
                    ):
                        is_available = False
                        break

                if is_available:
                    return gap_start

        return None

    def schedule_non_recurring_tasks(self) -> None:
        """Schedule non-recurring tasks with duration estimation, filling gaps first."""
        bad_tasks = self.get_bad_tasks()

        # Round current time to nearest interval
        now = dt.datetime.now()
        now_rounded = now.replace(minute=0, second=0, microsecond=0)
        now_rounded += dt.timedelta(
            minutes=INTERVAL_MINUTES
            * ((now.minute + INTERVAL_MINUTES - 1) // INTERVAL_MINUTES)
        )

        # Find gaps in the schedule
        gaps = self.find_gaps_in_schedule(now_rounded)
        if gaps:
            print(f"\nFound {len(gaps)} gap(s) in today's schedule:")
            for gap_start, gap_end in gaps:
                duration = int((gap_end - gap_start).total_seconds() / 60)
                print(
                    f"  {gap_start.strftime('%H:%M')} - {gap_end.strftime('%H:%M')} ({duration}m available)"
                )

        for task in bad_tasks:
            current_desc = task.description or ""
            duration, was_user_specified = TaskDurationEstimator.estimate(
                task.content, current_desc
            )
            num_blocks = max(1, (duration + INTERVAL_MINUTES - 1) // INTERVAL_MINUTES)

            print(f"\nTask: '{task.content}'")
            print(f"  Duration: {duration} minutes ({num_blocks} blocks)")

            # Try to find a gap first, otherwise find next available slot
            time = self.find_gap_for_task(gaps, num_blocks)
            if time:
                print(f"  → Filling gap at {time.strftime('%H:%M')}")
                # Remove this gap or reduce it
                gaps = [
                    (start, end)
                    for start, end in gaps
                    if not (
                        start == time and end >= time + dt.timedelta(minutes=duration)
                    )
                ]
            else:
                time = self.find_available_slot(now_rounded, num_blocks)

            # Unblock old slot if this task was previously scheduled
            if task.due and task.due.date:
                old_due = self.to_datetime(task.due.date)
                if old_due in self.blocked_slots:
                    self.blocked_slots.remove(old_due)

            # Block new slots and schedule
            self.block_time_slots(time, num_blocks)

            # Update task with new time
            # If duration wasn't user-specified, add it to description
            if not was_user_specified:
                new_description = TaskDurationEstimator.add_duration_to_description(
                    current_desc, duration
                )
                self.api.update_task(
                    task.id, due_datetime=time, description=new_description
                )
                print(f"  Added {duration}m to description")
            else:
                self.api.update_task(task.id, due_datetime=time)

            end_time = time + dt.timedelta(minutes=duration)
            print(
                f"  Scheduled: {time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}"
            )

    def run(self) -> None:
        """Run the full scheduling workflow."""
        print("Fetching tasks...")
        self.fetch_tasks()

        print("Building blocked time map...")
        self.build_blocked_times()
        print(
            f"Blocked {len(self.blocked_slots)} slots ({len(self.recurring_slots)} recurring)"
        )

        # Step 1: Reschedule overdue recurring tasks
        rescheduled_count = self.reschedule_overdue_recurring()
        if rescheduled_count > 0:
            print(f"\nRescheduled {rescheduled_count} overdue recurring tasks")
            print("Refreshing task list...")
            self.fetch_tasks()
            self.build_blocked_times()
            print(
                f"Updated: {len(self.blocked_slots)} slots ({len(self.recurring_slots)} recurring)"
            )

        # Step 2: Schedule non-recurring tasks
        print("\n" + "=" * 50)
        print("Scheduling non-recurring tasks...")
        print("=" * 50)
        self.schedule_non_recurring_tasks()

        print("\nDone!")


def main():
    """Main entry point."""
    todoist_key = get_env_var("TODOIST_KEY")
    api = TodoistAPI(todoist_key)

    scheduler = TaskScheduler(api)
    scheduler.run()


if __name__ == "__main__":
    main()
