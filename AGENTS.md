# Task Updater

Automatically reschedules overdue Todoist tasks using AI-powered duration estimation.

## What It Does

- **Fetches tasks** from Todoist API
- **Reschedules overdue recurring tasks** to today while preserving recurrence patterns
- **Estimates task duration** using:
  - User-specified time in description (e.g., "25m", "65m") - **RESPECTED if slot is valid**
  - OpenRouter/Kimi K2.5 AI estimation
  - Keyword heuristics as fallback
- **Schedules non-recurring tasks** in 5-minute blocks, avoiding:
  - Existing recurring task slots (protected)
  - Sleep time (20:45 cutoff)
  - Outside hours (weekdays 15:00-20:45, weekends 09:00-20:45)
- **Preserves valid slots**: If you specify "25m" in a task description and it's already in a valid time slot (no conflicts, within hours, today or future), it won't be moved
- **No cascade rescheduling**: If a task takes longer than estimated, it won't push other tasks around. Tasks only get rescheduled if they're from previous days or have no time slot at all

## How to Use Duration Markers

Add a duration marker to any task description:
- "Cancel membership 15m" → Task will take 15 minutes
- "Research project 90m" → Task will take 90 minutes
- If the time slot is valid, it stays put; if invalid or overdue, it gets rescheduled

## Task Analytics

The system tracks your productivity and estimation accuracy:

### Tracked Metrics
- **Time spent vs estimated**: Compares actual time to your estimates
- **Daily stats**: Tasks completed, total time worked, estimation accuracy
- **Weekly summaries**: 7-day overview of productivity

### Viewing Analytics
```bash
# View analytics report
uv run task_analytics.py
```

### Analytics Reports
- Daily completion counts and total hours
- Estimation accuracy percentage (100% = perfect estimates)
- Most underestimated/overestimated task types
- Weekly productivity trends

### Files
- `task_analytics.py` - Analytics tracking and reporting
- `task_analytics.json` - Stored analytics data

## Task Notifier (macOS Notifications)

The task notifier sends native macOS notifications when Todoist tasks reach their due time.

### Setup (First Time)

```bash
# Install the LaunchAgent
cp com.user.todoist-notifier.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.user.todoist-notifier.plist
```

### Updating the Notifier

If you modify `com.user.todoist-notifier.plist` or `task_notifier.py`, run the update script:

```bash
./update_notifier.sh
```

Or manually:

```bash
launchctl unload ~/Library/LaunchAgents/com.user.todoist-notifier.plist
cp com.user.todoist-notifier.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.user.todoist-notifier.plist
```

### Management Commands

```bash
# Check if it's running
launchctl list | grep todoist-notifier

# View logs
tail -f /Users/heinrich/Documents/task-updater/notifier.log
tail -f /Users/heinrich/Documents/task-updater/notifier.error.log

# Stop the notifier
launchctl unload ~/Library/LaunchAgents/com.user.todoist-notifier.plist

# Start manually (without LaunchAgent)
uv run task_notifier.py

# Test mode (shows test notification and overlay immediately)
uv run task_notifier.py --test

# Test mode with custom task name
uv run task_notifier.py --test --test-task "My custom test task"

# List active (in-progress) tasks
uv run task_notifier.py --list-active

# Resume a specific task by ID
uv run task_notifier.py --resume <task-id>
```

### How It Works

- Checks Todoist every 15 seconds for tasks due now (±2 minute window)
- Sends one notification per task every 5 minutes max (cooldown period)
- Shows a **full-screen overlay with START button** when tasks are due
- Clicking START: **Spotify starts playing** + switches to small corner timer
- Small timer: draggable, always-on-top, with task name and elapsed time
- Click corner timer's expand button → Options screen → Full screen mode
- Tasks persist across restarts - resume anytime with `--resume <task-id>`
- Auto-restarts on login and if it crashes

## Environment Variables

- `TODOIST_KEY` - Todoist API token
- `OPENROUTER_KEY` - OpenRouter API key (optional)
- `OPENROUTER_PROXY` - OpenRouter proxy URL (optional)

## Development

Always use `uv` for Python package management:

```bash
# Install dependencies
uv pip install <package>

# Or add to pyproject.toml
uv add <package>

# Remove packages
uv remove <package>
```

### Tkinter Requirement

The task notifier requires tkinter for the full-screen overlay feature. Tkinter is included with most Python installations, but may require system libraries on macOS. System libraries (like tcl-tk for tkinter) should be installed via the appropriate system package manager, not uv.
