from __future__ import annotations

import datetime as dt
from typing import Optional, Tuple, Union

from todoist_api_python.api import TodoistAPI

from src.scheduler.constants import (
    INTERVAL_MINUTES,
    SLEEP_TIME,
    WEEKDAY_START_HOUR,
    WEEKEND_START_HOUR,
)
from src.integrations.openrouter import estimate_priority
from src.life_blocks import blocked_slots_for_date
from src.scheduler.duration import TaskDurationEstimator


class TaskScheduler:
    """Handles task scheduling logic and time slot management."""

    def __init__(self, api: TodoistAPI):
        self.api = api
        self.tasks = []
        self.today = dt.date.today()
        self.blocked_slots: set[dt.datetime] = set()
        self.recurring_slots: set[dt.datetime] = set()
        self.life_block_cache: dict[dt.date, set[dt.datetime]] = {}

    def fetch_tasks(self) -> None:
        self.tasks = []
        for page in self.api.get_tasks():
            self.tasks.extend(page)

        self.tasks = [
            task
            for task in self.tasks
            if not (
                hasattr(task, "labels")
                and task.labels
                and "#testnotification" in task.labels
            )
        ]

    def apply_auto_priorities(self) -> None:
        for task in self.tasks:
            if getattr(task, "priority", 1) != 1:
                continue
            new_priority = estimate_priority(
                getattr(task, "content", "") or "",
                getattr(task, "description", "") or "",
            )
            if new_priority is None:
                continue
            self.api.update_task(task.id, priority=new_priority)
            try:
                task.priority = new_priority
            except Exception:
                pass

    def is_task_completed(self, task) -> bool:
        if hasattr(task, "is_completed") and task.is_completed:
            return True
        if hasattr(task, "completed_at") and task.completed_at is not None:
            return True
        return False

    def should_skip_reschedule(self, task) -> bool:
        labels = getattr(task, "labels", []) or []
        return "#dontchangetime" in labels

    def to_datetime(self, d: Union[dt.date, dt.datetime]) -> dt.datetime:
        if isinstance(d, dt.datetime):
            return d
        if isinstance(d, dt.date):
            return dt.datetime.combine(d, dt.time())
        return d

    def get_date(self, due_date) -> dt.date:
        if isinstance(due_date, dt.datetime):
            return due_date.date()
        return due_date

    def is_date_only_task(self, task) -> bool:
        if not task.due or not task.due.date:
            return False
        return getattr(task.due, "datetime", None) is None

    def is_time_blocked(self, when: dt.datetime) -> bool:
        if when in self.blocked_slots:
            return True
        if when in self.get_life_blocks_for_date(when.date()):
            return True

        start_hour = WEEKEND_START_HOUR if when.weekday() >= 5 else WEEKDAY_START_HOUR
        if when.time() >= SLEEP_TIME or when.hour < start_hour:
            return True

        return False

    def build_blocked_times(self) -> None:
        self.blocked_slots = set()
        self.recurring_slots = set()
        self.life_block_cache = {}

        self.blocked_slots |= blocked_slots_for_date(self.today, INTERVAL_MINUTES)

    def get_life_blocks_for_date(self, date: dt.date) -> set[dt.datetime]:
        cached = self.life_block_cache.get(date)
        if cached is not None:
            return cached
        slots = blocked_slots_for_date(date, INTERVAL_MINUTES)
        self.life_block_cache[date] = slots
        return slots

        for task in self.tasks:
            if self.is_task_completed(task):
                continue
            if self.should_skip_reschedule(task):
                continue

            if not (task.due and task.due.date):
                continue

            due = self.to_datetime(task.due.date)
            if due.date() != self.today:
                continue

            current_desc = task.description or ""
            duration = TaskDurationEstimator.parse_duration_from_description(
                current_desc
            )
            if duration is None:
                ai_duration = TaskDurationEstimator.estimate_with_ai(
                    task.content, current_desc
                )
                duration = ai_duration if ai_duration is not None else 10

            num_blocks = max(1, (duration + INTERVAL_MINUTES - 1) // INTERVAL_MINUTES)
            for j in range(num_blocks):
                block_time = due + dt.timedelta(minutes=INTERVAL_MINUTES * j)
                self.blocked_slots.add(block_time)
                if task.due.is_recurring:
                    self.recurring_slots.add(block_time)

    def reschedule_overdue_recurring(self) -> int:
        overdue = [
            task
            for task in self.tasks
            if not self.is_task_completed(task)
            and task.due is not None
            and task.due.is_recurring
            and self.get_date(task.due.date) < self.today
        ]

        for task in overdue:
            self.api.update_task(task.id, due_string=task.due.string)

        return len(overdue)

    def is_slot_available(self, start: dt.datetime, num_blocks: int) -> bool:
        for j in range(num_blocks):
            check_time = start + dt.timedelta(minutes=INTERVAL_MINUTES * j)
            if self.is_time_blocked(check_time) or check_time in self.recurring_slots:
                return False
        return True

    def find_available_slot(
        self, start_time: dt.datetime, num_blocks: int
    ) -> dt.datetime:
        time = start_time
        for _ in range(10000):
            if self.is_slot_available(time, num_blocks):
                return time
            time += dt.timedelta(minutes=INTERVAL_MINUTES)
        raise RuntimeError("Could not find available time slot")

    def find_available_slot_for_date(
        self, start_time: dt.datetime, num_blocks: int, target_date: dt.date
    ) -> Optional[dt.datetime]:
        time = start_time
        for _ in range(10000):
            if time.date() != target_date:
                return None
            if self.is_slot_available(time, num_blocks):
                return time
            time += dt.timedelta(minutes=INTERVAL_MINUTES)
        return None

    def block_time_slots(self, start_time: dt.datetime, num_blocks: int) -> None:
        for j in range(num_blocks):
            block_time = start_time + dt.timedelta(minutes=INTERVAL_MINUTES * j)
            self.blocked_slots.add(block_time)

    def is_current_slot_valid(self, task, duration: int) -> bool:
        if not task.due or not task.due.date:
            return False

        task_due = self.to_datetime(task.due.date)
        if task_due.date() < self.today:
            return False

        num_blocks = max(1, (duration + INTERVAL_MINUTES - 1) // INTERVAL_MINUTES)
        for j in range(num_blocks):
            check_time = task_due + dt.timedelta(minutes=INTERVAL_MINUTES * j)

            start_hour = (
                WEEKEND_START_HOUR if check_time.weekday() >= 5 else WEEKDAY_START_HOUR
            )
            if check_time.time() >= SLEEP_TIME or check_time.hour < start_hour:
                return False
            if check_time in self.recurring_slots:
                return False

        return True

    def get_bad_tasks(self) -> list:
        bad_tasks = []
        for task in self.tasks:
            if self.is_task_completed(task):
                continue
            if self.should_skip_reschedule(task):
                continue

            if task.due is None:
                bad_tasks.append(task)
                continue

            if task.due.is_recurring:
                continue

            task_due = self.to_datetime(task.due.date)
            if task_due.date() < self.today:
                bad_tasks.append(task)
            elif task_due.date() == self.today:
                current_desc = task.description or ""
                user_duration = TaskDurationEstimator.parse_duration_from_description(
                    current_desc
                )
                if user_duration is not None:
                    if self.is_current_slot_valid(task, user_duration):
                        continue
                    bad_tasks.append(task)

        return bad_tasks

    def find_gaps_in_schedule(
        self, start_time: dt.datetime
    ) -> list[Tuple[dt.datetime, dt.datetime]]:
        gaps: list[Tuple[dt.datetime, dt.datetime]] = []
        end_of_day = dt.datetime.combine(self.today, SLEEP_TIME)

        today_blocked = sorted(
            [
                t
                for t in self.blocked_slots
                if t.date() == self.today and t >= start_time
            ]
        )

        if not today_blocked:
            return [(start_time, end_of_day)]

        if today_blocked[0] > start_time:
            gaps.append((start_time, today_blocked[0]))

        for i in range(len(today_blocked) - 1):
            current_end = today_blocked[i]
            next_start = today_blocked[i + 1]

            while (
                current_end + dt.timedelta(minutes=INTERVAL_MINUTES)
                in self.blocked_slots
            ):
                current_end += dt.timedelta(minutes=INTERVAL_MINUTES)

            if next_start > current_end + dt.timedelta(minutes=INTERVAL_MINUTES):
                gaps.append(
                    (current_end + dt.timedelta(minutes=INTERVAL_MINUTES), next_start)
                )

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

    def find_gap_for_task(
        self, gaps: list[Tuple[dt.datetime, dt.datetime]], num_blocks: int
    ) -> Optional[dt.datetime]:
        required_duration = num_blocks * INTERVAL_MINUTES
        for gap_start, gap_end in gaps:
            gap_duration = int((gap_end - gap_start).total_seconds() / 60)
            if gap_duration < required_duration:
                continue

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
        bad_tasks = self.get_bad_tasks()
        bad_tasks.sort(key=lambda task: getattr(task, "priority", 1), reverse=True)

        now = dt.datetime.now()
        min_start = now + dt.timedelta(hours=1)
        min_start_rounded = min_start.replace(minute=0, second=0, microsecond=0)
        min_start_rounded += dt.timedelta(
            minutes=INTERVAL_MINUTES
            * ((min_start.minute + INTERVAL_MINUTES - 1) // INTERVAL_MINUTES)
        )
        now_rounded = max(
            min_start_rounded,
            now.replace(minute=0, second=0, microsecond=0)
            + dt.timedelta(
                minutes=INTERVAL_MINUTES
                * ((now.minute + INTERVAL_MINUTES - 1) // INTERVAL_MINUTES)
            ),
        )

        gaps = self.find_gaps_in_schedule(now_rounded)

        for task in bad_tasks:
            current_desc = task.description or ""
            duration, was_user_specified = TaskDurationEstimator.estimate(
                task.content, current_desc
            )
            num_blocks = max(1, (duration + INTERVAL_MINUTES - 1) // INTERVAL_MINUTES)

            if self.is_date_only_task(task):
                target_date = self.get_date(task.due.date)
                if target_date != self.today:
                    continue
                time_slot = self.find_gap_for_task(gaps, num_blocks)
                if time_slot is None:
                    time_slot = self.find_available_slot_for_date(
                        now_rounded, num_blocks, target_date
                    )
                if time_slot is None:
                    continue
            else:
                time_slot = self.find_gap_for_task(gaps, num_blocks)
                if time_slot is None:
                    time_slot = self.find_available_slot(now_rounded, num_blocks)

            # Unblock old slot if this task was previously scheduled
            if task.due and task.due.date:
                old_due = self.to_datetime(task.due.date)
                if old_due in self.blocked_slots:
                    self.blocked_slots.remove(old_due)

            self.block_time_slots(time_slot, num_blocks)

            if not was_user_specified:
                new_description = TaskDurationEstimator.add_duration_to_description(
                    current_desc, duration
                )
                self.api.update_task(
                    task.id, due_datetime=time_slot, description=new_description
                )
            else:
                self.api.update_task(task.id, due_datetime=time_slot)

    def run(self) -> None:
        self.fetch_tasks()
        self.apply_auto_priorities()
        self.build_blocked_times()

        rescheduled = self.reschedule_overdue_recurring()
        if rescheduled > 0:
            self.fetch_tasks()
            self.build_blocked_times()

        self.schedule_non_recurring_tasks()
