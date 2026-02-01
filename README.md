Todoist Scheduler

Todoist task scheduler + macOS notifier + focus overlay.

What it does

- Scheduler:
  - Reschedules overdue recurring tasks to today while preserving recurrence patterns
  - Schedules non-recurring tasks in 5-minute blocks
  - Never schedules non-recurring tasks overlapping recurring task slots
  - Sleep cutoff at 20:45; weekdays start 15:00; weekends start 09:00
  - No cascade/backfill: tasks running long don't automatically move later tasks
- Notifier:
  - Polls Todoist for tasks due today and sends macOS notifications
  - Opens a full-screen focus overlay with a START button
  - After START: switches to a small always-on-top corner timer

Setup

Requirements:
- Python 3.14+
- uv
- macOS (osascript/say)

Install deps:

```bash
./scripts/setup.sh
```

Install/update the LaunchAgent daemon:

```bash
./scripts/update.sh
```

Run manually:

```bash
uv run todoist-scheduler
uv run task-notifier
```

Test mode (notifier):

```bash
uv run task-notifier --test
```

Runtime data

- Runtime files live in `data/`.
- On startup we migrate legacy root files (like `overlay_state.json`, `task_analytics.json`, `computer_task_cache.json`) into `data/` when possible.

Environment

- TODOIST_KEY (required)
- OPENROUTER_KEY (optional)
- OPENROUTER_PROXY (optional; for you this should be https://ai.hackclub.com/proxy/)

Future configuration

We will likely add a `config.toml` later; for now everything is env-var driven.

Logs

```bash
tail -f ~/Library/Logs/todoist-scheduler/notifier.log
tail -f ~/Library/Logs/todoist-scheduler/notifier.error.log
```
