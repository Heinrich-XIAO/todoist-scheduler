#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_NAME="com.user.todoist-notifier.plist"
LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_DOMAIN="gui/$(id -u)"
JOB_LABEL="com.user.todoist-notifier"
LOG_DIR="$HOME/Library/Logs/todoist-scheduler"

echo "Syncing dependencies..."
cd "$ROOT_DIR"
uv sync

echo "Ensuring data/ exists..."
mkdir -p "$ROOT_DIR/data"

echo "Ensuring logs/ exists..."
mkdir -p "$LOG_DIR"

echo "Updating LaunchAgent..."
cp "$ROOT_DIR/$PLIST_NAME" "$LAUNCHAGENTS_DIR/"

# Modern launchctl flow (macOS 10.13+): bootout/bootstrap instead of unload/load.
launchctl bootout "$LAUNCHD_DOMAIN" "$LAUNCHAGENTS_DIR/$PLIST_NAME" 2>/dev/null || true
launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHAGENTS_DIR/$PLIST_NAME"
launchctl enable "$LAUNCHD_DOMAIN/$JOB_LABEL" 2>/dev/null || true
launchctl kickstart -k "$LAUNCHD_DOMAIN/$JOB_LABEL" 2>/dev/null || true

echo "LaunchAgent status:"
launchctl print "$LAUNCHD_DOMAIN/$JOB_LABEL" | rg -n "state =|active count =|runs =|pid =|last exit code =|path =|stdout path =|stderr path =" || true

echo "Logs:"
echo "  tail -f $LOG_DIR/notifier.log"
echo "  tail -f $LOG_DIR/notifier.error.log"
