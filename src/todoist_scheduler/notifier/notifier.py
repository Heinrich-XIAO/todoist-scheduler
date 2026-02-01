from __future__ import annotations

import argparse
import datetime as dt
import threading
import time
from typing import Dict, Optional

from todoist_api_python.api import TodoistAPI

from todoist_scheduler.core.env import get_env_var, load_local_env
from todoist_scheduler.core.paths import migrate_legacy_files, project_root
from todoist_scheduler.notifier.cache import load_cache
from todoist_scheduler.notifier.classifier import is_computer_task
from todoist_scheduler.notifier.notifications import send_notification
from todoist_scheduler.ui.overlay import (
    list_active_tasks,
    resume_task_overlay,
    show_task_overlay,
)


CHECK_INTERVAL_SECONDS = 10  # temporary for testing
NOTIFICATION_WINDOW_MINUTES = 2
NOTIFICATION_COOLDOWN_MINUTES = 5


class TaskNotifier:
    def __init__(self, api: TodoistAPI):
        self.api = api
        self.last_notification_time: Dict[str, dt.datetime] = {}
        self.today = dt.date.today()
        self.active_overlays: Dict[str, bool] = {}
        self.active_tasks: Dict[str, dt.datetime] = {}
        self.cache = load_cache()
        self.overlay_lock = threading.Lock()

    def _run_overlay(
        self, task_name: str, task_id: str, description: str, estimated_duration: float
    ) -> None:
        try:
            show_task_overlay(
                task_name=task_name,
                task_id=task_id,
                description=description,
                mode="full",
                elapsed_seconds=0,
                estimated_duration=estimated_duration,
            )
        finally:
            with self.overlay_lock:
                self.active_overlays.pop(task_id, None)

    def is_task_completed(self, task) -> bool:
        if hasattr(task, "is_completed") and task.is_completed:
            return True
        if hasattr(task, "completed_at") and task.completed_at is not None:
            return True
        return False

    def to_datetime(self, d) -> Optional[dt.datetime]:
        if d is None:
            return None
        if isinstance(d, dt.datetime):
            return d
        if isinstance(d, dt.date):
            return dt.datetime.combine(d, dt.time())
        return None

    def fetch_tasks(self) -> list:
        tasks = []
        for page in self.api.get_tasks():
            tasks.extend(page)
        return tasks

    def check_and_notify(self) -> None:
        now = dt.datetime.now()
        current_time = now.time()

        if now.date() != self.today:
            self.last_notification_time.clear()
            self.today = now.date()

        try:
            tasks = self.fetch_tasks()
        except Exception:
            return

        for task in tasks:
            if self.is_task_completed(task):
                continue
            if not task.due or not task.due.date:
                continue

            due_dt = self.to_datetime(task.due.date)
            if not due_dt or due_dt.date() != self.today:
                continue

            due_time = due_dt.time()
            time_diff = dt.datetime.combine(self.today, due_time) - dt.datetime.combine(
                self.today, current_time
            )
            minutes_until_due = time_diff.total_seconds() / 60

            if not (
                -NOTIFICATION_WINDOW_MINUTES
                <= minutes_until_due
                <= NOTIFICATION_WINDOW_MINUTES
            ):
                continue

            last_notified = self.last_notification_time.get(task.id)
            if last_notified:
                minutes_since_last = (now - last_notified).total_seconds() / 60
                if minutes_since_last < NOTIFICATION_COOLDOWN_MINUTES:
                    continue

            priority_text = ""
            if task.priority == 4:
                priority_text = " [P1 - Urgent!]"
            elif task.priority == 3:
                priority_text = " [P2 - High]"
            elif task.priority == 2:
                priority_text = " [P3 - Medium]"

            title = f"Task Due{priority_text}"
            message = task.content
            if task.description:
                desc = task.description
                if len(desc) > 100:
                    desc = desc[:97] + "..."
                message = f"{task.content}\n{desc}"

            send_notification(title, message)
            self.last_notification_time[task.id] = now

            desc = getattr(task, "description", "")
            if is_computer_task(task.content, desc, self.cache):
                with self.overlay_lock:
                    if task.id in self.active_overlays:
                        continue
                    if len(self.active_overlays) > 0:
                        continue
                    self.active_overlays[task.id] = True
                    self.active_tasks[task.id] = dt.datetime.now()

                thread = threading.Thread(
                    target=self._run_overlay,
                    args=(
                        task.content,
                        task.id,
                        desc,
                        _estimated_duration_from_description(desc),
                    ),
                )
                thread.daemon = True
                thread.start()

    def run(self) -> None:
        while True:
            self.check_and_notify()
            time.sleep(CHECK_INTERVAL_SECONDS)


def _estimated_duration_from_description(description: str) -> float:
    import re

    m = re.search(r"(\d+)m\b", description or "")
    if not m:
        return 30
    try:
        return float(m.group(1))
    except Exception:
        return 30


def main() -> None:
    root = project_root()
    load_local_env(root)
    migrate_legacy_files(
        [
            "overlay_state.json",
            "task_analytics.json",
            "computer_task_cache.json",
            "notifier.log",
            "notifier.error.log",
        ]
    )

    parser = argparse.ArgumentParser(
        description="Task Notifier - Sends notifications when Todoist tasks are due"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test mode: show a test notification and overlay immediately",
    )
    parser.add_argument(
        "--test-task",
        type=str,
        default="Test Task",
        help="Task name to use in test mode",
    )
    parser.add_argument(
        "--resume", type=str, help="Resume a specific task by ID from saved state"
    )
    parser.add_argument(
        "--list-active",
        action="store_true",
        help="List all active (in-progress) tasks and exit",
    )
    args = parser.parse_args()

    if args.list_active:
        active = list_active_tasks()
        if active:
            print("\nActive tasks:")
            for task_id, data in active.items():
                elapsed = data.get("elapsed_seconds", 0)
                minutes = int(elapsed / 60)
                print(f"  - {data.get('task_name', 'Unknown')[:50]}")
                print(f"    ID: {task_id}")
                print(f"    Time: {minutes} minutes")
                print()
        else:
            print("\nNo active tasks found.")
        return

    api = TodoistAPI(get_env_var("TODOIST_KEY"))

    if args.test:

        class FakeTask:
            def __init__(self, content: str):
                self.id = "test-task-123"
                self.content = content
                self.priority = 3
                self.description = "This is a test task with full-screen overlay. Click START to begin! 0.5m"

        test_task = FakeTask(args.test_task)
        send_notification("Task Due [TEST MODE]", test_task.content)
        show_task_overlay(
            task_name=test_task.content,
            task_id=test_task.id,
            description=test_task.description,
            mode="full",
            elapsed_seconds=0,
            estimated_duration=0.25,
        )
        return

    if args.resume:
        resume_task_overlay(args.resume)
        return

    TaskNotifier(api).run()
