from __future__ import annotations

import subprocess


def send_notification(title: str, message: str) -> None:
    """Send a macOS notification using osascript and speak the task name."""

    title_escaped = title.replace('"', '\\"')
    message_escaped = message.replace('"', '\\"')
    script = f'display notification "{message_escaped}" with title "{title_escaped}" sound name "default"'
    try:
        subprocess.run(["osascript", "-e", script], check=True, capture_output=True)
        text_to_speak = "Todo: " + message.split("\n")[0]
        subprocess.Popen(
            ["say", text_to_speak], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
    except Exception:
        # If notifications fail, just skip; notifier loop should continue.
        return
