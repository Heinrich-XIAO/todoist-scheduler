from __future__ import annotations

import os
from typing import Dict

import requests

from src.notifier.cache import save_cache, task_hash


COMPUTER_KEYWORDS = [
    "email",
    "message",
    "slack",
    "discord",
    "code",
    "program",
    "develop",
    "write",
    "document",
    "spreadsheet",
    "excel",
    "word",
    "powerpoint",
    "research",
    "search",
    "browse",
    "website",
    "web",
    "online",
    "internet",
    "file",
    "folder",
    "organize",
    "backup",
    "sync",
    "update",
    "install",
    "configure",
    "setup",
    "settings",
    "account",
    "login",
    "password",
    "review",
    "edit",
    "create",
    "design",
    "figma",
    "render",
    "compile",
    "build",
    "deploy",
    "git",
    "github",
    "terminal",
    "command",
    "script",
    "database",
    "sql",
    "api",
    "zoom",
    "meeting",
    "call",
    "conference",
    "teams",
    "meet",
    "calendar",
    "schedule",
    "plan",
    "todoist",
    "notion",
    "obsidian",
    "read",
    "article",
    "pdf",
    "paper",
    "ebook",
    "watch",
    "video",
    "tutorial",
    "course",
    "learn",
    "study",
]


OFFLINE_KEYWORDS = [
    "grocery",
    "shopping",
    "store",
    "mall",
    "buy",
    "purchase",
    "clean",
    "wash",
    "laundry",
    "dishes",
    "vacuum",
    "sweep",
    "cook",
    "meal",
    "food",
    "kitchen",
    "recipe",
    "exercise",
    "gym",
    "workout",
    "run",
    "walk",
    "jog",
    "phone",
    "visit",
    "in-person",
    "drive",
    "car",
    "gas",
    "oil",
    "repair",
    "mechanic",
    "bank",
    "atm",
    "post office",
    "mail",
    "letter",
    "package",
    "doctor",
    "dentist",
    "appointment",
    "health",
    "medical",
    "house",
    "home",
    "paint",
    "yard",
    "garden",
    "pet",
    "dog",
    "cat",
    "vet",
    "feed",
    "trash",
    "garbage",
    "recycling",
]


def classify_with_ai(task_text: str) -> bool:
    openrouter_key = os.getenv("OPENROUTER_KEY")
    if not openrouter_key:
        return True

    proxy = os.getenv("OPENROUTER_PROXY", "https://openrouter.ai/api/v1")

    prompt = (
        "Is this task done primarily on a computer/phone/digital device, or is it a physical/offline task?\n\n"
        f'Task: "{task_text}"\n\n'
        'Answer with just ONE word: "COMPUTER" if it\'s digital/computer-based, or "OFFLINE" if it\'s physical.\n'
        "Examples:\n"
        '- "Check email" -> COMPUTER\n'
        '- "Buy groceries" -> OFFLINE\n'
        '- "Write code" -> COMPUTER\n'
        '- "Go to gym" -> OFFLINE\n'
        '- "Review pull request" -> COMPUTER\n'
        '- "Clean kitchen" -> OFFLINE'
    )

    response = requests.post(
        f"{proxy}/chat/completions",
        headers={
            "Authorization": f"Bearer {openrouter_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://localhost",
            "X-Title": "TaskClassifier",
        },
        json={
            "model": "moonshotai/kimi-k2-5",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 10,
            "temperature": 0.1,
        },
        timeout=10,
    )
    if response.status_code != 200:
        return True
    answer = response.json()["choices"][0]["message"]["content"].strip().upper()
    return "COMPUTER" in answer


def is_computer_task(
    task_content: str, task_description: str, cache: Dict[str, bool]
) -> bool:
    full_text = f"{task_content} {task_description}".strip()
    key = task_hash(full_text)
    if key in cache:
        return cache[key]

    text_lower = full_text.lower()
    for kw in COMPUTER_KEYWORDS:
        if kw in text_lower:
            cache[key] = True
            save_cache(cache)
            return True

    for kw in OFFLINE_KEYWORDS:
        if kw in text_lower:
            cache[key] = False
            save_cache(cache)
            return False

    try:
        result = classify_with_ai(full_text)
    except Exception:
        result = True
    cache[key] = result
    save_cache(cache)
    return result
