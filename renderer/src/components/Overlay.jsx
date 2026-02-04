import React, { useEffect, useMemo, useState } from "react";
import api from "../bridge.js";
import { Button } from "./ui/button.jsx";
import { ArrowDownRight, Calendar, Clock } from "./ui/icons.jsx";
import { MarkdownText } from "./ui/markdown.jsx";
import { PostponeModal } from "./PostponeModal.jsx";
import { toast } from "sonner";

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(remMins).padStart(2, "0")}:${String(
      secs
    ).padStart(2, "0")}`;
  }
  return `${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function Overlay() {
  const [task, setTask] = useState(null);
  const [mode, setMode] = useState("full");
  const [timerStarted, setTimerStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [snoozeCount, setSnoozeCount] = useState(0);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [justificationOpen, setJustificationOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [postponeWhen, setPostponeWhen] = useState("");
  const [sessionStarted, setSessionStarted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.getOverlayTask().then((data) => {
      if (!mounted) return;
      setTask(data.task);
      setMode(data.mode || "full");
      setSnoozeCount(data.task?.snoozeCount || 0);
      const serverElapsed = Number.isFinite(data.elapsedSeconds) ? data.elapsedSeconds : 0;
      if (data.sessionActive || data.task?.autoStart) {
        setTimerStarted(true);
        setSessionStarted(true);
        setElapsed(serverElapsed);
      } else if (serverElapsed > 0) {
        setElapsed(serverElapsed);
      }
    });
    const handler = (next) => setMode(next);
    api.onOverlayMode(handler);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const data = await api.getOverlayTask();
      if (cancelled) return;
      const serverElapsed = Number.isFinite(data.elapsedSeconds) ? data.elapsedSeconds : null;
      if (serverElapsed !== null) {
        setElapsed(serverElapsed);
      }
      if (data.sessionActive && !timerStarted) {
        setTimerStarted(true);
        setSessionStarted(true);
      }
    };
    sync();
    const id = setInterval(sync, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [timerStarted]);

  useEffect(() => {
    if (!timerStarted) return undefined;
    const id = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [timerStarted]);

  useEffect(() => {
    if (mode !== "corner") setDragging(false);
  }, [mode]);

  useEffect(() => {
    const onMouseUp = async () => {
      if (!dragging) return;
      setDragging(false);
      if (mode === "corner") await api.snapOverlay();
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [dragging, mode]);

  const progress = useMemo(() => {
    if (!task?.estimatedMinutes) return 0;
    const total = task.estimatedMinutes * 60;
    return Math.min(100, (elapsed / total) * 100);
  }, [elapsed, task]);

  const onSnooze = async () => {
    if (snoozeCount > 0) {
      if (mode === "corner") {
        setMode("full");
        await api.setOverlayMode("full");
      }
      setJustificationOpen(true);
      return;
    }
    if (sessionStarted) {
      await api.stopTaskSession({
        taskId: task.id,
        elapsedSeconds: elapsed,
        mode,
      });
      setSessionStarted(false);
    }
    const res = await api.snoozeTask({
      taskId: task.id,
      taskName: task.content,
      description: task.description,
      mode,
      elapsedSeconds: elapsed,
      estimatedMinutes: task.estimatedMinutes || 30,
    });
    setSnoozeCount(res.snoozeCount || snoozeCount + 1);
  };

  const submitJustification = async () => {
    if (!reason.trim()) return;
    const result = await api.checkJustification({
      taskName: task.content,
      description: task.description,
      justification: reason.trim(),
    });
    if (result.approved) {
      if (sessionStarted) {
        await api.stopTaskSession({
          taskId: task.id,
          elapsedSeconds: elapsed,
          mode,
        });
        setSessionStarted(false);
      }
      await api.snoozeTask({
        taskId: task.id,
        taskName: task.content,
        description: task.description,
        mode,
        elapsedSeconds: elapsed,
        estimatedMinutes: task.estimatedMinutes || 30,
      });
    }
    if (result.approved) {
      toast.success("Snoozed", { description: result.message });
    } else {
      toast.warning("Snooze denied", { description: result.message });
    }
    setJustificationOpen(false);
    setReason("");
  };

  const resetPostponeModal = () => {
    setPostponeOpen(false);
    setReason("");
    setPostponeWhen("");
  };

  const resetJustificationModal = () => {
    setJustificationOpen(false);
    setReason("");
  };

  const submitPostpone = async () => {
    if (!reason.trim()) return;
    if (sessionStarted) {
      await api.stopTaskSession({
        taskId: task.id,
        elapsedSeconds: elapsed,
        mode,
      });
      setSessionStarted(false);
    }
    
    // Combine reason and when for AI parsing
    const combinedReason = postponeWhen.trim() 
      ? `${reason.trim()} (${postponeWhen.trim()})`
      : reason.trim();
    
    const result = await api.postponeTask({
      taskId: task.id,
      taskName: task.content,
      description: task.description,
      mode,
      elapsedSeconds: elapsed,
      estimatedMinutes: task.estimatedMinutes || 30,
      reason: combinedReason,
    });
    
    if (result.customPostponed && result.parsedDate) {
      const dateObj = new Date(result.parsedDate);
      const formatted = dateObj.toLocaleString([], { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      toast.success("Task postponed", {
        description: `Postponed to ${formatted} - scheduler will not move it`,
      });
    } else if (result.sleep) {
      toast.success("Sleep mode enabled", {
        description: "Tasks will resume tomorrow",
      });
    } else {
      toast.success("Task postponed", {
        description: "Postponed 30 minutes - next task queued",
      });
    }
    resetPostponeModal();
  };

  const onStartDifferentTask = async () => {
    if (!task) return;
    if (sessionStarted) {
      await api.stopTaskSession({
        taskId: task.id,
        elapsedSeconds: elapsed,
        mode,
      });
      setSessionStarted(false);
    }
    await api.deferTask({
      taskId: task.id,
      taskName: task.content,
      description: task.description,
      mode,
      elapsedSeconds: elapsed,
      estimatedMinutes: task.estimatedMinutes || 30,
    });
  };

  if (!task) {
    return (
      <div className="h-screen flex items-center justify-center text-zinc-400">
        {api.isAvailable() ? "Waiting for task..." : "Overlay preview only in Electron"}
      </div>
    );
  }

  const progressColor = progress >= 100 ? "bg-amber-500" : "bg-emerald-500/30";

  return (
    <div
      className={`h-screen w-screen overlay-drag ${mode === "corner" ? "p-0" : "p-10"}`}
      onMouseDown={(event) => {
        if (mode !== "corner") return;
        const target = event.target;
        if (target?.closest?.("button, input, textarea")) return;
        setDragging(true);
      }}
    >
      {/* Progress bar background */}
      <div 
        className={`absolute inset-0 ${progressColor} transition-all duration-1000 ease-linear`}
        style={{ 
          width: `${Math.min(progress, 100)}%`,
          zIndex: 0 
        }}
      />
      {mode === "corner" ? (
          <div 
            className={`h-full w-full border border-zinc-700 rounded-2xl relative z-10`}
          >
            <div className="overlay-drag-handle" />
            <div
              className={`overlay-corner-content flex items-center px-4 ${
                isHovered ? "" : ""
              }`}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              {!isHovered ? (
                <>
                  <div className="text-sm font-semibold mr-4">{formatTime(elapsed)}</div>
                  <div className="flex-1 text-sm truncate">{task.content}</div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 bg-transparent px-2 py-1 rounded">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={async () => {
                      if (sessionStarted) {
                        await api.stopTaskSession({
                          taskId: task.id,
                          elapsedSeconds: elapsed,
                          mode,
                        });
                        setSessionStarted(false);
                      }
                      await api.completeTask(task.id);
                    }}
                  >
                    Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onSnooze}
                    aria-label="Wait 5 min"
                    title="Wait 5 min"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => {
                      console.log("[Overlay] Opening postpone modal");
                      if (mode === "corner") {
                        setMode("full");
                        api.setOverlayMode("full");
                      }
                      setPostponeOpen(true);
                    }}
                    aria-label="Postpone"
                    title="Postpone"
                  >
                    <Calendar className="h-5 w-5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
      ) : (
        <div className="h-full w-full bg-ink/95 text-white flex flex-col items-center justify-center gap-6 relative z-10">
          {task.suggested && (
            <div className="text-xs uppercase tracking-wide text-amber-300/90">
              Suggested from queue
            </div>
          )}
          <h1 className="text-5xl font-semibold text-center max-w-4xl break-words">
            {task.content}
          </h1>
          {task.description && (
            <MarkdownText
              text={task.description}
              className="text-lg text-zinc-400 max-w-3xl text-center break-words"
            />
          )}

          {!timerStarted ? (
            <div className="flex flex-col items-center gap-4">
                <Button
                  size="lg"
                  onClick={async () => {
                    setTimerStarted(true);
                    if (!sessionStarted) {
                      await api.startTaskSession({
                        taskId: task.id,
                        taskName: task.content,
                        mode,
                      });
                      setSessionStarted(true);
                    }
                    setMode("corner");
                    await api.setOverlayMode("corner");
                  }}
                >
                  Start Task
                </Button>
              <Button
                variant="secondary"
                onClick={onStartDifferentTask}
              >
                Start Different Task
              </Button>
              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={onSnooze}
                  aria-label="Wait 5 min"
                  title="Wait 5 min"
                >
                  <Clock className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => setPostponeOpen(true)}
                  aria-label="Postpone"
                  title="Postpone"
                >
                  <Calendar className="h-5 w-5" />
                </Button>
              </div>
              <div className="text-sm text-zinc-400">Estimated: {task.estimatedMinutes} minutes</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <div className="text-6xl font-mono text-emerald-400">{formatTime(elapsed)}</div>
              <div className="w-[520px] bg-zinc-800 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-sm text-zinc-400">Goal: {task.estimatedMinutes} minutes</div>
              <div className="flex gap-4">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={async () => {
                    setMode("corner");
                    await api.setOverlayMode("corner");
                  }}
                  aria-label="Continue in corner"
                  title="Continue in corner"
                >
                  <ArrowDownRight className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => {
                    console.log("[Overlay] Opening postpone modal (timer active)");
                    setPostponeOpen(true);
                  }}
                  aria-label="Postpone"
                  title="Postpone"
                >
                  <Calendar className="h-5 w-5" />
                </Button>
                <Button
                  variant="default"
                  onClick={async () => {
                    if (sessionStarted) {
                      await api.stopTaskSession({
                        taskId: task.id,
                        elapsedSeconds: elapsed,
                        mode,
                      });
                      setSessionStarted(false);
                    }
                    await api.completeTask(task.id);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          )}

        </div>
      )}

      <PostponeModal
        open={postponeOpen}
        title="Postpone Task"
        reason={reason}
        onReasonChange={setReason}
        when={postponeWhen}
        onWhenChange={setPostponeWhen}
        showWhen
        onCancel={resetPostponeModal}
        onSubmit={submitPostpone}
        disabled={!reason.trim()}
      />
      <PostponeModal
        open={justificationOpen}
        title="Why do you need another snooze?"
        description="Be specific. The assistant will decide."
        reason={reason}
        onReasonChange={setReason}
        showWhen={false}
        reasonPlaceholder="Explain why you need to snooze again"
        onCancel={resetJustificationModal}
        onSubmit={submitJustification}
        disabled={!reason.trim()}
      />

    </div>
  );
}
