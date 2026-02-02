from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict

from src.core.paths import (
    data_dir,
    ensure_data_layout,
    legacy_or_data_path,
    migrate_legacy_files,
)


def computer_task_cache_file() -> Path:
    ensure_data_layout()
    migrate_legacy_files(["computer_task_cache.json"])
    p = data_dir() / "computer_task_cache.json"
    if p.exists():
        return p
    return legacy_or_data_path("computer_task_cache.json")


def load_cache() -> Dict[str, bool]:
    p = computer_task_cache_file()
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            return {}
    return {}


def save_cache(cache: Dict[str, bool]) -> None:
    p = computer_task_cache_file()
    p.write_text(json.dumps(cache, indent=2))


def task_hash(text: str) -> str:
    return hashlib.md5(text.lower().strip().encode()).hexdigest()[:16]
