Legacy Todoist Scheduler - Operator Guide

This folder contains the legacy Python daemon stack.

Layout

- Python source: `legacy/src/`
- Scripts: `legacy/scripts/`
- LaunchAgent plist: `legacy/com.user.todoist-notifier.plist`
- Runtime files: `data/` (logs/state/cache/analytics)

Key commands (always use uv)

```bash
./scripts/setup.sh

uv run todoist-scheduler
uv run task-notifier

uv run task-notifier --test
```

LaunchAgent

- The legacy notifier daemon is installed as a LaunchAgent.
- Any time you change legacy notifier code or the legacy plist, rerun:

```bash
./scripts/update.sh
```

Logs

```bash
tail -f data/notifier.log
tail -f data/notifier.error.log
```

Environment variables

- `TODOIST_KEY` (required)
- `OPENROUTER_KEY` (optional)
- `OPENROUTER_PROXY` (optional; for this setup use `https://ai.hackclub.com/proxy/v1`)

Runtime data + backwards compatibility

- Runtime files live in `data/`.
- On startup, we attempt to migrate legacy root files into `data/`:
  - `overlay_state.json`
  - `task_analytics.json`
  - `computer_task_cache.json`
  - `notifier.log` / `notifier.error.log`

Notes

- Scheduler uses 5-minute blocks and avoids overlapping recurring task slots.
- Sleep cutoff is 20:45; weekday start is 15:00; weekend start is 09:00.
- The notifier runs the scheduler every 5 minutes.
