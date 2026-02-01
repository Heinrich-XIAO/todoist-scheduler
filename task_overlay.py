"""
Task Overlay - Smart task overlay with full/corner modes, timer persistence, and progress tracking.

Features:
- Full-screen blocking overlay with START button
- Small draggable corner timer that stays on top with progress bar
- Mode switching: click corner overlay to show options, then expand to full
- Timer persistence across restarts
- Shows task name, description, elapsed time, and progress
- Analytics tracking for time estimation accuracy
"""

import tkinter as tk
from tkinter import ttk
import tkinter.font as tkfont
import time
import sys
import json
import os
from pathlib import Path
from typing import Optional, Dict, Any
import subprocess
from dotenv import load_dotenv

# Import analytics
from task_analytics import record_task_completion
from todoist_api_python.api import TodoistAPI

# Load environment
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env.local")

# State file for persistence
STATE_FILE = Path(__file__).parent / "overlay_state.json"


def set_macos_window_level(window):
    """Set macOS window level to keep it above all other windows."""
    try:
        # Try to use PyObjC to set window level
        import ctypes
        from ctypes import cdll, c_void_p, c_int

        # Get the window id from tkinter
        window_id = window.winfo_id()

        # Load Cocoa framework
        cocoa = cdll.LoadLibrary("/System/Library/Frameworks/Cocoa.framework/Cocoa")

        # NSFloatingWindowLevel = 5
        NSFloatingWindowLevel = 5

        # Get the NSWindow from the window id
        # This is a hack - we need to get the actual NSWindow object
        # For now, we'll use applescript to set the window level
        script = f"""
            tell application "System Events"
                tell window 1 of (first application process whose unix id is {os.getpid()})
                    set value of attribute "AXSubrole" to "AXFloatingWindow"
                end tell
            end tell
        """
        subprocess.run(["osascript", "-e", script], capture_output=True)
    except:
        pass


def play_spotify():
    """Start playing Spotify using osascript with better error handling."""
    try:
        # First, try to tell Spotify to play (works if already running)
        play_script = 'tell application "Spotify" to play'
        result = subprocess.run(
            ["osascript", "-e", play_script], capture_output=True, text=True, timeout=5
        )

        # If Spotify wasn't running, result will have an error
        if "error" in result.stderr.lower() or result.returncode != 0:
            # Spotify not running, try to activate it first
            activate_script = 'tell application "Spotify" to activate'
            subprocess.run(
                ["osascript", "-e", activate_script], capture_output=True, timeout=10
            )
            # Wait for it to open
            time.sleep(3)
            # Try to play again
            subprocess.run(
                ["osascript", "-e", play_script], capture_output=True, timeout=5
            )

        return True
    except Exception as e:
        print(f"Could not play Spotify: {e}", file=sys.stderr)
        return False


def load_state() -> Dict[str, Any]:
    """Load saved overlay state."""
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except:
            pass
    return {"active_tasks": {}, "completed_tasks": []}


def save_state(state: Dict[str, Any]):
    """Save overlay state."""
    STATE_FILE.write_text(json.dumps(state, indent=2))


def create_rounded_rectangle(canvas, x1, y1, x2, y2, radius, fill, outline="", width=1):
    """Draw a rounded rectangle on a canvas."""
    points = [
        x1 + radius,
        y1,
        x2 - radius,
        y1,
        x2,
        y1,
        x2,
        y1 + radius,
        x2,
        y2 - radius,
        x2,
        y2,
        x2 - radius,
        y2,
        x1 + radius,
        y2,
        x1,
        y2,
        x1,
        y2 - radius,
        x1,
        y1 + radius,
        x1,
        y1,
    ]
    return canvas.create_polygon(
        points, smooth=True, fill=fill, outline=outline, width=width
    )


def get_mono_font(root, size: int) -> tuple:
    """Pick the best available monospace font."""
    candidates = [
        "JetBrains Mono",
        "JetBrainsMono Nerd Font",
        "JetBrainsMonoNL Nerd Font",
        "SF Mono",
        "Menlo",
        "Monaco",
    ]
    try:
        available = set(tkfont.families(root))
        for name in candidates:
            if name in available:
                return (name, size)
    except Exception:
        pass
    return ("Menlo", size)


def get_system_font(root, size: int, bold: bool = False) -> tuple:
    """Pick the best available system font (SF Pro, Helvetica, etc)."""
    monospace_families = {
        "JetBrains Mono",
        "JetBrainsMono Nerd Font",
        "JetBrainsMonoNL Nerd Font",
        "SF Mono",
        "Menlo",
        "Monaco",
        "Courier",
        "Courier New",
    }
    candidates = [
        ".SF NS",
        ".SF NS Display",
        ".SF NS Text",
        "SF Pro Display",
        "SF Pro Text",
        "San Francisco",
        "Helvetica Neue",
        "Helvetica",
        "Arial",
    ]
    try:
        available = set(tkfont.families(root))
        for name in candidates:
            if name in available and name not in monospace_families:
                if bold:
                    return (name, size, "bold")
                return (name, size)
    except Exception:
        pass
    if bold:
        return ("Helvetica", size, "bold")
    return ("Helvetica", size)


def create_styled_button(
    parent,
    text,
    command,
    bg_color,
    fg_color="white",
    font=None,
    padx=20,
    pady=10,
    radius=8,
):
    """Create a styled rounded button that works on macOS with proper colors."""
    if font is None:
        font = ("Helvetica", 14, "bold")

    # Create a frame to hold the canvas
    btn_frame = tk.Frame(parent, bg=parent.cget("bg"))

    # Calculate dimensions
    temp_label = tk.Label(parent, text=text, font=font)
    temp_label.pack_forget()
    text_width = temp_label.winfo_reqwidth()
    text_height = temp_label.winfo_reqheight()
    width = text_width + padx * 2
    height = text_height + pady * 2

    # Create canvas for rounded button
    canvas = tk.Canvas(
        btn_frame,
        width=width,
        height=height,
        bg=parent.cget("bg"),
        highlightthickness=0,
        cursor="hand2",
    )
    canvas.pack()

    # Draw rounded rectangle
    create_rounded_rectangle(canvas, 0, 0, width, height, radius, fill=bg_color)

    # Add text
    canvas.create_text(width // 2, height // 2, text=text, font=font, fill=fg_color)

    # Bind click events
    def on_click(event):
        command()

    canvas.bind("<Button-1>", on_click)

    return btn_frame


class TaskOverlayWindow:
    """A task overlay that can switch between full and corner modes."""

    def __init__(
        self,
        task_name: str,
        task_id: str,
        description: str = "",
        mode: str = "full",  # "full" or "corner"
        elapsed_seconds: float = 0,
        output_file: str = None,
        estimated_duration: int = 30,  # Estimated time in minutes
    ):
        self.task_name = task_name
        self.task_id = task_id
        self.description = description
        self.mode = mode
        self.elapsed_seconds = elapsed_seconds
        self.output_file = output_file or "/tmp/task_overlay_result.json"
        self.estimated_duration = estimated_duration  # Store estimated duration

        self.root: Optional[tk.Tk] = None
        self.time_var: Optional[tk.StringVar] = None
        self.progress_var: Optional[tk.DoubleVar] = None  # For progress bar
        self.running = True
        self.completed = False
        self.timer_started = (
            elapsed_seconds > 0
        )  # Only start timer immediately if resuming
        self.start_time = (
            time.time() - elapsed_seconds if elapsed_seconds > 0 else time.time()
        )

        # Dragging state
        self.dragging = False
        self.drag_x = 0
        self.drag_y = 0

        # Menu state
        self.menu_expanded = False
        self.menu_frame = None

        # Timer callback tracking
        self.timer_after_id = None
        self.ensure_after_id = None

    def format_time(self, seconds: float) -> str:
        """Format seconds as MM:SS or HH:MM:SS."""
        minutes = int(seconds // 60)
        seconds = int(seconds % 60)
        hours = minutes // 60
        minutes = minutes % 60

        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        return f"{minutes:02d}:{seconds:02d}"

    def update_timer(self):
        """Update the stopwatch display and progress bar."""
        if not self.running or not self.root:
            return

        # Keep on top - always do this regardless of timer state
        self.root.lift()
        self.root.attributes("-topmost", True)

        # Don't update display if timer hasn't been started yet (for new tasks)
        if not self.timer_started:
            self.timer_after_id = self.root.after(100, self.update_timer)
            return

        elapsed = time.time() - self.start_time
        if self.time_var:
            self.time_var.set(self.format_time(elapsed))

        # Update time text on progress canvas
        if hasattr(self, "progress_canvas"):
            self.progress_canvas.itemconfig("time_text", text=self.format_time(elapsed))

        # Update progress bar
        if self.progress_var:
            estimated_seconds = self.estimated_duration * 60
            progress = min(100, (elapsed / estimated_seconds) * 100)
            self.progress_var.set(progress)

            # Update visual progress bar (background fill)
            if hasattr(self, "progress_canvas") and hasattr(self, "progress_rect"):
                width = self.progress_canvas.winfo_width()
                fill_width = (width * progress) / 100
                canvas_height = self.progress_canvas.winfo_height()
                self.progress_canvas.coords(
                    self.progress_rect,
                    0,
                    0,
                    fill_width,
                    canvas_height,
                )
                # Update border position at the end of progress
                if hasattr(self, "progress_border"):
                    self.progress_canvas.coords(
                        self.progress_border, fill_width, 0, fill_width, canvas_height
                    )

        # Save state periodically
        if int(elapsed) % 5 == 0:  # Every 5 seconds
            self.save_current_state()

        self.timer_after_id = self.root.after(100, self.update_timer)

    def save_current_state(self):
        """Save current progress to state file."""
        state = load_state()
        elapsed = time.time() - self.start_time
        state["active_tasks"][self.task_id] = {
            "task_name": self.task_name,
            "description": self.description,
            "elapsed_seconds": elapsed,
            "mode": self.mode,
            "last_updated": time.time(),
            "estimated_duration": self.estimated_duration,
        }
        save_state(state)

    def on_start(self):
        """Handle START button - start timer, switch to corner mode and start Spotify."""
        # Start the timer now
        self.timer_started = True
        self.start_time = time.time() - self.elapsed_seconds

        # Start Spotify playing
        play_spotify()

        self.mode = "corner"
        self.save_current_state()

        # CRITICAL: Destroy old root and create new one for corner mode
        # First store reference to old root
        old_root = self.root

        # Cancel pending callbacks on the OLD root before destroying it
        if self.timer_after_id and old_root:
            try:
                old_root.after_cancel(self.timer_after_id)
            except:
                pass
        if self.ensure_after_id and old_root:
            try:
                old_root.after_cancel(self.ensure_after_id)
            except:
                pass
        self.timer_after_id = None
        self.ensure_after_id = None

        # Now create new root and destroy old
        self.root = tk.Tk()
        old_root.destroy()

        self.build_corner()
        self.update_timer()
        self.ensure_after_id = self.root.after(100, self.ensure_on_top)

    def on_done(self):
        """Handle DONE button - complete the task in Todoist and record analytics."""
        self.completed = True
        self.running = False

        elapsed = time.time() - self.start_time
        elapsed_minutes = elapsed / 60

        # Complete the task in Todoist
        try:
            todoist_key = os.getenv("TODOIST_KEY")
            if todoist_key:
                api = TodoistAPI(todoist_key)
                api.close_task(self.task_id)
                print(f"Task '{self.task_name[:30]}' marked as complete in Todoist")
        except Exception as e:
            print(f"Could not complete task in Todoist: {e}", file=sys.stderr)

        # Record analytics
        record_task_completion(
            task_id=self.task_id,
            task_name=self.task_name,
            estimated_minutes=self.estimated_duration,
            actual_minutes=elapsed_minutes,
            completed=True,
        )

        # Save completion
        state = load_state()
        if self.task_id in state["active_tasks"]:
            del state["active_tasks"][self.task_id]
        state["completed_tasks"].append(
            {
                "task_id": self.task_id,
                "task_name": self.task_name,
                "elapsed_seconds": elapsed,
                "completed_at": time.time(),
            }
        )
        save_state(state)

        # Write result for parent process
        result = {
            "task_id": self.task_id,
            "elapsed_seconds": elapsed,
            "completed": True,
        }
        Path(self.output_file).write_text(json.dumps(result))

        if self.root:
            self.root.destroy()

    def on_cancel(self):
        """Handle CANCEL button - stop timer without completing and record analytics."""
        self.running = False

        elapsed = time.time() - self.start_time
        elapsed_minutes = elapsed / 60

        # Record analytics (partial completion)
        record_task_completion(
            task_id=self.task_id,
            task_name=self.task_name,
            estimated_minutes=self.estimated_duration,
            actual_minutes=elapsed_minutes,
            completed=False,
        )

        # Remove from active tasks
        state = load_state()
        if self.task_id in state["active_tasks"]:
            del state["active_tasks"][self.task_id]
        save_state(state)

        # Write result for parent process
        result = {
            "task_id": self.task_id,
            "elapsed_seconds": elapsed,
            "completed": False,
        }
        Path(self.output_file).write_text(json.dumps(result))

        if self.root:
            self.root.destroy()

    def on_expand(self):
        """Handle expand from corner to full screen."""
        self.mode = "full"
        self.rebuild_window()

    def on_minimize(self):
        """Handle minimize from full to corner."""
        self.mode = "corner"
        self.rebuild_window()

    def start_drag(self, event):
        """Start dragging the window."""
        self.dragging = True
        self.drag_x = event.x
        self.drag_y = event.y

    def do_drag(self, event):
        """Handle window drag."""
        if self.dragging:
            x = self.root.winfo_x() + event.x - self.drag_x
            y = self.root.winfo_y() + event.y - self.drag_y
            self.root.geometry(f"+{x}+{y}")

    def stop_drag(self, event):
        """Stop dragging."""
        self.dragging = False
        # Save position
        if self.mode == "corner":
            state = load_state()
            if "corner_position" not in state:
                state["corner_position"] = {}
            state["corner_position"][self.task_id] = {
                "x": self.root.winfo_x(),
                "y": self.root.winfo_y(),
            }
            save_state(state)

    def toggle_menu(self):
        """Toggle the expanded menu with action buttons."""
        if hasattr(self, "menu_expanded") and self.menu_expanded:
            self.hide_menu()
        else:
            self.show_menu()

    def show_menu(self):
        """Show the expanded menu with Done/Cancel buttons."""
        self.menu_expanded = True

        # Create menu frame below the main content
        self.menu_frame = tk.Frame(self.root, bg="#3d3d3d", height=30)
        self.menu_frame.pack(fill=tk.X, side=tk.BOTTOM)
        self.menu_frame.pack_propagate(False)

        # Button frame
        btn_container = tk.Frame(self.menu_frame, bg="#3d3d3d")
        btn_container.pack(expand=True)

        # Done button
        create_styled_button(
            btn_container,
            text="Done",
            command=self.on_done,
            bg_color="#00aa00",
            fg_color="white",
            font=("Helvetica", 9, "bold"),
            padx=15,
            pady=2,
        ).pack(side=tk.LEFT, padx=(0, 8))

        # Cancel button
        create_styled_button(
            btn_container,
            text="Cancel",
            command=self.on_cancel,
            bg_color="#cc0000",
            fg_color="white",
            font=("Helvetica", 9),
            padx=15,
            pady=2,
        ).pack(side=tk.LEFT)

        # Expand window height
        current_width = self.root.winfo_width()
        self.root.geometry(f"{current_width}x65")

    def hide_menu(self):
        """Hide the expanded menu."""
        self.menu_expanded = False
        if hasattr(self, "menu_frame"):
            self.menu_frame.destroy()

        # Shrink window back
        current_width = self.root.winfo_width()
        self.root.geometry(f"{current_width}x35")

    def ensure_on_top(self):
        """Periodically ensure window stays on top of all other windows without taking focus."""
        if self.root and self.mode == "corner":
            # Use both lift() and topmost like the test that worked
            self.root.lift()
            self.root.attributes("-topmost", True)

            # Schedule next check frequently (100ms)
            self.ensure_after_id = self.root.after(100, self.ensure_on_top)

    def build_full_screen(self):
        """Build the full-screen overlay UI."""
        # Remove window decorations
        self.root.overrideredirect(True)

        # Full screen
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        self.root.geometry(f"{screen_width}x{screen_height}+0+0")
        self.root.configure(bg="#1a1a1a")

        # Keep on top
        self.root.attributes("-topmost", True)
        self.root.lift()

        # Content frame
        content = tk.Frame(self.root, bg="#1a1a1a")
        content.place(relx=0.5, rely=0.5, anchor="center")

        # Task name
        tk.Label(
            content,
            text=self.task_name,
            font=("Helvetica", 48, "bold"),
            fg="white",
            bg="#1a1a1a",
            wraplength=screen_width - 100,
        ).pack(pady=(0, 20))

        # Description (if any)
        if self.description:
            tk.Label(
                content,
                text=self.description,
                font=("Helvetica", 24),
                fg="#aaaaaa",
                bg="#1a1a1a",
                wraplength=screen_width - 200,
            ).pack(pady=(0, 40))

        if not self.timer_started:
            # Show START button for new tasks
            tk.Label(
                content,
                text="Ready to focus?",
                font=("Helvetica", 32),
                fg="#00ff00",
                bg="#1a1a1a",
            ).pack(pady=(0, 30))

            create_styled_button(
                content,
                text="START TASK",
                command=self.on_start,
                bg_color="#00aa00",
                fg_color="white",
                font=("Helvetica", 36, "bold"),
                padx=60,
                pady=20,
            ).pack(pady=(0, 15))

            # Show estimated duration
            tk.Label(
                content,
                text=f"Estimated: {self.estimated_duration} minutes",
                font=("Helvetica", 18),
                fg="#888888",
                bg="#1a1a1a",
            ).pack()

            # Cancel button
            create_styled_button(
                content,
                text="CANCEL",
                command=self.on_cancel,
                bg_color="#666666",
                fg_color="white",
                font=("Helvetica", 18),
                padx=30,
                pady=10,
            ).pack(pady=(30, 0))
        else:
            # Timer is running - show options
            self.time_var = tk.StringVar(value=self.format_time(self.elapsed_seconds))
            tk.Label(
                content,
                textvariable=self.time_var,
                font=("Helvetica", 72, "bold"),
                fg="#00ff00",
                bg="#1a1a1a",
            ).pack(pady=(0, 30))

            # Progress bar in full screen
            progress_frame = tk.Frame(content, bg="#1a1a1a")
            progress_frame.pack(fill=tk.X, pady=(0, 30), padx=100)

            self.progress_var = tk.DoubleVar(value=0)
            progress_bar = ttk.Progressbar(
                progress_frame,
                variable=self.progress_var,
                maximum=100,
                length=600,
                mode="determinate",
            )
            progress_bar.pack()

            # Progress label
            tk.Label(
                progress_frame,
                text=f"Goal: {self.estimated_duration} minutes",
                font=("Helvetica", 14),
                fg="#888888",
                bg="#1a1a1a",
            ).pack(pady=(5, 0))

            # Buttons frame
            btn_frame2 = tk.Frame(content, bg="#1a1a1a")
            btn_frame2.pack()

            create_styled_button(
                btn_frame2,
                text="CONTINUE (Corner Mode)",
                command=self.on_minimize,
                bg_color="#0066cc",
                fg_color="white",
                font=("Helvetica", 24, "bold"),
                padx=40,
                pady=15,
            ).pack(pady=(0, 15))

            create_styled_button(
                btn_frame2,
                text="DONE",
                command=self.on_done,
                bg_color="#00aa00",
                fg_color="white",
                font=("Helvetica", 24, "bold"),
                padx=60,
                pady=15,
            ).pack(pady=(0, 15))

            create_styled_button(
                btn_frame2,
                text="CANCEL",
                command=self.on_cancel,
                bg_color="#cc0000",
                fg_color="white",
                font=("Helvetica", 18),
                padx=40,
                pady=10,
            ).pack()

        # Block all input
        self.root.grab_set()
        self.root.bind("<Escape>", lambda e: None)  # Disable escape
        self.root.bind("<Command-w>", lambda e: "break")
        self.root.bind("<Command-q>", lambda e: "break")

    def build_corner(self):
        """Build the compact horizontal bar overlay UI."""
        print("DEBUG: build_corner() called", flush=True)

        # Wide, short bar layout - slightly taller, slightly less wide
        width, height = 300, 50

        # Remove OS title bar
        self.root.overrideredirect(True)

        # Try to reduce window rounding on macOS using tk attributes
        try:
            self.root.tk.call("tk", "scaling", 1.0)
        except:
            pass

        # Set initial size and position
        self.root.geometry(f"{width}x{height}")
        self.root.update_idletasks()

        # Position at bottom-middle
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - width) // 2
        y = screen_height - height - 40
        print(
            f"DEBUG: Positioning window at {x},{y} (screen: {screen_width}x{screen_height})",
            flush=True,
        )
        self.root.geometry(f"{width}x{height}+{x}+{y}")

        self.root.attributes("-topmost", True)

        # Make window draggable
        self.root.bind("<Button-1>", self.start_drag)
        self.root.bind("<B1-Motion>", self.do_drag)
        self.root.bind("<ButtonRelease-1>", self.stop_drag)

        # Progress bar as background - use canvas for custom progress
        self.progress_canvas = tk.Canvas(
            self.root, width=width, height=height, bg="#333333", highlightthickness=0
        )
        self.progress_canvas.pack(fill=tk.BOTH, expand=True)

        # Progress bar rectangle (fills from left based on progress) - using stipple for transparency
        self.progress_rect = self.progress_canvas.create_rectangle(
            0, 0, 0, height, fill="#287a3e", outline="", stipple="gray25"
        )

        # Progress end border - thin line at the edge (1px)
        self.progress_border = self.progress_canvas.create_line(
            0, 0, 0, height, fill="#3d9c5a", width=1
        )

        # Place labels directly on root window (no content frame) so progress bar shows through
        self.time_var = tk.StringVar(
            master=self.root, value=self.format_time(self.elapsed_seconds)
        )

        # Time text directly on progress canvas (no background)
        mono_font = get_mono_font(self.root, 11)
        self.progress_canvas.create_text(
            12 + 35,
            height // 2,
            text=self.format_time(self.elapsed_seconds),
            font=mono_font,
            fill="#ffffff",
            tags="time_text",
            anchor="center",
        )

        # Drag handle (6-dot icon) on the right
        dot_color = "#666666"
        dot_r = 1.5
        dot_gap = 5
        dot_start_x = width - 16
        dot_start_y = (height // 2) - 6
        for row in range(3):
            for col in range(2):
                x = dot_start_x + (col * dot_gap)
                y = dot_start_y + (row * dot_gap)
                self.progress_canvas.create_oval(
                    x - dot_r,
                    y - dot_r,
                    x + dot_r,
                    y + dot_r,
                    fill=dot_color,
                    outline=dot_color,
                )

        # Task name text directly on progress canvas (no background)
        display_name = (
            self.task_name[:22] + "..." if len(self.task_name) > 22 else self.task_name
        )
        system_font_bold = ("SF Mono", 11)
        self.progress_canvas.create_text(
            92,
            height // 2,
            text=display_name,
            font=system_font_bold,
            fill="#ffffff",
            tags="task_text",
            anchor="w",
        )

        # Hover buttons - appear on the right side when hovering, drawn on progress canvas
        # Create button text items with rounded borders
        system_font = ("SF Mono", 10)
        btn_font = tkfont.Font(
            root=self.root, family=system_font[0], size=system_font[1]
        )
        btn_height = btn_font.metrics("linespace")
        btn_pad_x = 6
        btn_pad_y = 5

        complete_text = "Complete"
        cancel_text = "Cancel"
        complete_w = btn_font.measure(complete_text)
        cancel_w = btn_font.measure(cancel_text)
        btn_w = max(complete_w, cancel_w)

        complete_x = 15
        complete_y = height // 2
        cancel_x = complete_x + btn_w + (btn_pad_x * 2) + 10
        cancel_y = height // 2

        # Complete button border
        self.complete_box = create_rounded_rectangle(
            self.progress_canvas,
            complete_x - btn_pad_x,
            complete_y - (btn_height // 2) - btn_pad_y,
            complete_x + btn_w + btn_pad_x,
            complete_y + (btn_height // 2) + btn_pad_y,
            22,
            fill="#222222",
            outline="#444444",
            width=1,
        )
        self.progress_canvas.itemconfig(
            self.complete_box, state="hidden", tags=("btn_complete_box",)
        )

        self.complete_text = self.progress_canvas.create_text(
            complete_x + (btn_w / 2),
            complete_y,
            text=complete_text,
            font=system_font,
            fill="#ffffff",
            tags="btn_complete",
            anchor="center",
            state="hidden",
        )

        # Cancel button border
        self.cancel_box = create_rounded_rectangle(
            self.progress_canvas,
            cancel_x - btn_pad_x,
            cancel_y - (btn_height // 2) - btn_pad_y,
            cancel_x + btn_w + btn_pad_x,
            cancel_y + (btn_height // 2) + btn_pad_y,
            22,
            fill="#222222",
            outline="#444444",
            width=1,
        )
        self.progress_canvas.itemconfig(
            self.cancel_box, state="hidden", tags=("btn_cancel_box",)
        )

        self.cancel_text = self.progress_canvas.create_text(
            cancel_x + (btn_w / 2),
            cancel_y,
            text=cancel_text,
            font=system_font,
            fill="#ffffff",
            tags="btn_cancel",
            anchor="center",
            state="hidden",
        )

        # Bind click events to button text and borders
        self.progress_canvas.tag_bind(
            "btn_complete", "<Button-1>", lambda e: self.on_done()
        )
        self.progress_canvas.tag_bind(
            "btn_complete_box", "<Button-1>", lambda e: self.on_done()
        )
        self.progress_canvas.tag_bind(
            "btn_cancel", "<Button-1>", lambda e: self.on_cancel()
        )
        self.progress_canvas.tag_bind(
            "btn_cancel_box", "<Button-1>", lambda e: self.on_cancel()
        )
        self.progress_canvas.tag_bind(
            "btn_complete",
            "<Enter>",
            lambda e: self.progress_canvas.itemconfig("btn_complete", fill="#cccccc"),
        )
        self.progress_canvas.tag_bind(
            "btn_complete",
            "<Leave>",
            lambda e: self.progress_canvas.itemconfig("btn_complete", fill="#ffffff"),
        )
        self.progress_canvas.tag_bind(
            "btn_cancel",
            "<Enter>",
            lambda e: self.progress_canvas.itemconfig("btn_cancel", fill="#cccccc"),
        )
        self.progress_canvas.tag_bind(
            "btn_cancel",
            "<Leave>",
            lambda e: self.progress_canvas.itemconfig("btn_cancel", fill="#ffffff"),
        )

        # Track hover state
        self.hover_hide_after_id = None
        self.is_hovering = False

        def check_mouse_hover():
            """Global mouse tracking - works even without focus."""
            if not self.root:
                return

            # Get mouse position on screen
            mouse_x = self.root.winfo_pointerx()
            mouse_y = self.root.winfo_pointery()

            # Get window position and size
            win_x = self.root.winfo_x()
            win_y = self.root.winfo_y()
            win_width = self.root.winfo_width()
            win_height = self.root.winfo_height()

            # Check if mouse is inside window
            is_over = (
                win_x <= mouse_x <= win_x + win_width
                and win_y <= mouse_y <= win_y + win_height
            )

            if is_over and not self.is_hovering:
                # Mouse entered - show buttons, hide text
                self.is_hovering = True
                if self.hover_hide_after_id:
                    self.root.after_cancel(self.hover_hide_after_id)
                    self.hover_hide_after_id = None
                # Hide text elements
                self.progress_canvas.itemconfig("time_text", state="hidden")
                self.progress_canvas.itemconfig("task_text", state="hidden")
                # Show buttons
                self.progress_canvas.itemconfig("btn_complete", state="normal")
                self.progress_canvas.itemconfig("btn_cancel", state="normal")
                self.progress_canvas.itemconfig("btn_complete_box", state="normal")
                self.progress_canvas.itemconfig("btn_cancel_box", state="normal")
            elif not is_over and self.is_hovering:
                # Mouse left - schedule hide
                self.is_hovering = False
                if self.hover_hide_after_id:
                    self.root.after_cancel(self.hover_hide_after_id)
                self.hover_hide_after_id = self.root.after(150, do_hide)

            # Schedule next check
            self.root.after(50, check_mouse_hover)

        def do_hide():
            """Actually hide the buttons and show text again."""
            if not self.is_hovering and self.root:
                # Hide buttons
                self.progress_canvas.itemconfig("btn_complete", state="hidden")
                self.progress_canvas.itemconfig("btn_cancel", state="hidden")
                self.progress_canvas.itemconfig("btn_complete_box", state="hidden")
                self.progress_canvas.itemconfig("btn_cancel_box", state="hidden")
                # Show text elements again
                self.progress_canvas.itemconfig("time_text", state="normal")
                self.progress_canvas.itemconfig("task_text", state="normal")
            self.hover_hide_after_id = None

        # Start global mouse tracking
        self.is_hovering = False
        self.hover_hide_after_id = None
        self.root.after(50, check_mouse_hover)

        # Store for updating progress visual
        self.progress_var = tk.DoubleVar(master=self.root, value=0)

    def rebuild_window(self):
        """Rebuild the window in current mode."""
        if self.mode == "corner":
            # For corner mode, create fresh window (like the test that worked)
            old_root = self.root
            self.root = tk.Tk()
            if old_root:
                old_root.destroy()
            self.build_corner()
            self.update_timer()
            self.ensure_after_id = self.root.after(100, self.ensure_on_top)
        else:
            # For full screen, just rebuild widgets
            if self.root:
                for widget in self.root.winfo_children():
                    widget.destroy()
            self.build_full_screen()
            self.update_timer()

    def run(self):
        """Run the overlay."""
        self.root = tk.Tk()

        if self.mode == "full":
            self.build_full_screen()
        else:
            self.build_corner()
            # Start periodic check to keep corner window on top (start immediately)
            self.ensure_after_id = self.root.after(100, self.ensure_on_top)

        # Start timer
        self.update_timer()

        # Run
        self.root.mainloop()

        # Return completion status
        return self.completed


def create_overlay(
    task_name: str,
    task_id: str,
    description: str = "",
    mode: str = "full",
    elapsed_seconds: float = 0,
    output_file: str = None,
    estimated_duration: int = 30,
):
    """Create and run overlay."""
    overlay = TaskOverlayWindow(
        task_name=task_name,
        task_id=task_id,
        description=description,
        mode=mode,
        elapsed_seconds=elapsed_seconds,
        output_file=output_file,
        estimated_duration=estimated_duration,
    )
    return overlay.run()


def show_task_overlay(
    task_name: str,
    task_id: str,
    description: str = "",
    mode: str = "full",
    elapsed_seconds: float = 0,
    estimated_duration: int = 30,
) -> dict:
    """Show overlay in subprocess and return result."""
    import tempfile
    import sys as _sys

    result_file = tempfile.mktemp(suffix=".json")
    script_path = Path(__file__).resolve()

    # Build command
    cmd = [
        sys.executable,
        str(script_path),
        "--task-name",
        task_name,
        "--task-id",
        task_id,
        "--mode",
        mode,
        "--elapsed",
        str(elapsed_seconds),
        "--output",
        result_file,
        "--estimated-duration",
        str(estimated_duration),
    ]
    if description:
        cmd.extend(["--description", description])

    # DEBUG: Log what we're doing
    _sys.stdout.write(
        f"DEBUG: Launching overlay subprocess with executable: {_sys.executable}\n"
    )
    _sys.stdout.write(f"DEBUG: Script path: {script_path}\n")
    _sys.stdout.write(f"DEBUG: Mode: {mode}\n")
    _sys.stdout.flush()

    # Run subprocess - let stdout/stderr flow through to terminal for debugging
    proc = subprocess.Popen(cmd)
    proc.wait()

    # Read result
    try:
        result = json.loads(Path(result_file).read_text())
        Path(result_file).unlink()
        return result
    except:
        return {"completed": False, "elapsed_seconds": 0}


def load_state() -> Dict[str, Any]:
    """Load saved overlay state."""
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except:
            pass
    return {"active_tasks": {}, "completed_tasks": []}


def save_state(state: Dict[str, Any]):
    """Save overlay state."""
    STATE_FILE.write_text(json.dumps(state, indent=2))


def list_active_tasks() -> Dict[str, Any]:
    """List all active (in-progress) tasks."""
    state = load_state()
    return state.get("active_tasks", {})


def resume_task_overlay(task_id: str) -> Optional[dict]:
    """Resume a specific task by ID from saved state."""
    state = load_state()
    if task_id not in state.get("active_tasks", {}):
        return None

    task_data = state["active_tasks"][task_id]

    # Run overlay with saved state
    return show_task_overlay(
        task_name=task_data["task_name"],
        task_id=task_id,
        description=task_data.get("description", ""),
        mode=task_data.get("mode", "corner"),
        elapsed_seconds=task_data.get("elapsed_seconds", 0),
        estimated_duration=task_data.get("estimated_duration", 30),
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--task-name", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--description", default="")
    parser.add_argument("--mode", default="full")
    parser.add_argument("--elapsed", type=float, default=0)
    parser.add_argument("--output", required=True)
    parser.add_argument("--estimated-duration", type=float, default=30)
    args = parser.parse_args()

    result = create_overlay(
        task_name=args.task_name,
        task_id=args.task_id,
        description=args.description,
        mode=args.mode,
        elapsed_seconds=args.elapsed,
        output_file=args.output,
        estimated_duration=args.estimated_duration,
    )

    # Output result as JSON
    print(json.dumps({"completed": result}))
