Todoist Scheduler - Operator Guide

This repo is intentionally small and env-var driven.

Layout

- Python source: `src/`
- Scripts: `scripts/`
- LaunchAgent plist: `com.user.todoist-notifier.plist`
- Runtime files: `data/` (logs/state/cache/analytics)
- Electron main process: `main.js`
- Electron preload: `preload.cjs`
- Renderer (React + Vite): `renderer/`

Key commands (always use uv)

```bash
uv sync

uv run todoist-scheduler
uv run task-notifier

uv run task-notifier --test
uv run task-notifier --list-active
uv run task-notifier --resume <task-id>
```

Never run `npm run dev` or `bun run dev` unless explicitly instructed.

Note: the notifier daemon also runs the scheduler every 5 minutes.

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

Electron app

- Uses Bun + Vite. Install deps with `bun install`.
- Dev run: `bun run dev` (starts Vite + Electron via `scripts/dev-electron.mjs`).
- Build: `bun run build`; launch packaged app with `bun run start`.
- The app auto-creates `~/Library/LaunchAgents/com.user.todoist-electron-dev.plist` to run `bun run dev` on login; you can toggle autostart from the UI.
- On startup, the app disables the legacy Python LaunchAgent and kills any `src.cli_notifier` process.
- Logs live in `data/logs/`:
  - `data/logs/electron.log`
  - `data/logs/electron-dev.log`
  - `data/logs/electron-dev.error.log`
- I can check `data/logs/electron.log` and `data/logs/electron-dev.log` myself.

Environment variables

- `TODOIST_KEY` (required)
- `OPENROUTER_KEY` (optional)
- `OPENROUTER_PROXY` (optional; for this setup use `https://ai.hackclub.com/proxy/v1`)

Electron environment

- The Electron app loads `.env.local` from repo root.
- `TODOIST_SCHEDULER_DATA_DIR` (optional) overrides the default `data/` directory.

Runtime data + backwards compatibility

- New runtime files are stored in `data/`.
- On startup, we attempt to migrate legacy root files into `data/`:
  - `overlay_state.json`
  - `task_analytics.json`
  - `computer_task_cache.json`
  - `notifier.log` / `notifier.error.log`

Electron runtime files

- `data/life_blocks.json` (life blocks UI state)
- `data/task_time.json` (time tracking stats)
- `data/overlay_state.json` (overlay session state)
- `data/computer_task_cache.json` (task classification cache)

No tests

- This repo intentionally has no unit tests for now.

Development Notes for AI Agents

- Always use the Electron app; never use the legacy Python daemon or CLI.
- Legacy Python daemon lives in `legacy/`. If you change legacy code or the legacy plist, use `legacy/scripts/update.sh`.
- The Electron app replaces the daemon and does not require an update script.

Future config

- We may add `config.toml` later; avoid adding it until requested.
