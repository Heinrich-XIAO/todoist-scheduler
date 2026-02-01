#!/bin/bash
# Update and reload the Todoist Notifier LaunchAgent

set -e

PLIST_NAME="com.user.todoist-notifier.plist"
LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Updating Todoist Notifier LaunchAgent..."

# Check if currently loaded
if launchctl list | grep -q "todoist-notifier"; then
    echo "Unloading existing LaunchAgent..."
    launchctl unload "$LAUNCHAGENTS_DIR/$PLIST_NAME" 2>/dev/null || true
fi

# Copy updated plist
echo "Copying updated plist..."
cp "$SCRIPT_DIR/$PLIST_NAME" "$LAUNCHAGENTS_DIR/"

# Load the LaunchAgent
echo "Loading LaunchAgent..."
launchctl load "$LAUNCHAGENTS_DIR/$PLIST_NAME"

# Verify it's running
if launchctl list | grep -q "todoist-notifier"; then
    echo "✓ LaunchAgent updated and running"
    echo ""
    echo "View logs with:"
    echo "  tail -f $SCRIPT_DIR/notifier.log"
else
    echo "✗ Failed to start LaunchAgent"
    exit 1
fi
