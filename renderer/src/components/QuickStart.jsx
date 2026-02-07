import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../bridge.js";
import { Button } from "./ui/button.jsx";
import { toast } from "sonner";

export default function QuickStart() {
  const [taskName, setTaskName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const [nextTask, setNextTask] = useState(null);
  const [loadingNextTask, setLoadingNextTask] = useState(false);
  const nextTaskStarting = useRef(false);
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
  const nextShortcutLabel = isMac ? "⌘N" : "Ctrl+N";

  const fetchNextCandidate = useCallback(async () => {
    let candidate = null;
    try {
      const cached = await api.getTaskQueueCache();
      if (cached?.ok && cached.tasks?.length) {
        candidate = cached.tasks[0];
        setNextTask(candidate);
      }
    } catch {
      // ignore cache failures
    }
    try {
      const queued = await api.getTaskQueue();
      if (queued?.ok && queued.tasks?.length) {
        candidate = queued.tasks[0];
        setNextTask(candidate);
        return;
      }
    } catch {
      // keep cached candidate if present
    }
    if (!candidate) {
      setNextTask(null);
    }
  }, []);

  const startNextTask = useCallback(async () => {
    if (nextTaskStarting.current) return;
    nextTaskStarting.current = true;
    setLoadingNextTask(true);
    try {
      if (!api.isAvailable()) {
        toast.error("IPC unavailable in preview mode.");
        return;
      }
      const queue = await api.getTaskQueue();
      if (!queue?.ok || !queue.tasks?.length) {
        toast.error("No queued tasks available.");
        return;
      }
      const next = queue.tasks[0];
      const minutes = Number.isFinite(Number(next.duration_minutes))
        ? Number(next.duration_minutes)
        : undefined;
      const startRes = await api.startQueueTask({
        taskId: next.id,
        taskName: next.content,
        description: next.description || "",
        mode: "corner",
        estimatedMinutes: minutes,
      });
      if (!startRes?.ok) {
        if (startRes?.reason === "overlay-active") {
          toast.warning("Overlay already active", {
            description: "Finish or dismiss it before starting another task.",
          });
        } else {
          toast.error("Failed to start the next task.");
        }
        return;
      }
      toast.success("Starting next queued task", { description: next.content });
      await api.closeQuickWindow();
    } catch {
      toast.error("Failed to start the next task.");
    } finally {
      setLoadingNextTask(false);
      nextTaskStarting.current = false;
      fetchNextCandidate();
    }
  }, [fetchNextCandidate]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        api.closeQuickWindow();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startNextTask();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    inputRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [startNextTask]);

  useEffect(() => {
    fetchNextCandidate();
  }, [fetchNextCandidate]);

  const onSubmit = async (event) => {
    event.preventDefault();
    const trimmed = taskName.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const res = await api.startQuickTask({
      taskName: trimmed,
    });
    setSubmitting(false);
  };

  return (
    <div
      className="h-full bg-ink text-white flex items-center justify-center p-6"
      data-testid="page-quick"
    >
      <div className="w-full max-w-xl">
        <div>
          <form onSubmit={onSubmit} className="space-y-4">
            <textarea
              ref={inputRef}
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="What do you need to do?"
              className="w-full h-24 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600 resize-none"
            />
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => api.closeQuickWindow()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={startNextTask}
              disabled={loadingNextTask || !nextTask}
              title={`Start next queued task (${nextShortcutLabel})`}
            >
              {loadingNextTask ? "Starting next..." : "Next Task"}
            </Button>
            <Button type="submit" disabled={!api.isAvailable() || submitting || !taskName.trim()}>
              {submitting ? "Starting..." : "Start"}
            </Button>
          </div>
          {nextTask && (
            <p className="mt-1 text-xs text-zinc-400 truncate">
              Next up: {nextTask.content}
            </p>
          )}
        </form>
      </div>
      </div>
    </div>
  );
}
