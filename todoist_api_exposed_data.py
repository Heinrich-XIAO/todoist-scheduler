import datetime as dt
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from todoist_api_python.api import TodoistAPI

BASE_DIR = Path(__file__).resolve().parent
_ = load_dotenv(BASE_DIR / ".env.local")


def serialize(value):
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [serialize(item) for item in value]
    if hasattr(value, "to_json"):
        return serialize(value.to_json())
    if hasattr(value, "__dict__"):
        return {key: serialize(item) for key, item in vars(value).items()}
    return repr(value)


def main():
    api_key = os.getenv("TODOIST_KEY", "")
    if not api_key:
        raise SystemExit("Missing TODOIST_KEY in environment")

    api = TodoistAPI(api_key)
    tasks = list(api.get_tasks())
    payload = {
        "count": len(tasks),
        "tasks": [serialize(task) for task in tasks],
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
