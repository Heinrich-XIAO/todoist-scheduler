"""
Task Notifier - Sends notifications when Todoist tasks are due.

This script:
1. Polls Todoist for tasks scheduled for today
2. Sends macOS notifications when tasks reach their due time
3. Shows full-screen overlay with START button
4. Manages corner timer overlays with task persistence
5. Runs continuously, checking every 15 seconds
"""

from todoist_api_python.api import TodoistAPI
import datetime as dt
import time
from pathlib import Path
from dotenv import load_dotenv
from typing import Optional, Dict, List
import os
import subprocess
import threading
import argparse
import json
import hashlib
from task_overlay import (
    show_task_overlay,
    load_state,
    list_active_tasks,
    resume_task_overlay,
)

# Configuration
BASE_DIR = Path(__file__).resolve().parent
_ = load_dotenv(BASE_DIR / ".env.local")

# Cache for computer-based task classification
COMPUTER_TASK_CACHE_FILE = BASE_DIR / "computer_task_cache.json"
COMPUTER_TASK_CACHE: Dict[str, bool] = {}


def load_computer_task_cache():
    """Load cached computer task classifications."""
    global COMPUTER_TASK_CACHE
    if COMPUTER_TASK_CACHE_FILE.exists():
        try:
            COMPUTER_TASK_CACHE = json.loads(COMPUTER_TASK_CACHE_FILE.read_text())
        except:
            COMPUTER_TASK_CACHE = {}


def save_computer_task_cache():
    """Save computer task classification cache."""
    COMPUTER_TASK_CACHE_FILE.write_text(json.dumps(COMPUTER_TASK_CACHE, indent=2))


def get_task_hash(task_content: str) -> str:
    """Get a hash for a task to use as cache key."""
    return hashlib.md5(task_content.lower().strip().encode()).hexdigest()[:16]


def is_computer_task(task_content: str, task_description: str = "") -> bool:
    """
    Determine if a task is computer-based using cached AI classification.
    Returns True if the task should be done on a computer.
    """
    # Combine content and description for classification
    full_text = f"{task_content} {task_description}".strip()
    task_hash = get_task_hash(full_text)

    # Check cache first
    if task_hash in COMPUTER_TASK_CACHE:
        return COMPUTER_TASK_CACHE[task_hash]

    # Use heuristics first for common cases
    text_lower = full_text.lower()

    # Definitely computer-based keywords
    computer_keywords = [
        "email",
        "message",
        "slack",
        "discord",
        "code",
        "program",
        "develop",
        "write",
        "document",
        "spreadsheet",
        "excel",
        "word",
        "powerpoint",
        "research",
        "search",
        "browse",
        "website",
        "web",
        "online",
        "internet",
        "file",
        "folder",
        "organize",
        "backup",
        "sync",
        "update",
        "install",
        "configure",
        "setup",
        "settings",
        "account",
        "login",
        "password",
        "review",
        "edit",
        "create",
        "design",
        "draw",
        "photoshop",
        "figma",
        "video",
        "edit",
        "render",
        "compile",
        "build",
        "deploy",
        "git",
        "github",
        "terminal",
        "command",
        "script",
        "database",
        "sql",
        "api",
        "zoom",
        "meeting",
        "call",
        "video",
        "conference",
        "teams",
        "meet",
        "calendar",
        "schedule",
        "plan",
        "todoist",
        "notion",
        "obsidian",
        "read",
        "article",
        "pdf",
        "document",
        "paper",
        "book",
        "ebook",
        "watch",
        "video",
        "tutorial",
        "course",
        "learn",
        "study",
    ]

    # Definitely NOT computer-based keywords
    offline_keywords = [
        "grocery",
        "shopping",
        "store",
        "mall",
        "buy",
        "purchase",
        "clean",
        "wash",
        "laundry",
        "dishes",
        "vacuum",
        "sweep",
        "cook",
        "meal",
        "food",
        "kitchen",
        "grocery",
        "recipe",
        "exercise",
        "gym",
        "workout",
        "run",
        "walk",
        "jog",
        "call",
        "phone",
        "text",
        "visit",
        "meet",
        "in-person",
        "drive",
        "car",
        "gas",
        "oil",
        "repair",
        "mechanic",
        "bank",
        "atm",
        "post office",
        "mail",
        "letter",
        "package",
        "doctor",
        "dentist",
        "appointment",
        "health",
        "medical",
        "house",
        "home",
        "repair",
        "fix",
        "paint",
        "yard",
        "garden",
        "pet",
        "dog",
        "cat",
        "walk",
        "vet",
        "feed",
        "trash",
        "garbage",
        "recycling",
        "take out",
    ]

    # Check for computer keywords
    for keyword in computer_keywords:
        if keyword in text_lower:
            COMPUTER_TASK_CACHE[task_hash] = True
            save_computer_task_cache()
            return True

    # Check for offline keywords
    for keyword in offline_keywords:
        if keyword in text_lower:
            COMPUTER_TASK_CACHE[task_hash] = False
            save_computer_task_cache()
            return False

    # Use AI for uncertain cases
    try:
        result = classify_with_ai(full_text)
        COMPUTER_TASK_CACHE[task_hash] = result
        save_computer_task_cache()
        return result
    except Exception as e:
        print(f"  AI classification failed: {e}")
        # Default to True (show overlay) if uncertain
        COMPUTER_TASK_CACHE[task_hash] = True
        save_computer_task_cache()
        return True


def classify_with_ai(task_text: str) -> bool:
    """Use AI to classify if a task is computer-based."""
    import requests

    openrouter_key = os.getenv("OPENROUTER_KEY")
    if not openrouter_key:
        # If no API key, default to showing all tasks
        return True

    proxy = os.getenv("OPENROUTER_PROXY", "https://openrouter.ai/api/v1")

    prompt = f"""Is this task done primarily on a computer/phone/digital device, or is it a physical/offline task?

Task: "{task_text}"

Answer with just ONE word: "COMPUTER" if it's digital/computer-based, or "OFFLINE" if it's physical.
Examples:
- "Check email" -> COMPUTER
- "Buy groceries" -> OFFLINE  
- "Write code" -> COMPUTER
- "Go to gym" -> OFFLINE
- "Review pull request" -> COMPUTER
- "Clean kitchen" -> OFFLINE"""

    try:
        response = requests.post(
            f"{proxy}/chat/completions",
            headers={
                "Authorization": f"Bearer {openrouter_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://localhost",
                "X-Title": "TaskClassifier",
            },
            json={
                "model": "moonshotai/kimi-k2-5",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 10,
                "temperature": 0.1,
            },
            timeout=10,
        )

        if response.status_code == 200:
            result = response.json()
            answer = result["choices"][0]["message"]["content"].strip().upper()
            return "COMPUTER" in answer
    except Exception as e:
        print(f"  AI classification error: {e}")

    # Default to True if AI fails
    return True


# Load cache on module import
load_computer_task_cache()

# Notification settings
CHECK_INTERVAL_SECONDS = 10  # Check every 10 seconds (temporary for testing)
NOTIFICATION_WINDOW_MINUTES = 2  # Notify for tasks due within this window
NOTIFICATION_COOLDOWN_MINUTES = (
    5  # Minimum time between notifications for the same task
)


def get_env_var(name: str, required: bool = True) -> Optional[str]:
    """Get environment variable with optional validation."""
    value = os.getenv(name)
    if required and not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def send_notification(title: str, message: str) -> None:
    """Send a macOS notification using osascript and speak the task name."""
    try:
        # Escape quotes for AppleScript
        title_escaped = title.replace('"', '\\"')
        message_escaped = message.replace('"', '\\"')

        # Use osascript with sound
        script = f'display notification "{message_escaped}" with title "{title_escaped}" sound name "default"'
        subprocess.run(["osascript", "-e", script], check=True, capture_output=True)

        # Speak the task name aloud
        text_to_speak = "Todo: " + message.split("\n")[0]  # Prefix with Todo:
        subprocess.Popen(
            ["say", text_to_speak], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )

        print(f"  Notification sent and spoken: {title}")
    except subprocess.CalledProcessError as e:
        print(f"  Failed to send notification: {e}")
    except FileNotFoundError:
        print("  Warning: osascript not found. Notifications disabled.")

        # Speak the task name aloud
        text_to_speak = "Todo: " + message.split("\n")[0]  # Prefix with Todo:
        subprocess.Popen(
            ["say", text_to_speak], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )

        print(f"  Notification sent and spoken: {title}")
    except subprocess.CalledProcessError as e:
        print(f"  Failed to send notification: {e}")
    except FileNotFoundError:
        print(
            "  Warning: terminal-notifier not found. Install with: brew install terminal-notifier"
        )


class TaskNotifier:
    """Monitors Todoist tasks and sends notifications when they're due."""

    def __init__(self, api: TodoistAPI):
        self.api = api
        # Track when each task was last notified: task_id -> datetime
        self.last_notification_time: Dict[str, dt.datetime] = {}
        self.today = dt.date.today()
        # Track active overlays: task_id -> True (simplified)
        self.active_overlays: Dict[str, bool] = {}
        # Track tasks that have been started (in corner mode): task_id -> start_time
        self.active_tasks: Dict[str, dt.datetime] = {}
        # Lock for thread-safe overlay management
        self.overlay_lock = threading.Lock()

        # Resume any saved active tasks from previous sessions
        self._resume_saved_tasks()

    def _resume_saved_tasks(self):
        """Resume any tasks that were active when the notifier last ran."""
        saved_tasks = list_active_tasks()
        if saved_tasks:
            print(f"\n  Found {len(saved_tasks)} saved task(s) to resume:")
            for task_id, task_data in saved_tasks.items():
                task_name = task_data.get("task_name", "Unknown")
                elapsed = task_data.get("elapsed_seconds", 0)
                minutes = int(elapsed / 60)
                print(f"    - {task_name[:40]}... ({minutes}m elapsed)")
            print()

    def is_task_completed(self, task) -> bool:
        """Check if a task is completed."""
        if hasattr(task, "is_completed") and task.is_completed:
            return True
        if hasattr(task, "completed_at") and task.completed_at is not None:
            return True
        return False

    def _run_overlay_thread(
        self,
        task,
        mode: str = "full",
        elapsed_seconds: float = 0,
        estimated_duration: int = None,
    ):
        """Run overlay in background thread."""
        try:
            # Extract estimated duration from description if not provided
            import re

            description = getattr(task, "description", "")
            if estimated_duration is None:
                estimated_duration = 30  # Default
                duration_match = re.search(r"(\d+)m", description)
                if duration_match:
                    estimated_duration = int(duration_match.group(1))

            result = show_task_overlay(
                task_name=task.content,
                task_id=task.id,
                description=description,
                mode=mode,
                elapsed_seconds=elapsed_seconds,
                estimated_duration=estimated_duration,
            )

            with self.overlay_lock:
                if task.id in self.active_overlays:
                    del self.active_overlays[task.id]
                if task.id in self.active_tasks:
                    del self.active_tasks[task.id]

            if result.get("completed"):
                elapsed = result.get("elapsed_seconds", 0)
                elapsed_minutes = elapsed / 60
                print(f"  Task completed! Time spent: {elapsed_minutes:.1f} minutes")

                # Try to complete the task in Todoist
                try:
                    self.api.close_task(task.id)
                    print(f"  Task marked as complete in Todoist")
                except Exception as e:
                    print(f"  Could not complete task in Todoist: {e}")
            else:
                # Task was cancelled or closed without completing
                elapsed = result.get("elapsed_seconds", 0)
                if elapsed > 0:
                    elapsed_minutes = elapsed / 60
                    print(
                        f"  Task paused. Time spent so far: {elapsed_minutes:.1f} minutes"
                    )
                    # Task state is already saved in overlay_state.json
        except Exception as e:
            print(f"  Overlay error: {e}")
            with self.overlay_lock:
                if task.id in self.active_overlays:
                    del self.active_overlays[task.id]

    def show_task_overlay(
        self,
        task,
        mode: str = "full",
        elapsed_seconds: float = 0,
        estimated_duration: int = None,
    ) -> bool:
        """Show overlay for a task. Returns True if overlay was shown."""
        with self.overlay_lock:
            # Don't show if there's already an overlay for this task
            if task.id in self.active_overlays:
                return False

            # Don't show more than 1 overlay at a time
            if len(self.active_overlays) > 0:
                return False

            # Mark as active
            self.active_overlays[task.id] = True
            self.active_tasks[task.id] = dt.datetime.now()

        # Run overlay in background thread (subprocess handles main thread requirement)
        thread = threading.Thread(
            target=self._run_overlay_thread,
            args=(task, mode, elapsed_seconds, estimated_duration),
        )
        thread.daemon = True
        thread.start()

        if mode == "full" and elapsed_seconds == 0:
            print(f"  Full overlay shown for task: {task.content[:50]}")
        elif elapsed_seconds > 0:
            print(
                f"  Resumed task overlay: {task.content[:50]} ({elapsed_seconds / 60:.1f}m elapsed)"
            )
        else:
            print(f"  Corner overlay shown for task: {task.content[:50]}")
        return True

    def to_datetime(self, d) -> Optional[dt.datetime]:
        """Convert date/datetime to datetime."""
        if d is None:
            return None
        if isinstance(d, dt.datetime):
            return d
        if isinstance(d, dt.date):
            return dt.datetime.combine(d, dt.time())
        return None

    def fetch_tasks(self) -> list:
        """Fetch all tasks from Todoist API."""
        tasks = []
        for page in self.api.get_tasks():
            tasks.extend(page)
        return tasks

    def check_and_notify(self) -> None:
        """Check for due tasks and send notifications."""
        now = dt.datetime.now()
        current_time = now.time()

        # Clean up old entries from last notification times (keep only today's)
        if now.date() != self.today:
            self.last_notification_time.clear()
            self.today = now.date()

        print(f"[{now.strftime('%H:%M:%S')}] Checking tasks...")

        try:
            tasks = self.fetch_tasks()
        except Exception as e:
            print(f"  Error fetching tasks: {e}")
            return

        notifications_sent = 0

        for task in tasks:
            # Skip completed tasks
            if self.is_task_completed(task):
                continue

            # Skip tasks without due dates
            if not task.due or not task.due.date:
                continue

            due_dt = self.to_datetime(task.due.date)
            if not due_dt:
                continue

            # Only check tasks due today
            if due_dt.date() != self.today:
                continue

            due_time = due_dt.time()

            # Check if task is due now (within window)
            time_diff = dt.datetime.combine(self.today, due_time) - dt.datetime.combine(
                self.today, current_time
            )
            minutes_until_due = time_diff.total_seconds() / 60

            # Notify if task is due now or overdue (within window)
            if (
                -NOTIFICATION_WINDOW_MINUTES
                <= minutes_until_due
                <= NOTIFICATION_WINDOW_MINUTES
            ):
                # Check if enough time has passed since last notification (5 min cooldown)
                last_notified = self.last_notification_time.get(task.id)
                can_notify = True
                if last_notified:
                    minutes_since_last = (now - last_notified).total_seconds() / 60
                    if minutes_since_last < NOTIFICATION_COOLDOWN_MINUTES:
                        can_notify = False

                if can_notify:
                    priority_text = ""
                    if task.priority == 4:
                        priority_text = " [P1 - Urgent!]"
                    elif task.priority == 3:
                        priority_text = " [P2 - High]"
                    elif task.priority == 2:
                        priority_text = " [P3 - Medium]"

                    title = f"Task Due{priority_text}"
                    message = task.content

                    if task.description:
                        # Truncate long descriptions
                        desc = task.description
                        if len(desc) > 100:
                            desc = desc[:97] + "..."
                        message = f"{task.content}\n{desc}"

                    # Send notification
                    send_notification(title, message)
                    self.last_notification_time[task.id] = now
                    notifications_sent += 1

                    # Check if task is computer-based before showing overlay
                    desc = getattr(task, "description", "")
                    if is_computer_task(task.content, desc):
                        # Show full-screen overlay with START button
                        self.show_task_overlay(task, mode="full")
                    else:
                        print(
                            f"  Skipping overlay - not a computer task: {task.content[:50]}"
                        )

        if notifications_sent > 0:
            print(f"  Sent {notifications_sent} notification(s)")
        else:
            print(f"  No tasks due")

    def run(self) -> None:
        """Run the notification loop."""
        print("Task Notifier started!")
        print(f"Checking every {CHECK_INTERVAL_SECONDS} seconds")
        print(f"Notification window: ±{NOTIFICATION_WINDOW_MINUTES} minutes")
        print(f"Notification cooldown: {NOTIFICATION_COOLDOWN_MINUTES} minutes")
        print("Smart overlay with corner timer and Spotify integration")
        print("Press Ctrl+C to stop\n")

        try:
            while True:
                self.check_and_notify()
                time.sleep(CHECK_INTERVAL_SECONDS)
        except KeyboardInterrupt:
            print("\n\nStopping notifier...")
            self.close()

    def close(self):
        """Close all active overlays and cleanup."""
        with self.overlay_lock:
            # Note: subprocess-based overlays can't be force-closed easily
            # They will remain until user clicks Done or closes the window
            self.active_overlays.clear()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Task Notifier - Sends notifications when Todoist tasks are due"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test mode: show a test notification and overlay immediately",
    )
    parser.add_argument(
        "--test-task",
        type=str,
        default="Test Task",
        help="Task name to use in test mode (default: 'Test Task')",
    )
    parser.add_argument(
        "--resume",
        type=str,
        help="Resume a specific task by ID from saved state",
    )
    parser.add_argument(
        "--list-active",
        action="store_true",
        help="List all active (in-progress) tasks and exit",
    )
    args = parser.parse_args()

    # Handle list-active command
    if args.list_active:
        active = list_active_tasks()
        if active:
            print("\nActive tasks:")
            for task_id, data in active.items():
                elapsed = data.get("elapsed_seconds", 0)
                minutes = int(elapsed / 60)
                print(f"  - {data.get('task_name', 'Unknown')[:50]}")
                print(f"    ID: {task_id}")
                print(f"    Time: {minutes} minutes")
                print()
        else:
            print("\nNo active tasks found.")
        return

    todoist_key = get_env_var("TODOIST_KEY")
    api = TodoistAPI(todoist_key)

    if args.test:
        print("\n" + "=" * 60)
        print("TEST MODE: Showing test notification and overlay")
        print("=" * 60 + "\n")

        # Create a fake task for testing with 30 second duration (0.5 minutes)
        class FakeTask:
            def __init__(self, content):
                self.id = "test-task-123"
                self.content = content
                self.priority = 3
                self.description = "This is a test task with full-screen overlay and Spotify integration. Click START to begin! 0.5m"

        test_task = FakeTask(args.test_task)
        notifier = TaskNotifier(api)

        # Send notification
        send_notification("Task Due [TEST MODE]", test_task.content)
        print("Test notification sent!")

        # Show overlay for test task with 15 second duration
        print(f"Showing overlay for: {test_task.content}")
        notifier.show_task_overlay(test_task, mode="full", estimated_duration=0.25)

        # Wait for overlay to close
        print("\nWaiting for overlay to close (Ctrl+C to exit)...")
        try:
            while "test-task-123" in notifier.active_overlays:
                time.sleep(0.1)
            print("\nTest completed! Overlay was closed.")
        except KeyboardInterrupt:
            notifier.close()
            print("\nTest interrupted.")

    elif args.resume:
        # Resume a specific task
        print(f"\nResuming task: {args.resume}")
        result = resume_task_overlay(args.resume)
        if result:
            print(f"Task completed: {result.get('completed', False)}")
            print(f"Time spent: {result.get('elapsed_seconds', 0) / 60:.1f} minutes")
        else:
            print(
                "Task not found in active tasks. Use --list-active to see available tasks."
            )
    else:
        notifier = TaskNotifier(api)
        notifier.run()


if __name__ == "__main__":
    main()
