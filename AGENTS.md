Todoist Scheduler - Operator Guide

This repo is intentionally small and env-var driven.

Layout

- Python source: `src/`
- Scripts: `scripts/`
- LaunchAgent plist: `com.user.todoist-notifier.plist`
- Runtime files: `data/` (logs/state/cache/analytics)

Key commands (always use uv)

```bash
uv sync

uv run todoist-scheduler
uv run task-notifier

uv run task-notifier --test
uv run task-notifier --list-active
uv run task-notifier --resume <task-id>
```

LaunchAgent

- The notifier daemon is installed as a LaunchAgent.
- Any time you change notifier code or the plist, rerun:

```bash
./scripts/update.sh
```

Logs:

```bash
tail -f data/notifier.log
tail -f data/notifier.error.log
```

Environment variables

- `TODOIST_KEY` (required)
- `OPENROUTER_KEY` (optional)
- `OPENROUTER_PROXY` (optional; for this setup use `https://ai.hackclub.com/proxy/v1`)

Runtime data + backwards compatibility

- New runtime files are stored in `data/`.
- On startup, we attempt to migrate legacy root files into `data/`:
  - `overlay_state.json`
  - `task_analytics.json`
  - `computer_task_cache.json`
  - `notifier.log` / `notifier.error.log`

No tests

- This repo intentionally has no unit tests for now.

Development Notes for AI Agents

- Always restart the task notifier daemon after making code changes. Use `./scripts/update.sh` to reload the LaunchAgent and apply changes.

Future config

- We may add `config.toml` later; avoid adding it until requested.
