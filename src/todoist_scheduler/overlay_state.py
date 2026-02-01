from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from todoist_scheduler.core.paths import (
    data_dir,
    ensure_data_layout,
    legacy_or_data_path,
    migrate_legacy_files,
)


def state_file() -> Path:
    ensure_data_layout()
    migrate_legacy_files(["overlay_state.json"])
    p = data_dir() / "overlay_state.json"
    if p.exists():
        return p
    return legacy_or_data_path("overlay_state.json")


def load_state() -> Dict[str, Any]:
    p = state_file()
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            pass
    return {"active_tasks": {}, "completed_tasks": []}


def save_state(state: Dict[str, Any]) -> None:
    p = state_file()
    p.write_text(json.dumps(state, indent=2))
