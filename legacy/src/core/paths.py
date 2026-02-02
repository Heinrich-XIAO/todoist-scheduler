from __future__ import annotations

import shutil
from pathlib import Path
from typing import Iterable


def project_root() -> Path:
    # .../src/core/paths.py -> .../
    return Path(__file__).resolve().parents[2]


def data_dir() -> Path:
    return project_root() / "data"


def ensure_data_layout() -> None:
    data_dir().mkdir(parents=True, exist_ok=True)


def migrate_legacy_files(legacy_names: Iterable[str]) -> None:
    """Migrate legacy root runtime files into data/ (best-effort).

    This preserves backwards compatibility for users upgrading from the
    pre-src layout.
    """

    ensure_data_layout()
    root = project_root()

    for name in legacy_names:
        src = root / name
        dst = data_dir() / name
        if not src.exists():
            continue
        if dst.exists():
            # Keep the newer location; don't overwrite.
            continue
        try:
            shutil.move(str(src), str(dst))
        except Exception:
            # Best-effort; if move fails (permissions/locked), leave as-is.
            pass


def legacy_or_data_path(name: str) -> Path:
    """Return data/<name> if exists, else legacy root <name>."""

    root = project_root()
    data = data_dir() / name
    legacy = root / name
    if data.exists():
        return data
    return legacy
