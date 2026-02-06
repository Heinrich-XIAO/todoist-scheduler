# Electron Todoist Scheduler

This Electron app replaces the Python daemons. It runs scheduling, notifications, overlays, and life blocks.

## Setup

```bash
bun install
```

## Dev Run

```bash
bun run dev
```

The app will auto-create a LaunchAgent that runs `bun run dev` on login. You can toggle autostart in the app.

## Logs

- `data/logs/electron.log`
- `data/logs/electron-dev.log`
- `data/logs/electron-dev.error.log`

## Environment

Uses `.env.local` from repo root:

- `TODOIST_KEY` (required)
- `OPENROUTER_KEY` (optional)
- `OPENROUTER_PROXY` (optional)
