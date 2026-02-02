from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import tkinter as tk
import tkinter.font as tkfont
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from todoist_api_python.api import TodoistAPI

from src.analytics import record_task_completion
from src.overlay_state import load_state, save_state
from src.integrations.openrouter import estimate_minutes


def play_spotify() -> bool:
    try:
        play_script = 'tell application "Spotify" to play'
        result = subprocess.run(
            ["osascript", "-e", play_script],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if "error" in result.stderr.lower() or result.returncode != 0:
            activate_script = 'tell application "Spotify" to activate'
            subprocess.run(
                ["osascript", "-e", activate_script], capture_output=True, timeout=10
            )
            time.sleep(3)
            subprocess.run(
                ["osascript", "-e", play_script], capture_output=True, timeout=5
            )
        return True
    except Exception as e:
        print(f"Could not play Spotify: {e}", file=sys.stderr)
        return False


def create_rounded_rectangle(canvas, x1, y1, x2, y2, radius, fill, outline="", width=1):
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


def create_styled_button(
    parent,
    text,
    command,
    bg_color,
    fg_color="white",
    font=None,
    padx=20,
    pady=10,
    radius=None,
):
    if font is None:
        font = get_system_font(parent, 14, "bold")

    btn_frame = tk.Frame(parent, bg=parent.cget("bg"))
    temp_label = tk.Label(parent, text=text, font=font)
    temp_label.pack_forget()
    text_width = temp_label.winfo_reqwidth()
    text_height = temp_label.winfo_reqheight()
    temp_label.destroy()
    width = text_width + padx * 2
    height = text_height + pady * 2
    if radius is None:
        radius = min(width, height) // 2

    canvas = tk.Canvas(
        btn_frame,
        width=width,
        height=height,
        bg=parent.cget("bg"),
        highlightthickness=0,
        cursor="hand2",
    )
    canvas.pack()
    create_rounded_rectangle(canvas, 0, 0, width, height, radius, fill=bg_color)
    canvas.create_text(width // 2, height // 2, text=text, font=font, fill=fg_color)
    canvas.bind("<Button-1>", lambda _e: command())
    return btn_frame


def get_mono_font(root, size: int) -> tuple:
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


def get_system_font(root, size: int, weight: str | None = None) -> tuple:
    candidates = [
        "SF Pro Text",
        "SF Pro Display",
        "Helvetica Neue",
        "Helvetica",
        "Arial",
    ]
    try:
        available = set(tkfont.families(root))
        for name in candidates:
            if name in available:
                if weight:
                    return (name, size, weight)
                return (name, size)
    except Exception:
        pass
    if weight:
        return ("Helvetica", size, weight)
    return ("Helvetica", size)


class TaskOverlayWindow:
    def __init__(
        self,
        task_name: str,
        task_id: str,
        description: str = "",
        mode: str = "full",
        elapsed_seconds: float = 0,
        output_file: str | None = None,
        estimated_duration: float = 30,
    ):
        self.task_name = task_name
        self.task_id = task_id
        self.description = description
        self.mode = mode
        self.elapsed_seconds = elapsed_seconds
        self.output_file = output_file or "/tmp/task_overlay_result.json"
        self.estimated_duration = float(estimated_duration)

        self.root: Optional[tk.Tk] = None
        self.time_var: Optional[tk.StringVar] = None
        self.progress_var: Optional[tk.DoubleVar] = None

        self.running = True
        self.completed = False

        self.timer_started = elapsed_seconds > 0
        self.start_time = (
            time.time() - elapsed_seconds if elapsed_seconds > 0 else time.time()
        )

        self.dragging = False
        self.drag_x = 0
        self.drag_y = 0

        self.timer_after_id = None
        self.ensure_after_id = None
        self.hover_hide_after_id = None
        self.is_hovering = False

        # Load snooze count from state
        state = load_state()
        task_state = state.get("active_tasks", {}).get(task_id, {})
        self.snooze_count = task_state.get("snooze_count", 0)
        self.snooze_until = task_state.get("snooze_until", 0)

    def format_time(self, seconds: float) -> str:
        minutes = int(seconds // 60)
        seconds = int(seconds % 60)
        hours = minutes // 60
        minutes = minutes % 60
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        return f"{minutes:02d}:{seconds:02d}"

    def on_snooze(self):
        """Handle snooze button press. First snooze is free, subsequent ones require AI justification."""
        if self.snooze_count == 0:
            # First snooze is free
            self._do_snooze()
        else:
            # Need AI justification for additional snoozes
            self._show_justification_dialog()

    def _do_snooze(self):
        """Execute the snooze: close overlay and schedule reappear in 5 minutes."""
        self.snooze_count += 1
        self.snooze_until = time.time() + 300  # 5 minutes

        # Save snooze state
        state = load_state()
        state.setdefault("active_tasks", {})
        state["active_tasks"][self.task_id] = {
            "task_name": self.task_name,
            "description": self.description,
            "elapsed_seconds": self.elapsed_seconds,
            "mode": self.mode,
            "last_updated": time.time(),
            "estimated_duration": self.estimated_duration,
            "snooze_count": self.snooze_count,
            "snooze_until": self.snooze_until,
            "snoozed": True,
        }
        save_state(state)

        # Close the overlay without recording completion
        if self.root:
            self.root.destroy()

    def _show_justification_dialog(self):
        """Show a dialog asking user to justify why they need more time."""
        if not self.root:
            return

        # Create justification dialog
        dialog = tk.Toplevel(self.root)
        dialog.title("Justification Required")
        dialog.geometry("500x300")
        dialog.configure(bg="#1a1a1a")
        dialog.attributes("-topmost", True)
        dialog.transient(self.root)
        dialog.grab_set()

        # Center the dialog
        dialog.update_idletasks()
        x = (dialog.winfo_screenwidth() // 2) - (500 // 2)
        y = (dialog.winfo_screenheight() // 2) - (300 // 2)
        dialog.geometry(f"500x300+{x}+{y}")

        tk.Label(
            dialog,
            text="You've already snoozed once.",
            font=get_system_font(dialog, 18, "bold"),
            fg="#ffaa00",
            bg="#1a1a1a",
        ).pack(pady=(20, 10))

        tk.Label(
            dialog,
            text="Why do you need another 5 minutes?",
            font=get_system_font(dialog, 14),
            fg="white",
            bg="#1a1a1a",
        ).pack(pady=(0, 10))

        # Text entry for justification
        justification_var = tk.StringVar()
        entry = tk.Entry(
            dialog,
            textvariable=justification_var,
            font=get_system_font(dialog, 12),
            width=40,
            bg="#333333",
            fg="white",
            insertbackground="white",
        )
        entry.pack(pady=(0, 20), padx=20)
        entry.focus()

        result = {"approved": False}

        def submit():
            justification = justification_var.get().strip()
            if not justification:
                return

            # Check with AI if justification is reasonable
            dialog.destroy()
            self._check_justification_with_ai(justification, result)

        def cancel():
            dialog.destroy()

        btn_frame = tk.Frame(dialog, bg="#1a1a1a")
        btn_frame.pack(pady=(10, 0))

        create_styled_button(
            btn_frame,
            text="SUBMIT",
            command=submit,
            bg_color="#00aa00",
            font=get_system_font(dialog, 14, "bold"),
            padx=30,
            pady=10,
        ).pack(side=tk.LEFT, padx=(0, 10))

        create_styled_button(
            btn_frame,
            text="CANCEL",
            command=cancel,
            bg_color="#cc0000",
            font=get_system_font(dialog, 14, "bold"),
            padx=30,
            pady=10,
        ).pack(side=tk.LEFT)

    def _check_justification_with_ai(self, justification: str, result: dict):
        """Send justification to AI for approval."""
        api_key = os.getenv("OPENROUTER_KEY")

        if not api_key:
            # No AI available, just allow the snooze
            self._show_result_dialog(True, "No AI available - snooze approved", result)
            return

        proxy_url = os.getenv(
            "OPENROUTER_PROXY", "https://openrouter.ai/api/v1"
        ).rstrip("/")

        prompt = (
            f"Task: {self.task_name}\n"
            f"Description: {self.description}\n"
            f"User's justification for needing 5 more minutes: {justification}\n\n"
            "Is this a reasonable justification? Reply with ONLY 'YES' or 'NO'.\n"
            "Be understanding but firm. Valid reasons: urgent interruption, need to finish something quick, "
            "not feeling ready yet. Invalid reasons: laziness, procrastination, no reason given."
        )

        try:
            import requests

            response = requests.post(
                f"{proxy_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://todoist-scheduler.local",
                    "X-Title": "Todoist Scheduler",
                },
                json={
                    "model": "moonshotai/kimi-k2-5",
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a productivity assistant. Be firm but fair. Reply with ONLY 'YES' or 'NO'.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 10,
                    "temperature": 0.3,
                },
                timeout=10,
            )
            response.raise_for_status()

            content = response.json()["choices"][0]["message"]["content"].upper()
            approved = "YES" in content and "NO" not in content

            if approved:
                self._show_result_dialog(True, "AI approved your justification", result)
            else:
                self._show_result_dialog(
                    False, "AI rejected: time to start the task", result
                )

        except Exception as e:
            # On error, allow the snooze
            print(f"AI check failed: {e}", file=sys.stderr)
            self._show_result_dialog(True, "AI check failed - snooze approved", result)

    def _show_result_dialog(self, approved: bool, message: str, result: dict):
        """Show the result of the AI justification check."""
        if not self.root:
            return

        dialog = tk.Toplevel(self.root)
        dialog.title("Result")
        dialog.geometry("400x200")
        dialog.configure(bg="#1a1a1a")
        dialog.attributes("-topmost", True)
        dialog.transient(self.root)
        dialog.grab_set()

        dialog.update_idletasks()
        x = (dialog.winfo_screenwidth() // 2) - (400 // 2)
        y = (dialog.winfo_screenheight() // 2) - (200 // 2)
        dialog.geometry(f"400x200+{x}+{y}")

        color = "#00ff00" if approved else "#ff4444"

        tk.Label(
            dialog,
            text=message,
            font=get_system_font(dialog, 16, "bold"),
            fg=color,
            bg="#1a1a1a",
            wraplength=350,
        ).pack(pady=(40, 30))

        def on_ok():
            dialog.destroy()
            if approved:
                self._do_snooze()

        create_styled_button(
            dialog,
            text="OK",
            command=on_ok,
            bg_color="#0066cc" if approved else "#666666",
            font=get_system_font(dialog, 14, "bold"),
            padx=40,
            pady=10,
        ).pack()

    def update_timer(self):
        if not self.running or not self.root:
            return

        self.root.lift()
        self.root.attributes("-topmost", True)

        if not self.timer_started:
            self.timer_after_id = self.root.after(100, self.update_timer)
            return

        elapsed = time.time() - self.start_time
        if self.time_var:
            self.time_var.set(self.format_time(elapsed))

        if hasattr(self, "progress_canvas"):
            self.progress_canvas.itemconfig("time_text", text=self.format_time(elapsed))

        if self.progress_var:
            estimated_seconds = max(1.0, self.estimated_duration * 60.0)
            progress = min(100.0, (elapsed / estimated_seconds) * 100.0)
            self.progress_var.set(progress)

            if hasattr(self, "progress_canvas") and hasattr(self, "progress_rect"):
                width = self.progress_canvas.winfo_width()
                fill_width = (width * progress) / 100.0
                canvas_height = self.progress_canvas.winfo_height()
                self.progress_canvas.coords(
                    self.progress_rect, 0, 0, fill_width, canvas_height
                )
                if hasattr(self, "progress_border"):
                    self.progress_canvas.coords(
                        self.progress_border, fill_width, 0, fill_width, canvas_height
                    )

        if int(elapsed) % 5 == 0:
            self.save_current_state()

        self.timer_after_id = self.root.after(100, self.update_timer)

    def save_current_state(self):
        state = load_state()
        elapsed = time.time() - self.start_time
        state.setdefault("active_tasks", {})
        state.setdefault("completed_tasks", [])
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
        self.timer_started = True
        self.start_time = time.time() - self.elapsed_seconds
        play_spotify()
        self.mode = "corner"
        self.save_current_state()

        old_root = self.root
        if self.timer_after_id and old_root:
            try:
                old_root.after_cancel(self.timer_after_id)
            except Exception:
                pass
        if self.ensure_after_id and old_root:
            try:
                old_root.after_cancel(self.ensure_after_id)
            except Exception:
                pass
        self.timer_after_id = None
        self.ensure_after_id = None

        self.root = tk.Tk()
        if old_root:
            old_root.destroy()
        self.build_corner()
        self.update_timer()
        self.ensure_after_id = self.root.after(100, self.ensure_on_top)

    def on_done(self):
        self.completed = True
        self.running = False

        elapsed = time.time() - self.start_time
        elapsed_minutes = elapsed / 60.0

        try:
            todoist_key = os.getenv("TODOIST_KEY")
            if todoist_key:
                TodoistAPI(todoist_key).complete_task(self.task_id)
        except Exception as e:
            print(f"Could not complete task in Todoist: {e}", file=sys.stderr)

        record_task_completion(
            task_id=self.task_id,
            task_name=self.task_name,
            estimated_minutes=int(self.estimated_duration),
            actual_minutes=elapsed_minutes,
            completed=True,
        )

        state = load_state()
        state.setdefault("active_tasks", {})
        state.setdefault("completed_tasks", [])
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

        Path(self.output_file).write_text(
            json.dumps(
                {"task_id": self.task_id, "elapsed_seconds": elapsed, "completed": True}
            )
        )
        if self.root:
            self.root.destroy()

    def on_cancel(self):
        self.running = False
        elapsed = time.time() - self.start_time
        elapsed_minutes = elapsed / 60.0

        record_task_completion(
            task_id=self.task_id,
            task_name=self.task_name,
            estimated_minutes=int(self.estimated_duration),
            actual_minutes=elapsed_minutes,
            completed=False,
        )

        state = load_state()
        state.setdefault("active_tasks", {})
        if self.task_id in state["active_tasks"]:
            del state["active_tasks"][self.task_id]
        save_state(state)

        Path(self.output_file).write_text(
            json.dumps(
                {
                    "task_id": self.task_id,
                    "elapsed_seconds": elapsed,
                    "completed": False,
                }
            )
        )
        if self.root:
            self.root.destroy()

    def on_minimize(self):
        self.mode = "corner"
        self.rebuild_window()

    def start_drag(self, event):
        self.dragging = True
        self.drag_x = event.x
        self.drag_y = event.y

    def do_drag(self, event):
        if not self.dragging or not self.root:
            return
        x = self.root.winfo_x() + event.x - self.drag_x
        y = self.root.winfo_y() + event.y - self.drag_y
        self.root.geometry(f"+{x}+{y}")

    def stop_drag(self, _event):
        self.dragging = False
        if self.mode != "corner" or not self.root:
            return
        state = load_state()
        state.setdefault("corner_position", {})
        state["corner_position"][self.task_id] = {
            "x": self.root.winfo_x(),
            "y": self.root.winfo_y(),
        }
        save_state(state)

    def ensure_on_top(self):
        if self.root and self.mode == "corner":
            self.root.lift()
            self.root.attributes("-topmost", True)
            self.ensure_after_id = self.root.after(100, self.ensure_on_top)

    def build_full_screen(self):
        assert self.root
        self.root.overrideredirect(True)

        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.root.geometry(f"{sw}x{sh}+0+0")
        self.root.configure(bg="#1a1a1a")
        self.root.attributes("-topmost", True)
        self.root.lift()

        content = tk.Frame(self.root, bg="#1a1a1a")
        content.place(relx=0.5, rely=0.5, anchor="center")

        tk.Label(
            content,
            text=self.task_name,
            font=get_system_font(self.root, 48, "bold"),
            fg="white",
            bg="#1a1a1a",
            wraplength=sw - 100,
        ).pack(pady=(0, 20))

        if not self.timer_started:
            create_styled_button(
                content,
                text="START TASK",
                command=self.on_start,
                bg_color="#00aa00",
                fg_color="white",
                font=get_system_font(self.root, 36, "bold"),
                padx=60,
                pady=20,
            ).pack(pady=(0, 15))

            snooze_text = (
                f"WAIT 5 MIN ({self.snooze_count}/1 used)"
                if self.snooze_count > 0
                else "WAIT 5 MIN"
            )
            snooze_color = "#ff8800" if self.snooze_count > 0 else "#ffaa00"
            create_styled_button(
                content,
                text=snooze_text,
                command=self.on_snooze,
                bg_color=snooze_color,
                fg_color="white",
                font=get_system_font(self.root, 24, "bold"),
                padx=40,
                pady=15,
            ).pack(pady=(0, 15))

            tk.Label(
                content,
                text=f"Estimated: {int(self.estimated_duration)} minutes",
                font=get_system_font(self.root, 18),
                fg="#888888",
                bg="#1a1a1a",
            ).pack()

            create_styled_button(
                content,
                text="CANCEL",
                command=self.on_cancel,
                bg_color="#666666",
                fg_color="white",
                font=get_system_font(self.root, 18),
                padx=30,
                pady=10,
            ).pack(pady=(30, 0))
        else:
            self.time_var = tk.StringVar(value=self.format_time(self.elapsed_seconds))
            tk.Label(
                content,
                textvariable=self.time_var,
                font=("Helvetica", 72, "bold"),
                fg="#00ff00",
                bg="#1a1a1a",
            ).pack(pady=(0, 30))

            progress_frame = tk.Frame(content, bg="#1a1a1a")
            progress_frame.pack(fill=tk.X, pady=(0, 30), padx=100)

            self.progress_var = tk.DoubleVar(value=0)
            from tkinter import ttk

            ttk.Progressbar(
                progress_frame,
                variable=self.progress_var,
                maximum=100,
                length=600,
                mode="determinate",
            ).pack()

            tk.Label(
                progress_frame,
                text=f"Goal: {int(self.estimated_duration)} minutes",
                font=get_system_font(self.root, 14),
                fg="#888888",
                bg="#1a1a1a",
            ).pack(pady=(5, 0))

            btn_frame2 = tk.Frame(content, bg="#1a1a1a")
            btn_frame2.pack()

            create_styled_button(
                btn_frame2,
                text="CONTINUE (Corner Mode)",
                command=self.on_minimize,
                bg_color="#0066cc",
                fg_color="white",
                font=get_system_font(self.root, 24, "bold"),
                padx=40,
                pady=15,
            ).pack(pady=(0, 15))

            create_styled_button(
                btn_frame2,
                text="DONE",
                command=self.on_done,
                bg_color="#00aa00",
                fg_color="white",
                font=get_system_font(self.root, 24, "bold"),
                padx=60,
                pady=15,
            ).pack(pady=(0, 15))

            create_styled_button(
                btn_frame2,
                text="CANCEL",
                command=self.on_cancel,
                bg_color="#cc0000",
                fg_color="white",
                font=get_system_font(self.root, 18),
                padx=40,
                pady=10,
            ).pack()

        self.root.grab_set()
        self.root.bind("<Escape>", lambda _e: None)
        self.root.bind("<Command-w>", lambda _e: "break")
        self.root.bind("<Command-q>", lambda _e: "break")

    def build_corner(self):
        assert self.root
        width, height = 300, 50
        self.root.overrideredirect(True)

        try:
            self.root.tk.call("tk", "scaling", 1.0)
        except Exception:
            pass

        self.root.geometry(f"{width}x{height}")
        self.root.update_idletasks()

        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - width) // 2
        y = sh - height - 40
        self.root.geometry(f"{width}x{height}+{x}+{y}")
        self.root.attributes("-topmost", True)

        self.root.bind("<Button-1>", self.start_drag)
        self.root.bind("<B1-Motion>", self.do_drag)
        self.root.bind("<ButtonRelease-1>", self.stop_drag)

        self.progress_canvas = tk.Canvas(
            self.root, width=width, height=height, bg="#333333", highlightthickness=0
        )
        self.progress_canvas.pack(fill=tk.BOTH, expand=True)

        self.progress_rect = self.progress_canvas.create_rectangle(
            0, 0, 0, height, fill="#287a3e", outline="", stipple="gray25"
        )
        self.progress_border = self.progress_canvas.create_line(
            0, 0, 0, height, fill="#3d9c5a", width=1
        )

        self.time_var = tk.StringVar(
            master=self.root, value=self.format_time(self.elapsed_seconds)
        )
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

        dot_color = "#666666"
        dot_r = 1.5
        dot_gap = 5
        dot_start_x = width - 16
        dot_start_y = (height // 2) - 6
        for row in range(3):
            for col in range(2):
                dx = dot_start_x + (col * dot_gap)
                dy = dot_start_y + (row * dot_gap)
                self.progress_canvas.create_oval(
                    dx - dot_r,
                    dy - dot_r,
                    dx + dot_r,
                    dy + dot_r,
                    fill=dot_color,
                    outline=dot_color,
                )

        display_name = (
            self.task_name[:22] + "..." if len(self.task_name) > 22 else self.task_name
        )
        self.progress_canvas.create_text(
            92,
            height // 2,
            text=display_name,
            font=get_system_font(self.root, 11),
            fill="#ffffff",
            tags="task_text",
            anchor="w",
        )

        system_font = get_system_font(self.root, 10)
        btn_pad_x = 6
        btn_pad_y = 5
        complete_text = "Complete"
        cancel_text = "Cancel"

        # Avoid creating tkinter.font.Font objects (can crash on shutdown
        # under some Tcl/Tk builds). Measure via canvas bbox instead.
        tmp1 = self.progress_canvas.create_text(
            0, 0, text=complete_text, font=system_font, anchor="nw"
        )
        tmp2 = self.progress_canvas.create_text(
            0, 0, text=cancel_text, font=system_font, anchor="nw"
        )
        bbox1 = self.progress_canvas.bbox(tmp1) or (0, 0, 0, 0)
        bbox2 = self.progress_canvas.bbox(tmp2) or (0, 0, 0, 0)
        self.progress_canvas.delete(tmp1)
        self.progress_canvas.delete(tmp2)
        btn_w = max(bbox1[2] - bbox1[0], bbox2[2] - bbox2[0])
        btn_height = max(bbox1[3] - bbox1[1], bbox2[3] - bbox2[1])

        complete_x = 15
        complete_y = height // 2
        cancel_x = complete_x + btn_w + (btn_pad_x * 2) + 10
        cancel_y = height // 2

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

        self.progress_canvas.tag_bind(
            "btn_complete", "<Button-1>", lambda _e: self.on_done()
        )
        self.progress_canvas.tag_bind(
            "btn_complete_box", "<Button-1>", lambda _e: self.on_done()
        )
        self.progress_canvas.tag_bind(
            "btn_cancel", "<Button-1>", lambda _e: self.on_cancel()
        )
        self.progress_canvas.tag_bind(
            "btn_cancel_box", "<Button-1>", lambda _e: self.on_cancel()
        )
        self.progress_canvas.tag_bind(
            "btn_complete",
            "<Enter>",
            lambda _e: self.progress_canvas.itemconfig("btn_complete", fill="#cccccc"),
        )
        self.progress_canvas.tag_bind(
            "btn_complete",
            "<Leave>",
            lambda _e: self.progress_canvas.itemconfig("btn_complete", fill="#ffffff"),
        )
        self.progress_canvas.tag_bind(
            "btn_cancel",
            "<Enter>",
            lambda _e: self.progress_canvas.itemconfig("btn_cancel", fill="#cccccc"),
        )
        self.progress_canvas.tag_bind(
            "btn_cancel",
            "<Leave>",
            lambda _e: self.progress_canvas.itemconfig("btn_cancel", fill="#ffffff"),
        )

        self.is_hovering = False
        self.hover_hide_after_id = None

        def do_hide():
            if not self.is_hovering and self.root:
                self.progress_canvas.itemconfig("btn_complete", state="hidden")
                self.progress_canvas.itemconfig("btn_cancel", state="hidden")
                self.progress_canvas.itemconfig("btn_complete_box", state="hidden")
                self.progress_canvas.itemconfig("btn_cancel_box", state="hidden")
                self.progress_canvas.itemconfig("time_text", state="normal")
                self.progress_canvas.itemconfig("task_text", state="normal")
            self.hover_hide_after_id = None

        def check_mouse_hover():
            if not self.root:
                return
            mouse_x = self.root.winfo_pointerx()
            mouse_y = self.root.winfo_pointery()
            win_x = self.root.winfo_x()
            win_y = self.root.winfo_y()
            win_w = self.root.winfo_width()
            win_h = self.root.winfo_height()

            is_over = (
                win_x <= mouse_x <= win_x + win_w and win_y <= mouse_y <= win_y + win_h
            )
            if is_over and not self.is_hovering:
                self.is_hovering = True
                if self.hover_hide_after_id:
                    try:
                        self.root.after_cancel(self.hover_hide_after_id)
                    except Exception:
                        pass
                    self.hover_hide_after_id = None
                self.progress_canvas.itemconfig("time_text", state="hidden")
                self.progress_canvas.itemconfig("task_text", state="hidden")
                self.progress_canvas.itemconfig("btn_complete", state="normal")
                self.progress_canvas.itemconfig("btn_cancel", state="normal")
                self.progress_canvas.itemconfig("btn_complete_box", state="normal")
                self.progress_canvas.itemconfig("btn_cancel_box", state="normal")
            elif not is_over and self.is_hovering:
                self.is_hovering = False
                if self.hover_hide_after_id:
                    try:
                        self.root.after_cancel(self.hover_hide_after_id)
                    except Exception:
                        pass
                self.hover_hide_after_id = self.root.after(150, do_hide)

            self.root.after(50, check_mouse_hover)

        self.root.after(50, check_mouse_hover)
        self.progress_var = tk.DoubleVar(master=self.root, value=0)

    def rebuild_window(self):
        if self.mode == "corner":
            old_root = self.root
            self.root = tk.Tk()
            if old_root:
                old_root.destroy()
            self.build_corner()
            self.update_timer()
            self.ensure_after_id = self.root.after(100, self.ensure_on_top)
            return

        if self.root:
            for widget in self.root.winfo_children():
                widget.destroy()
        self.build_full_screen()
        self.update_timer()

    def run(self) -> bool:
        self.root = tk.Tk()
        if self.mode == "full":
            self.build_full_screen()
        else:
            self.build_corner()
            self.ensure_after_id = self.root.after(100, self.ensure_on_top)
        self.update_timer()
        self.root.mainloop()
        return self.completed


def create_overlay(
    task_name: str,
    task_id: str,
    description: str = "",
    mode: str = "full",
    elapsed_seconds: float = 0,
    output_file: str | None = None,
    estimated_duration: float = 30,
):
    return TaskOverlayWindow(
        task_name=task_name,
        task_id=task_id,
        description=description,
        mode=mode,
        elapsed_seconds=elapsed_seconds,
        output_file=output_file,
        estimated_duration=estimated_duration,
    ).run()


def show_task_overlay(
    task_name: str,
    task_id: str,
    description: str = "",
    mode: str = "full",
    elapsed_seconds: float = 0,
    estimated_duration: float = 30,
) -> dict:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        result_file = f.name
    cmd = [
        sys.executable,
        "-m",
        "src.ui.overlay",
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

    proc = subprocess.Popen(cmd)
    proc.wait()

    try:
        result = json.loads(Path(result_file).read_text())
        Path(result_file).unlink(missing_ok=True)
        return result
    except Exception:
        return {"completed": False, "elapsed_seconds": 0}


def list_active_tasks() -> Dict[str, Any]:
    state = load_state()
    return state.get("active_tasks", {})


def resume_task_overlay(task_id: str) -> Optional[dict]:
    state = load_state()
    if task_id not in state.get("active_tasks", {}):
        return None
    task_data = state["active_tasks"][task_id]
    return show_task_overlay(
        task_name=task_data["task_name"],
        task_id=task_id,
        description=task_data.get("description", ""),
        mode=task_data.get("mode", "corner"),
        elapsed_seconds=task_data.get("elapsed_seconds", 0),
        estimated_duration=task_data.get("estimated_duration", 30),
    )


def _parse_args(argv: list[str]):
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--task-name", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--description", default="")
    parser.add_argument("--mode", default="full")
    parser.add_argument("--elapsed", type=float, default=0)
    parser.add_argument("--output", required=True)
    parser.add_argument("--estimated-duration", type=float, default=30)
    return parser.parse_args(argv)


def _main(argv: Optional[list[str]] = None) -> None:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    result = create_overlay(
        task_name=args.task_name,
        task_id=args.task_id,
        description=args.description,
        mode=args.mode,
        elapsed_seconds=args.elapsed,
        output_file=args.output,
        estimated_duration=args.estimated_duration,
    )
    # Best-effort: if the overlay exits without writing the result file,
    # write a default so the parent process can continue.
    try:
        out_path = Path(args.output)
        if not out_path.exists():
            out_path.write_text(
                json.dumps(
                    {
                        "task_id": args.task_id,
                        "elapsed_seconds": float(args.elapsed),
                        "completed": bool(result),
                    }
                )
            )
    except Exception:
        pass

    print(json.dumps({"completed": result}))
    sys.stdout.flush()

    # Work around occasional Tk/Tcl shutdown malloc crashes by skipping
    # interpreter cleanup.
    os._exit(0)


if __name__ == "__main__":
    _main()
