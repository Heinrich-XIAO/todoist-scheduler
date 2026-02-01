"""
Task Analytics - Track and analyze task completion times.

Stores:
- Estimated duration vs actual time spent
- Task completion patterns
- Most/least accurate estimations
"""

import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from collections import defaultdict

# Analytics file
ANALYTICS_FILE = Path(__file__).parent / "task_analytics.json"


def load_analytics() -> Dict[str, Any]:
    """Load analytics data from file."""
    if ANALYTICS_FILE.exists():
        try:
            return json.loads(ANALYTICS_FILE.read_text())
        except:
            pass
    return {
        "tasks": {},  # task_id -> list of completion records
        "estimates": {},  # task_name -> {estimated: [], actual: []}
        "daily_stats": {},  # date -> {tasks_completed, total_time, accuracy}
    }


def save_analytics(data: Dict[str, Any]) -> None:
    """Save analytics data to file."""
    ANALYTICS_FILE.write_text(json.dumps(data, indent=2))


def record_task_completion(
    task_id: str,
    task_name: str,
    estimated_minutes: int,
    actual_minutes: float,
    completed: bool = True,
) -> None:
    """Record a task completion for analytics."""
    data = load_analytics()

    today = datetime.now().strftime("%Y-%m-%d")

    # Record completion
    record = {
        "timestamp": datetime.now().isoformat(),
        "task_name": task_name,
        "estimated_minutes": estimated_minutes,
        "actual_minutes": round(actual_minutes, 1),
        "completed": completed,
    }

    # Add to task history
    if task_id not in data["tasks"]:
        data["tasks"][task_id] = []
    data["tasks"][task_id].append(record)

    # Track estimates by task name
    if task_name not in data["estimates"]:
        data["estimates"][task_name] = {"estimated": [], "actual": []}
    data["estimates"][task_name]["estimated"].append(estimated_minutes)
    data["estimates"][task_name]["actual"].append(round(actual_minutes, 1))

    # Daily stats
    if today not in data["daily_stats"]:
        data["daily_stats"][today] = {
            "tasks_completed": 0,
            "tasks_partial": 0,
            "total_time_minutes": 0,
            "accuracy_sum": 0,
            "accuracy_count": 0,
        }

    if completed:
        data["daily_stats"][today]["tasks_completed"] += 1
    else:
        data["daily_stats"][today]["tasks_partial"] += 1

    data["daily_stats"][today]["total_time_minutes"] += round(actual_minutes, 1)

    # Calculate accuracy (how close estimate was to actual)
    if estimated_minutes > 0:
        accuracy = min(estimated_minutes, actual_minutes) / max(
            estimated_minutes, actual_minutes
        )
        data["daily_stats"][today]["accuracy_sum"] += accuracy
        data["daily_stats"][today]["accuracy_count"] += 1

    save_analytics(data)


def get_task_accuracy(task_name: str) -> Optional[Dict[str, Any]]:
    """Get accuracy statistics for a specific task name."""
    data = load_analytics()

    if task_name not in data["estimates"]:
        return None

    estimates = data["estimates"][task_name]
    if not estimates["estimated"]:
        return None

    avg_estimated = sum(estimates["estimated"]) / len(estimates["estimated"])
    avg_actual = sum(estimates["actual"]) / len(estimates["actual"])

    # Calculate average accuracy
    accuracies = []
    for est, act in zip(estimates["estimated"], estimates["actual"]):
        if est > 0:
            acc = min(est, act) / max(est, act)
            accuracies.append(acc)

    avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0

    return {
        "task_name": task_name,
        "times_completed": len(estimates["estimated"]),
        "avg_estimated_minutes": round(avg_estimated, 1),
        "avg_actual_minutes": round(avg_actual, 1),
        "avg_accuracy": round(avg_accuracy * 100, 1),  # as percentage
        "underestimated": avg_actual > avg_estimated,
        "difference_minutes": round(abs(avg_actual - avg_estimated), 1),
    }


def get_most_inaccurate_tasks(limit: int = 5) -> List[Dict[str, Any]]:
    """Get tasks that are most often underestimated or overestimated."""
    data = load_analytics()

    task_accuracies = []
    for task_name in data["estimates"]:
        stats = get_task_accuracy(task_name)
        if stats and stats["times_completed"] >= 2:  # Only tasks done at least twice
            task_accuracies.append(stats)

    # Sort by accuracy (lowest first = most inaccurate)
    task_accuracies.sort(key=lambda x: x["avg_accuracy"])

    return task_accuracies[:limit]


def get_daily_report(date: Optional[str] = None) -> Dict[str, Any]:
    """Get report for a specific date (default: today)."""
    data = load_analytics()

    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")

    if date not in data["daily_stats"]:
        return {
            "date": date,
            "tasks_completed": 0,
            "tasks_partial": 0,
            "total_time_hours": 0,
            "avg_accuracy": 0,
        }

    stats = data["daily_stats"][date]
    avg_accuracy = 0
    if stats["accuracy_count"] > 0:
        avg_accuracy = stats["accuracy_sum"] / stats["accuracy_count"]

    return {
        "date": date,
        "tasks_completed": stats["tasks_completed"],
        "tasks_partial": stats["tasks_partial"],
        "total_time_hours": round(stats["total_time_minutes"] / 60, 1),
        "avg_accuracy": round(avg_accuracy * 100, 1),
    }


def get_weekly_summary() -> Dict[str, Any]:
    """Get summary for the last 7 days."""
    data = load_analytics()

    today = datetime.now()
    total_tasks = 0
    total_time = 0
    daily_accuracies = []

    for i in range(7):
        date = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        if date in data["daily_stats"]:
            stats = data["daily_stats"][date]
            total_tasks += stats["tasks_completed"] + stats["tasks_partial"]
            total_time += stats["total_time_minutes"]
            if stats["accuracy_count"] > 0:
                daily_accuracies.append(stats["accuracy_sum"] / stats["accuracy_count"])

    return {
        "days_tracked": len(
            [
                d
                for d in data["daily_stats"]
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


def print_analytics_report():
    """Print a nice analytics report to console."""
    print("\n" + "=" * 60)
    print("📊 TASK ANALYTICS REPORT")
    print("=" * 60)

    # Daily report
    daily = get_daily_report()
    print(f"\n📅 Today ({daily['date']}):")
    print(f"   Tasks completed: {daily['tasks_completed']}")
    print(f"   Tasks in progress: {daily['tasks_partial']}")
    print(f"   Total time: {daily['total_time_hours']} hours")
    print(f"   Estimation accuracy: {daily['avg_accuracy']}%")

    # Weekly summary
    weekly = get_weekly_summary()
    print(f"\n📈 Last 7 Days:")
    print(f"   Total tasks: {weekly['total_tasks']}")
    print(f"   Total time: {weekly['total_time_hours']} hours")
    print(f"   Average accuracy: {weekly['avg_daily_accuracy']}%")

    # Most inaccurate tasks
    inaccurate = get_most_inaccurate_tasks(3)
    if inaccurate:
        print(f"\n⚠️  Tasks Needing Better Estimates:")
        for task in inaccurate:
            direction = "underestimated" if task["underestimated"] else "overestimated"
            print(f"   • {task['task_name'][:40]}")
            print(
                f"     Est: {task['avg_estimated_minutes']}m | Actual: {task['avg_actual_minutes']}m"
            )
            print(
                f"     Accuracy: {task['avg_accuracy']}% ({direction} by {task['difference_minutes']}m)"
            )

    print("\n" + "=" * 60 + "\n")


if __name__ == "__main__":
    print_analytics_report()
