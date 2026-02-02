from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.core.paths import (
    data_dir,
    ensure_data_layout,
    legacy_or_data_path,
    migrate_legacy_files,
)


def analytics_file() -> Path:
    # Backwards compatible: prefer data/task_analytics.json, else legacy root.
    ensure_data_layout()
    migrate_legacy_files(["task_analytics.json"])
    p = data_dir() / "task_analytics.json"
    if p.exists():
        return p
    return legacy_or_data_path("task_analytics.json")


def load_analytics() -> Dict[str, Any]:
    p = analytics_file()
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            pass
    return {
        "tasks": {},
        "estimates": {},
        "daily_stats": {},
    }


def save_analytics(data: Dict[str, Any]) -> None:
    p = analytics_file()
    p.write_text(json.dumps(data, indent=2))


def record_task_completion(
    task_id: str,
    task_name: str,
    estimated_minutes: int,
    actual_minutes: float,
    completed: bool = True,
) -> None:
    data = load_analytics()
    today = datetime.now().strftime("%Y-%m-%d")

    record = {
        "timestamp": datetime.now().isoformat(),
        "task_name": task_name,
        "estimated_minutes": estimated_minutes,
        "actual_minutes": round(actual_minutes, 1),
        "completed": completed,
    }

    data.setdefault("tasks", {})
    data.setdefault("estimates", {})
    data.setdefault("daily_stats", {})

    data["tasks"].setdefault(task_id, []).append(record)
    data["estimates"].setdefault(task_name, {"estimated": [], "actual": []})
    data["estimates"][task_name]["estimated"].append(estimated_minutes)
    data["estimates"][task_name]["actual"].append(round(actual_minutes, 1))

    daily = data["daily_stats"].setdefault(
        today,
        {
            "tasks_completed": 0,
            "tasks_partial": 0,
            "total_time_minutes": 0,
            "accuracy_sum": 0,
            "accuracy_count": 0,
        },
    )

    if completed:
        daily["tasks_completed"] += 1
    else:
        daily["tasks_partial"] += 1

    daily["total_time_minutes"] += round(actual_minutes, 1)

    if estimated_minutes > 0:
        accuracy = min(estimated_minutes, actual_minutes) / max(
            estimated_minutes, actual_minutes
        )
        daily["accuracy_sum"] += accuracy
        daily["accuracy_count"] += 1

    save_analytics(data)


def get_task_accuracy(task_name: str) -> Optional[Dict[str, Any]]:
    data = load_analytics()
    estimates = data.get("estimates", {}).get(task_name)
    if not estimates:
        return None

    if not estimates.get("estimated"):
        return None

    avg_estimated = sum(estimates["estimated"]) / len(estimates["estimated"])
    avg_actual = sum(estimates["actual"]) / len(estimates["actual"])

    accuracies = []
    for est, act in zip(estimates["estimated"], estimates["actual"]):
        if est > 0:
            accuracies.append(min(est, act) / max(est, act))

    avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0

    return {
        "task_name": task_name,
        "times_completed": len(estimates["estimated"]),
        "avg_estimated_minutes": round(avg_estimated, 1),
        "avg_actual_minutes": round(avg_actual, 1),
        "avg_accuracy": round(avg_accuracy * 100, 1),
        "underestimated": avg_actual > avg_estimated,
        "difference_minutes": round(abs(avg_actual - avg_estimated), 1),
    }


def get_most_inaccurate_tasks(limit: int = 5) -> List[Dict[str, Any]]:
    data = load_analytics()
    task_accuracies: List[Dict[str, Any]] = []
    for task_name in data.get("estimates", {}):
        stats = get_task_accuracy(task_name)
        if stats and stats["times_completed"] >= 2:
            task_accuracies.append(stats)
    task_accuracies.sort(key=lambda x: x["avg_accuracy"])
    return task_accuracies[:limit]


def get_daily_report(date: Optional[str] = None) -> Dict[str, Any]:
    data = load_analytics()
    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")

    stats = data.get("daily_stats", {}).get(date)
    if not stats:
        return {
            "date": date,
            "tasks_completed": 0,
            "tasks_partial": 0,
            "total_time_hours": 0,
            "avg_accuracy": 0,
        }

    avg_accuracy = 0
    if stats.get("accuracy_count", 0) > 0:
        avg_accuracy = stats["accuracy_sum"] / stats["accuracy_count"]

    return {
        "date": date,
        "tasks_completed": stats.get("tasks_completed", 0),
        "tasks_partial": stats.get("tasks_partial", 0),
        "total_time_hours": round(stats.get("total_time_minutes", 0) / 60, 1),
        "avg_accuracy": round(avg_accuracy * 100, 1),
    }


def get_weekly_summary() -> Dict[str, Any]:
    data = load_analytics()
    today = datetime.now()

    total_tasks = 0
    total_time = 0
    daily_accuracies = []

    for i in range(7):
        date = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        stats = data.get("daily_stats", {}).get(date)
        if not stats:
            continue
        total_tasks += stats.get("tasks_completed", 0) + stats.get("tasks_partial", 0)
        total_time += stats.get("total_time_minutes", 0)
        if stats.get("accuracy_count", 0) > 0:
            daily_accuracies.append(stats["accuracy_sum"] / stats["accuracy_count"])

    return {
        "days_tracked": len(
            [
                d
                for d in data.get("daily_stats", {})
                if d >= (today - timedelta(days=6)).strftime("%Y-%m-%d")
            ]
        ),
        "total_tasks": total_tasks,
        "total_time_hours": round(total_time / 60, 1),
        "avg_daily_accuracy": round(
            sum(daily_accuracies) / len(daily_accuracies) * 100, 1
        )
        if daily_accuracies
        else 0,
    }
