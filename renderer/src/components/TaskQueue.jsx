import React, { useEffect, useMemo, useState } from "react";
import api from "../bridge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Alert } from "./ui/alert.jsx";
import { Badge } from "./ui/badge.jsx";
import { Input } from "./ui/input.jsx";
import { ArrowLeft, Calendar, Check, ExternalLink } from "./ui/icons.jsx";
import { MarkdownText } from "./ui/markdown.jsx";

function formatDue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function priorityDot(priority) {
  if (priority === 4) return "bg-red-500";
  if (priority === 3) return "bg-amber-400";
  if (priority === 2) return "bg-blue-500";
  return "bg-zinc-500";
}

export default function TaskQueue() {
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState("");
  const [completingId, setCompletingId] = useState(null);
  const [postponeTask, setPostponeTask] = useState(null);
  const [postponeReason, setPostponeReason] = useState("");

  const handleBack = (event) => {
    event.preventDefault();
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const loadQueue = async () => {
    setStatus("");
    const res = await api.getTaskQueue();
    if (!res?.ok) {
      setStatus("Failed to load task queue.");
      return;
    }
    setTasks(res.tasks || []);
  };

  const completeTask = async (taskId) => {
    if (!taskId) return;
    let removedTask = null;
    let removedIndex = -1;
    setTasks((prev) => {
      removedIndex = prev.findIndex((task) => task.id === taskId);
      if (removedIndex === -1) return prev;
      removedTask = prev[removedIndex];
      const next = [...prev];
      next.splice(removedIndex, 1);
      return next;
    });
    setCompletingId(taskId);
    try {
      const res = await api.completeTask(taskId);
      if (!res?.ok && removedTask) {
        setStatus("Failed to complete task.");
        setTasks((prev) => {
          if (prev.find((task) => task.id === removedTask.id)) return prev;
          const next = [...prev];
          const index = Math.min(Math.max(removedIndex, 0), next.length);
          next.splice(index, 0, removedTask);
          return next;
        });
      }
    } catch (err) {
      if (removedTask) {
        setStatus("Failed to complete task.");
        setTasks((prev) => {
          if (prev.find((task) => task.id === removedTask.id)) return prev;
          const next = [...prev];
          const index = Math.min(Math.max(removedIndex, 0), next.length);
          next.splice(index, 0, removedTask);
          return next;
        });
      }
    } finally {
      setCompletingId(null);
    }
  };

  const submitPostpone = async () => {
    if (!postponeTask) return;
    const taskId = postponeTask.id;
    let removedTask = null;
    let removedIndex = -1;
    setTasks((prev) => {
      removedIndex = prev.findIndex((task) => task.id === taskId);
      if (removedIndex === -1) return prev;
      removedTask = prev[removedIndex];
      const next = [...prev];
      next.splice(removedIndex, 1);
      return next;
    });
    setPostponeTask(null);
    setPostponeReason("");
    try {
      const res = await api.postponeTask({
        taskId,
        taskName: postponeTask.content,
        description: postponeTask.description || "",
        mode: "queue",
        elapsedSeconds: 0,
        estimatedMinutes: 0,
        reason: postponeReason.trim() || "postpone",
      });
      if (!res?.ok && removedTask) {
        setStatus("Failed to postpone task.");
        setTasks((prev) => {
          if (prev.find((task) => task.id === removedTask.id)) return prev;
          const next = [...prev];
          const index = Math.min(Math.max(removedIndex, 0), next.length);
          next.splice(index, 0, removedTask);
          return next;
        });
      }
    } catch (err) {
      if (removedTask) {
        setStatus("Failed to postpone task.");
        setTasks((prev) => {
          if (prev.find((task) => task.id === removedTask.id)) return prev;
          const next = [...prev];
          const index = Math.min(Math.max(removedIndex, 0), next.length);
          next.splice(index, 0, removedTask);
          return next;
        });
      }
    }
  };

  useEffect(() => {
    loadQueue();
    const intervalId = setInterval(loadQueue, 120_000);
    const onFocus = () => loadQueue();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const grouped = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const overdue = [];
    const today = [];
    const upcoming = [];
    tasks.forEach((task) => {
      const due = task.due ? Date.parse(task.due) : null;
      if (!due) return;
      if (due < now) {
        overdue.push(task);
        return;
      }
      const isToday = new Date(due).toDateString() === todayStart.toDateString();
      if (isToday) {
        today.push(task);
      } else {
        upcoming.push(task);
      }
    });
    return { overdue, today, upcoming };
  }, [tasks]);

  const primaryTaskId = useMemo(() => tasks[0]?.id, [tasks]);

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="mb-8">
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-400"
            onClick={handleBack}
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft />
          </Button>
          <h1 className="text-3xl font-semibold mt-2">Task Queue</h1>
          <p className="text-zinc-400 mt-2">
            AI ordered (fixed first, variable last).
          </p>
        </div>

        {!api.isAvailable() && (
          <Alert variant="warning" className="mb-6">
            IPC not available in browser preview. Run the Electron app to view tasks.
          </Alert>
        )}

        <div className="flex items-center justify-between mb-6">
          <div className="text-sm text-zinc-400">
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </div>
        </div>

        {status && <p className="text-sm text-amber mb-4">{status}</p>}

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Overdue</CardTitle>
              <CardDescription>Past due tasks.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {grouped.overdue.length === 0 && (
                  <p className="text-sm text-zinc-400">No overdue tasks.</p>
                )}
                {grouped.overdue.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      task.id === primaryTaskId
                        ? "border-emerald-500/70 bg-emerald-500/10"
                        : "border-zinc-800 bg-zinc-900/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium flex items-center gap-2 truncate">
                        <span className={`h-2 w-2 rounded-full ${priorityDot(task.priority)}`} />
                        <span className="truncate">{task.content}</span>
                      </div>
                      {task.description && (
                        <div className="text-xs text-zinc-400 mt-1 truncate">
                          <MarkdownText text={task.description} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.id === primaryTaskId && <Badge>Do this next</Badge>}
                      {task.is_recurring && <Badge variant="secondary">Recurring</Badge>}
                      <Badge variant="destructive">Overdue</Badge>
                      <span className="text-xs text-zinc-500">{formatDue(task.due)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => api.openTodoistTask(task.id)}
                        disabled={!api.isAvailable()}
                        aria-label="Open in Todoist"
                        title="Open in Todoist"
                      >
                        <ExternalLink />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPostponeTask(task);
                          setPostponeReason("");
                        }}
                        disabled={!api.isAvailable()}
                        aria-label="Postpone task"
                        title="Postpone"
                      >
                        <Calendar />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => completeTask(task.id)}
                        disabled={!api.isAvailable() || completingId === task.id}
                        aria-label="Complete task"
                        title="Complete"
                      >
                        <Check />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
              <CardDescription>Due later today.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {grouped.today.length === 0 && (
                  <p className="text-sm text-zinc-400">No remaining tasks for today.</p>
                )}
                {grouped.today.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      task.id === primaryTaskId
                        ? "border-emerald-500/70 bg-emerald-500/10"
                        : "border-zinc-800 bg-zinc-900/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium flex items-center gap-2 truncate">
                        <span className={`h-2 w-2 rounded-full ${priorityDot(task.priority)}`} />
                        <span className="truncate">{task.content}</span>
                      </div>
                      {task.description && (
                        <div className="text-xs text-zinc-400 mt-1 truncate">
                          <MarkdownText text={task.description} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.id === primaryTaskId && <Badge>Do this next</Badge>}
                      {task.is_recurring && <Badge variant="secondary">Recurring</Badge>}
                      <Badge variant="outline">Due</Badge>
                      <span className="text-xs text-zinc-500">{formatDue(task.due)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => api.openTodoistTask(task.id)}
                        disabled={!api.isAvailable()}
                        aria-label="Open in Todoist"
                        title="Open in Todoist"
                      >
                        <ExternalLink />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPostponeTask(task);
                          setPostponeReason("");
                        }}
                        disabled={!api.isAvailable()}
                        aria-label="Postpone task"
                        title="Postpone"
                      >
                        <Calendar />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => completeTask(task.id)}
                        disabled={!api.isAvailable() || completingId === task.id}
                        aria-label="Complete task"
                        title="Complete"
                      >
                        <Check />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
              <CardDescription>Due after today.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {grouped.upcoming.length === 0 && (
                  <p className="text-sm text-zinc-400">No upcoming tasks.</p>
                )}
                {grouped.upcoming.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      task.id === primaryTaskId
                        ? "border-emerald-500/70 bg-emerald-500/10"
                        : "border-zinc-800 bg-zinc-900/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium flex items-center gap-2 truncate">
                        <span className={`h-2 w-2 rounded-full ${priorityDot(task.priority)}`} />
                        <span className="truncate">{task.content}</span>
                      </div>
                      {task.description && (
                        <div className="text-xs text-zinc-400 mt-1 truncate">
                          <MarkdownText text={task.description} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.id === primaryTaskId && <Badge>Do this next</Badge>}
                      {task.is_recurring && <Badge variant="secondary">Recurring</Badge>}
                      <Badge variant="outline">Upcoming</Badge>
                      <span className="text-xs text-zinc-500">{formatDue(task.due)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => api.openTodoistTask(task.id)}
                        disabled={!api.isAvailable()}
                        aria-label="Open in Todoist"
                        title="Open in Todoist"
                      >
                        <ExternalLink />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPostponeTask(task);
                          setPostponeReason("");
                        }}
                        disabled={!api.isAvailable()}
                        aria-label="Postpone task"
                        title="Postpone"
                      >
                        <Calendar />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => completeTask(task.id)}
                        disabled={!api.isAvailable() || completingId === task.id}
                        aria-label="Complete task"
                        title="Complete"
                      >
                        <Check />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>

        {postponeTask && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <Card className="w-[520px]">
              <CardHeader>
                <CardTitle>Why are you postponing?</CardTitle>
                <CardDescription>{postponeTask.content}</CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  value={postponeReason}
                  onChange={(e) => setPostponeReason(e.target.value)}
                  placeholder="Type your reason"
                  className="mb-4"
                />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPostponeTask(null);
                      setPostponeReason("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={submitPostpone} disabled={!postponeReason.trim()}>
                    Postpone
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
