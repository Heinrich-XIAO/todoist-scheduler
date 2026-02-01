from __future__ import annotations

from todoist_api_python.api import TodoistAPI

from todoist_scheduler.core.env import get_env_var, load_local_env
from todoist_scheduler.core.paths import migrate_legacy_files, project_root
from todoist_scheduler.scheduler.scheduler import TaskScheduler


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

    api = TodoistAPI(get_env_var("TODOIST_KEY"))
    TaskScheduler(api).run()
