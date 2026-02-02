from __future__ import annotations

import os
import re
from typing import Optional

import requests


def estimate_minutes(
    task: str, description: str, interval_minutes: int, min_minutes: int
) -> Optional[int]:
    api_key = os.getenv("OPENROUTER_KEY")
    if not api_key:
        return None

    proxy_url = os.getenv("OPENROUTER_PROXY", "https://openrouter.ai/api/v1").rstrip(
        "/"
    )

    prompt = (
        f"Task: {task}\n"
        f"Description: {description}\n\n"
        "Estimate how many minutes this task will take. Reply with ONLY a number (in minutes).\n"
        "Give a LOW estimate - assume optimal conditions with no interruptions or complications.\n"
        "It's better to underestimate than overestimate.\n"
        f"Round to the nearest {interval_minutes} minutes. Minimum {min_minutes} minutes."
    )

    try:
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
                        "content": "You are a task duration estimator. Reply with only a number (minutes).",
                    },
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 50,
                "temperature": 0.3,
            },
            timeout=10,
        )
        response.raise_for_status()

        content_text = response.json()["choices"][0]["message"]["content"]
        numbers = re.findall(r"\d+", content_text)
        if not numbers:
            return None

        minutes = int(numbers[0])
        rounded = round(minutes / interval_minutes) * interval_minutes
        return max(min_minutes, rounded)
    except Exception:
        return None


def estimate_priority(task: str, description: str) -> Optional[int]:
    api_key = os.getenv("OPENROUTER_KEY")
    if not api_key:
        return None

    proxy_url = os.getenv("OPENROUTER_PROXY", "https://openrouter.ai/api/v1").rstrip(
        "/"
    )

    prompt = (
        f"Task: {task}\n"
        f"Description: {description}\n\n"
        "Decide if this task is urgent or time-sensitive.\n"
        "Reply with ONLY one number:\n"
        "- 4 for urgent (Todoist P1)\n"
        "- 2 for normal (Todoist P3)\n"
        "Never reply with 3."
    )

    try:
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
                        "content": "You assign Todoist priorities. Reply only with 4 or 2.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 10,
                "temperature": 0.2,
            },
            timeout=10,
        )
        response.raise_for_status()

        content_text = response.json()["choices"][0]["message"]["content"]
        numbers = re.findall(r"\d+", content_text)
        if not numbers:
            return None

        value = int(numbers[0])
        if value in (2, 4):
            return value
        return None
    except Exception:
        return None
