from todoist_api_python.api import TodoistAPI
import datetime as dt
from pathlib import Path
from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent
_ = load_dotenv(BASE_DIR / ".env.local")

# These were the 9 tasks that lost their recurrence
TASKS_TO_FIX = [
    ("Charge computer", "every weekday @ 16:45"),
    ("clip nails", "every other sunday @ 13:00"),
    ("Change", "every day 7:30"),
    ("Make sure unhook is enabled", "every day"),
    ("Khan academy", "every day 16:30"),
    ("brush teeth night", "every day 21:30"),
    ("check for completed tasks", "every day 20:00"),
    ("brush teeth morning", "every day @ 07:35"),
    ("shower", "every day 21:15"),
]


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

    print("Restoring recurrence patterns for priority 3 tasks...\n")

    for task_name, recurrence_pattern in TASKS_TO_FIX:
        # Find the task
        matching_tasks = [
            t for t in tasks if t.content == task_name and t.priority == 3
        ]

        if not matching_tasks:
            print(f"⚠️  Could not find task: {task_name}")
            continue

        task = matching_tasks[0]

        # Check if it's missing recurrence
        if task.due and not task.due.is_recurring:
            print(f"🔧 Fixing: {task_name}")
            print(f"   Current due_string: {task.due.string}")
            print(f"   Restoring pattern: {recurrence_pattern}")

            # Restore the recurrence pattern
            api.update_task(task.id, due_string=recurrence_pattern)
            print(f"   ✓ Recurrence restored\n")
        else:
            print(f"✓ {task_name} - already recurring or not found\n")


if __name__ == "__main__":
    main()
