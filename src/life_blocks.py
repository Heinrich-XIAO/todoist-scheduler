from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from src.core.paths import (
    data_dir,
    ensure_data_layout,
    legacy_or_data_path,
    migrate_legacy_files,
)


def blocks_file() -> Path:
    ensure_data_layout()
    migrate_legacy_files(["life_blocks.json"])
    p = data_dir() / "life_blocks.json"
    if p.exists():
        return p
    return legacy_or_data_path("life_blocks.json")


def _default_state() -> Dict[str, List[Dict[str, Any]]]:
    return {"one_off": [], "weekly": []}


def load_blocks() -> Dict[str, List[Dict[str, Any]]]:
    p = blocks_file()
    if p.exists():
        try:
            data = json.loads(p.read_text())
            if not isinstance(data, dict):
                return _default_state()
            return {
                "one_off": list(data.get("one_off", []) or []),
                "weekly": list(data.get("weekly", []) or []),
            }
        except Exception:
            return _default_state()
    return _default_state()


def save_blocks(state: Dict[str, List[Dict[str, Any]]]) -> None:
    p = blocks_file()
    p.write_text(json.dumps(state, indent=2))


def _parse_time(value: str) -> Optional[dt.time]:
    try:
        return dt.datetime.strptime(value.strip(), "%H:%M").time()
    except Exception:
        return None


def _parse_date(value: str) -> Optional[dt.date]:
    try:
        return dt.date.fromisoformat(value.strip())
    except Exception:
        return None


def _normalize_days(days: Iterable[str]) -> List[str]:
    cleaned = []
    for day in days:
        if not day:
            continue
        cleaned.append(day.strip().lower()[:3])
    return cleaned


def _weekday_slug(d: dt.date) -> str:
    return d.strftime("%a").lower()[:3]


def _expand_block(
    date: dt.date, start: dt.time, end: dt.time, interval_minutes: int
) -> set[dt.datetime]:
    if end <= start:
        return set()
    slots: set[dt.datetime] = set()
    start_dt = dt.datetime.combine(date, start)
    end_dt = dt.datetime.combine(date, end)
    current = start_dt
    while current < end_dt:
        slots.add(current)
        current += dt.timedelta(minutes=interval_minutes)
    return slots


def blocked_slots_for_date(date: dt.date, interval_minutes: int) -> set[dt.datetime]:
    state = load_blocks()
    slots: set[dt.datetime] = set()

    for block in state.get("one_off", []):
        block_date = _parse_date(str(block.get("date", "")))
        if block_date != date:
            continue
        start = _parse_time(str(block.get("start", "")))
        end = _parse_time(str(block.get("end", "")))
        if not start or not end:
            continue
        slots |= _expand_block(date, start, end, interval_minutes)

    today_slug = _weekday_slug(date)
    for block in state.get("weekly", []):
        days = _normalize_days(block.get("days", []) or [])
        if today_slug not in days:
            continue
        start = _parse_time(str(block.get("start", "")))
        end = _parse_time(str(block.get("end", "")))
        if not start or not end:
            continue
        slots |= _expand_block(date, start, end, interval_minutes)

    return slots
