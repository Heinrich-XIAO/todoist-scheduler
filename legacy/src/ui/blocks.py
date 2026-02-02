from __future__ import annotations

import datetime as dt
import tkinter as tk
from typing import Dict, List, Tuple

from src.life_blocks import load_blocks, save_blocks
from src.scheduler.constants import INTERVAL_MINUTES


class LifeBlocksWindow:
    def __init__(self) -> None:
        self.state = load_blocks()
        self.root = tk.Tk()
        self.root.title("Life Blocks")
        self.root.geometry("640x520")
        self.root.configure(bg="#1b1b1b")

        self.entries: List[Tuple[str, int]] = []

        self.kind_var = tk.StringVar(value="one_off")
        self.date_var = tk.StringVar()
        self.start_var = tk.StringVar()
        self.end_var = tk.StringVar()
        self.label_var = tk.StringVar()
        self.status_var = tk.StringVar()

        self.day_vars: Dict[str, tk.BooleanVar] = {
            "mon": tk.BooleanVar(),
            "tue": tk.BooleanVar(),
            "wed": tk.BooleanVar(),
            "thu": tk.BooleanVar(),
            "fri": tk.BooleanVar(),
            "sat": tk.BooleanVar(),
            "sun": tk.BooleanVar(),
        }
        self.day_checkbuttons: List[tk.Checkbutton] = []

        self._build_ui()
        self._refresh_list()

    def _build_ui(self) -> None:
        header = tk.Label(
            self.root,
            text="Life Blocks",
            font=("Helvetica", 18, "bold"),
            fg="#ffffff",
            bg="#1b1b1b",
        )
        header.pack(pady=(16, 8))

        list_frame = tk.Frame(self.root, bg="#1b1b1b")
        list_frame.pack(fill="both", padx=16, pady=(0, 12), expand=True)

        self.listbox = tk.Listbox(
            list_frame,
            height=10,
            font=("Menlo", 11),
            bg="#101010",
            fg="#ffffff",
            selectbackground="#2b5dff",
            selectforeground="#ffffff",
        )
        self.listbox.pack(side="left", fill="both", expand=True)

        scrollbar = tk.Scrollbar(list_frame, orient="vertical")
        scrollbar.config(command=self.listbox.yview)
        scrollbar.pack(side="right", fill="y")
        self.listbox.config(yscrollcommand=scrollbar.set)

        form = tk.Frame(self.root, bg="#1b1b1b")
        form.pack(fill="x", padx=16)

        kind_frame = tk.Frame(form, bg="#1b1b1b")
        kind_frame.pack(fill="x", pady=(8, 0))
        tk.Label(
            kind_frame,
            text="Type",
            fg="#c9c9c9",
            bg="#1b1b1b",
            font=("Helvetica", 12),
        ).pack(side="left", padx=(0, 12))
        tk.Radiobutton(
            kind_frame,
            text="One-off",
            variable=self.kind_var,
            value="one_off",
            command=self._toggle_kind,
            fg="#ffffff",
            bg="#1b1b1b",
            selectcolor="#1b1b1b",
            activebackground="#1b1b1b",
        ).pack(side="left")
        tk.Radiobutton(
            kind_frame,
            text="Weekly",
            variable=self.kind_var,
            value="weekly",
            command=self._toggle_kind,
            fg="#ffffff",
            bg="#1b1b1b",
            selectcolor="#1b1b1b",
            activebackground="#1b1b1b",
        ).pack(side="left", padx=(16, 0))

        date_frame = tk.Frame(form, bg="#1b1b1b")
        date_frame.pack(fill="x", pady=(10, 0))
        tk.Label(
            date_frame,
            text="Date (YYYY-MM-DD)",
            fg="#c9c9c9",
            bg="#1b1b1b",
            font=("Helvetica", 12),
        ).pack(side="left", padx=(0, 12))
        self.date_entry = tk.Entry(date_frame, textvariable=self.date_var, width=16)
        self.date_entry.pack(side="left")

        days_frame = tk.Frame(form, bg="#1b1b1b")
        days_frame.pack(fill="x", pady=(10, 0))
        tk.Label(
            days_frame,
            text="Days",
            fg="#c9c9c9",
            bg="#1b1b1b",
            font=("Helvetica", 12),
        ).pack(side="left", padx=(0, 12))
        for slug, label in [
            ("mon", "Mon"),
            ("tue", "Tue"),
            ("wed", "Wed"),
            ("thu", "Thu"),
            ("fri", "Fri"),
            ("sat", "Sat"),
            ("sun", "Sun"),
        ]:
            cb = tk.Checkbutton(
                days_frame,
                text=label,
                variable=self.day_vars[slug],
                fg="#ffffff",
                bg="#1b1b1b",
                selectcolor="#1b1b1b",
                activebackground="#1b1b1b",
            )
            cb.pack(side="left")
            self.day_checkbuttons.append(cb)

        time_frame = tk.Frame(form, bg="#1b1b1b")
        time_frame.pack(fill="x", pady=(10, 0))
        tk.Label(
            time_frame,
            text="Start (HH:MM)",
            fg="#c9c9c9",
            bg="#1b1b1b",
            font=("Helvetica", 12),
        ).pack(side="left", padx=(0, 12))
        tk.Entry(time_frame, textvariable=self.start_var, width=10).pack(side="left")
        tk.Label(
            time_frame,
            text="End (HH:MM)",
            fg="#c9c9c9",
            bg="#1b1b1b",
            font=("Helvetica", 12),
        ).pack(side="left", padx=(16, 12))
        tk.Entry(time_frame, textvariable=self.end_var, width=10).pack(side="left")

        label_frame = tk.Frame(form, bg="#1b1b1b")
        label_frame.pack(fill="x", pady=(10, 0))
        tk.Label(
            label_frame,
            text="Label (optional)",
            fg="#c9c9c9",
            bg="#1b1b1b",
            font=("Helvetica", 12),
        ).pack(side="left", padx=(0, 12))
        tk.Entry(label_frame, textvariable=self.label_var, width=30).pack(side="left")

        btn_frame = tk.Frame(self.root, bg="#1b1b1b")
        btn_frame.pack(fill="x", padx=16, pady=(12, 4))
        tk.Button(
            btn_frame,
            text="Add Block",
            command=self._add_block,
            bg="#2b5dff",
            fg="#ffffff",
            activebackground="#2b5dff",
        ).pack(side="left")
        tk.Button(
            btn_frame,
            text="Delete Selected",
            command=self._delete_selected,
            bg="#444444",
            fg="#ffffff",
            activebackground="#444444",
        ).pack(side="left", padx=(10, 0))
        tk.Button(
            btn_frame,
            text="Close",
            command=self.root.destroy,
            bg="#2d2d2d",
            fg="#ffffff",
            activebackground="#2d2d2d",
        ).pack(side="right")

        status = tk.Label(
            self.root,
            textvariable=self.status_var,
            fg="#ffb74d",
            bg="#1b1b1b",
            font=("Helvetica", 11),
        )
        status.pack(pady=(4, 12))

        self._toggle_kind()

    def _toggle_kind(self) -> None:
        is_one_off = self.kind_var.get() == "one_off"
        self.date_entry.configure(state="normal" if is_one_off else "disabled")
        for var in self.day_vars.values():
            var.set(False if is_one_off else var.get())
        state = "disabled" if is_one_off else "normal"
        for cb in self.day_checkbuttons:
            cb.configure(state=state)

    def _refresh_list(self) -> None:
        self.entries = []
        self.listbox.delete(0, tk.END)
        for idx, block in enumerate(self.state.get("one_off", [])):
            label = block.get("label", "")
            text = f"One-off {block.get('date', '?')} {block.get('start', '?')}-{block.get('end', '?')}"
            if label:
                text += f" ({label})"
            self.entries.append(("one_off", idx))
            self.listbox.insert(tk.END, text)
        for idx, block in enumerate(self.state.get("weekly", [])):
            days = ",".join(block.get("days", []) or [])
            label = block.get("label", "")
            text = f"Weekly {days} {block.get('start', '?')}-{block.get('end', '?')}"
            if label:
                text += f" ({label})"
            self.entries.append(("weekly", idx))
            self.listbox.insert(tk.END, text)

    def _parse_time(self, value: str) -> dt.time | None:
        try:
            return dt.datetime.strptime(value.strip(), "%H:%M").time()
        except Exception:
            return None

    def _add_block(self) -> None:
        self.status_var.set("")
        start = self._parse_time(self.start_var.get())
        end = self._parse_time(self.end_var.get())
        if not start or not end:
            self.status_var.set("Use HH:MM time format.")
            return
        if end <= start:
            self.status_var.set("End time must be after start time.")
            return
        if start.minute % INTERVAL_MINUTES != 0 or end.minute % INTERVAL_MINUTES != 0:
            self.status_var.set(f"Minutes must be multiples of {INTERVAL_MINUTES}.")
            return

        label = self.label_var.get().strip()
        if self.kind_var.get() == "one_off":
            try:
                date = dt.date.fromisoformat(self.date_var.get().strip())
            except Exception:
                self.status_var.set("Use YYYY-MM-DD for the date.")
                return
            self.state["one_off"].append(
                {
                    "date": date.isoformat(),
                    "start": start.strftime("%H:%M"),
                    "end": end.strftime("%H:%M"),
                    "label": label,
                }
            )
        else:
            days = [slug for slug, var in self.day_vars.items() if var.get()]
            if not days:
                self.status_var.set("Pick at least one weekday.")
                return
            self.state["weekly"].append(
                {
                    "days": days,
                    "start": start.strftime("%H:%M"),
                    "end": end.strftime("%H:%M"),
                    "label": label,
                }
            )

        save_blocks(self.state)
        self.start_var.set("")
        self.end_var.set("")
        self.label_var.set("")
        self._refresh_list()

    def _delete_selected(self) -> None:
        selection = self.listbox.curselection()
        if not selection:
            self.status_var.set("Select a block to delete.")
            return
        kind, idx = self.entries[selection[0]]
        try:
            self.state[kind].pop(idx)
        except Exception:
            self.status_var.set("Could not delete selection.")
            return
        save_blocks(self.state)
        self._refresh_list()


def show_blocks_window() -> None:
    window = LifeBlocksWindow()
    window.root.mainloop()
