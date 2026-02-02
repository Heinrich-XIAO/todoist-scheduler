from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


def load_local_env(project_root: Path) -> None:
    """Load .env.local if present.

    This keeps existing local dev behavior without requiring a config file.
    """

    env_path = project_root / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)


def get_env_var(name: str, required: bool = True) -> Optional[str]:
    value = os.getenv(name)
    if required and not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value
