import React, { useEffect, useMemo, useState } from "react";
import api from "../bridge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Alert } from "./ui/alert.jsx";
import { Badge } from "./ui/badge.jsx";
import { Input } from "./ui/input.jsx";
import { PostponeModal } from "./PostponeModal.jsx";
import { ArrowLeft, Calendar, Check } from "./ui/icons.jsx";
import { MarkdownText } from "./ui/markdown.jsx";
import { Play, Repeat } from "lucide-react";
import { useToast } from "./ui/toast.jsx";

function formatTimeDisplay(iso, isOverdue, isToday) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isSameDay = date.getDate() === todayStart.getDate() &&
    date.getMonth() === todayStart.getMonth() &&
    date.getFullYear() === todayStart.getFullYear();
  
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;
  
  if (isSameDay) {
    return { text: timeStr, colorClass: isOverdue ? "text-red-400" : "text-emerald-400" };
  }
  
  // For non-today, show day name
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = days[date.getDay()];
  const text = `${dayName} ${timeStr}`;
  return { text, colorClass: "text-amber-400" };
}

function priorityDot(priority) {
  if (priority === 4) return "bg-red-500";
  if (priority === 3) return "bg-amber-400";
  if (priority === 2) return "bg-blue-500";
  return "bg-zinc-500";
}

export default function TaskQueue() {
  const [tasks, setTasks] = useState([]);
  const [completingId, setCompletingId] = useState(null);
  const [startingId, setStartingId] = useState(null);
  const [postponeTask, setPostponeTask] = useState(null);
  const [postponeReason, setPostponeReason] = useState("");
  const [postponeWhen, setPostponeWhen] = useState("");
  const { addToast } = useToast();

  const handleBack = (event) => {
    event.preventDefault();
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const loadQueue = async () => {
    const cached = await api.getTaskQueueCache();
    if (cached?.ok && cached.tasks?.length) {
      setTasks(cached.tasks || []);
    }
    const res = await api.getTaskQueue();
    if (!res?.ok) {
      if (!cached?.ok) {
        addToast({
          title: "Failed to load task queue.",
          variant: "error",
        });
      }
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
        addToast({
          title: "Failed to complete task.",
          variant: "error",
        });
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
        addToast({
          title: "Failed to complete task.",
          variant: "error",
        });
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
    const combinedReason = postponeWhen.trim()
      ? `${postponeReason.trim()} (${postponeWhen.trim()})`
      : postponeReason.trim();
    setPostponeTask(null);
    setPostponeReason("");
    setPostponeWhen("");
    try {
      const res = await api.postponeTask({
        taskId,
        taskName: postponeTask.content,
        description: postponeTask.description || "",
        mode: "corner",
        elapsedSeconds: 0,
        estimatedMinutes: 0,
        reason: combinedReason || "postpone",
      });
      if (res?.ok) {
        if (res.customPostponed && res.parsedDate) {
          const dateObj = new Date(res.parsedDate);
          const formatted = dateObj.toLocaleString([], { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          addToast({
            title: "Task postponed",
            description: `Postponed to ${formatted}`,
            variant: "success",
          });
        } else if (res.sleep) {
          addToast({
            title: "Sleep mode enabled",
            variant: "success",
          });
        } else {
          addToast({
            title: "Task postponed",
            description: "Postponed 30 minutes",
            variant: "success",
          });
        }
      } else if (removedTask) {
        addToast({
          title: "Failed to postpone task.",
          variant: "error",
        });
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
        addToast({
          title: "Failed to postpone task.",
          variant: "error",
        });
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

  const startTaskSession = async (task) => {
    if (!task?.id) return;
    setStartingId(task.id);
    try {
      const res = await api.startQueueTask({
        taskId: task.id,
        taskName: task.content,
        description: task.description || "",
        mode: "corner",
      });
      if (res?.ok) {
        addToast({
          title: "Session started",
          description: task.content,
          variant: "success",
        });
      } else if (res?.reason === "overlay-active") {
        addToast({
          title: "Overlay already active",
          description: "Close it before starting another task.",
          variant: "warning",
        });
      } else {
        addToast({
          title: "Failed to start task session.",
          variant: "error",
        });
      }
    } catch (err) {
      addToast({
        title: "Failed to start task session.",
        variant: "error",
      });
    } finally {
      setStartingId(null);
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
                        <span className={`h-2 w-2 rounded-full shrink-0 ${priorityDot(task.priority)}`} />
                        <span className="truncate">{task.content}</span>
                      </div>
                      {task.description && (
                        <div className="text-xs text-zinc-400 mt-1 truncate">
                          <MarkdownText text={task.description} />
                        </div>
                      )}
                    </div>
                     <div className="flex items-center gap-2 shrink-0">
                       {(() => {
                         const timeDisplay = formatTimeDisplay(task.due, true, false);
                         return (
                           <span className={`text-xs font-medium ${timeDisplay.colorClass}`}>
                             {timeDisplay.text}
                             {task.is_recurring && <Repeat className="h-3 w-3 inline ml-1" />}
                           </span>
                         );
                       })()}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startTaskSession(task)}
                        disabled={!api.isAvailable() || startingId === task.id}
                        aria-label="Start task"
                        title="Start task"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPostponeTask(task);
                          setPostponeReason("");
                          setPostponeWhen("");
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
                        <span className={`h-2 w-2 rounded-full shrink-0 ${priorityDot(task.priority)}`} />
                        <span className="truncate">{task.content}</span>
                      </div>
                      {task.description && (
                        <div className="text-xs text-zinc-400 mt-1 truncate">
                          <MarkdownText text={task.description} />
                        </div>
                      )}
                    </div>
                     <div className="flex items-center gap-2 shrink-0">
                       {(() => {
                         const timeDisplay = formatTimeDisplay(task.due, false, true);
                         return (
                           <span className={`text-xs font-medium ${timeDisplay.colorClass}`}>
                             {timeDisplay.text}
                             {task.is_recurring && <Repeat className="h-3 w-3 inline ml-1" />}
                           </span>
                         );
                       })()}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startTaskSession(task)}
                        disabled={!api.isAvailable() || startingId === task.id}
                        aria-label="Start task"
                        title="Start task"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPostponeTask(task);
                          setPostponeReason("");
                          setPostponeWhen("");
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
                        <span className={`h-2 w-2 rounded-full shrink-0 ${priorityDot(task.priority)}`} />
                        <span className="truncate">{task.content}</span>
                      </div>
                      {task.description && (
                        <div className="text-xs text-zinc-400 mt-1 truncate">
                          <MarkdownText text={task.description} />
                        </div>
                      )}
                    </div>
                     <div className="flex items-center gap-2 shrink-0">
                       {(() => {
                         const timeDisplay = formatTimeDisplay(task.due, false, false);
                         return (
                           <span className={`text-xs font-medium ${timeDisplay.colorClass}`}>
                             {timeDisplay.text}
                             {task.is_recurring && <Repeat className="h-3 w-3 inline ml-1" />}
                           </span>
                         );
                       })()}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startTaskSession(task)}
                        disabled={!api.isAvailable() || startingId === task.id}
                        aria-label="Start task"
                        title="Start task"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPostponeTask(task);
                          setPostponeReason("");
                          setPostponeWhen("");
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

        <PostponeModal
          open={Boolean(postponeTask)}
          title="Postpone Task"
          description={postponeTask?.content}
          reason={postponeReason}
          onReasonChange={setPostponeReason}
          when={postponeWhen}
          onWhenChange={setPostponeWhen}
          showWhen
          onCancel={() => {
            setPostponeTask(null);
            setPostponeReason("");
            setPostponeWhen("");
          }}
          onSubmit={submitPostpone}
          submitLabel="Postpone"
          disabled={!postponeReason.trim()}
        />
      </div>
    </div>
  );
}
