from todoist_api_python.api import TodoistAPI
import datetime as dt
from pathlib import Path
from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent
_ = load_dotenv(BASE_DIR / ".env.local")


def main():
    api_key = os.getenv("TODOIST_KEY", "")
    if not api_key:
        raise SystemExit("Missing TODOIST_KEY in environment")

    api = TodoistAPI(api_key)

    # Flatten paginated results
    tasks = []
    for page in api.get_tasks():
        tasks.extend(page)

    today = dt.date.today()

    def get_date(due_date):
        """Extract date from due.date which could be date or datetime"""
        if isinstance(due_date, dt.datetime):
            return due_date.date()
        return due_date

    # Find all overdue recurring tasks (any priority)
    overdue_recurring = [
        task
        for task in tasks
        if task.due is not None
        and task.due.is_recurring
        and get_date(task.due.date) < today
    ]

    print(f"Found {len(overdue_recurring)} overdue recurring tasks (all priorities)")

    for task in overdue_recurring:
        print(f"\nTask: {task.content}")
        print(f"  Priority: {task.priority}")
        print(f"  Current due: {task.due.date}")
        print(f"  Recurrence: {task.due.string}")

        # To reschedule a recurring task to today while keeping the pattern:
        # Use the original due_string (which contains the recurrence pattern)
        api.update_task(task.id, due_string=task.due.string)
        print(f"  → Rescheduled to today (recurrence preserved)")


if __name__ == "__main__":
    main()
