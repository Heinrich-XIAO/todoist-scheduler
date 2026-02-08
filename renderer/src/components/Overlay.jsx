import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../bridge.js";
import { Button } from "./ui/button.jsx";
import { ArrowDownRight, Calendar, Clock, GripVertical } from "./ui/icons.jsx";
import { MarkdownText } from "./ui/markdown.jsx";
import { PostponeModal } from "./PostponeModal.jsx";
import { TimerCompleteModal } from "./TimerCompleteModal.jsx";
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
  const [completedTask, setCompletedTask] = useState(null);
  const [mode, setMode] = useState("full");
  const [timerStarted, setTimerStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [snoozeCount, setSnoozeCount] = useState(0);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [justificationOpen, setJustificationOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [postponeWhen, setPostponeWhen] = useState("");
  const [postponeSubmitting, setPostponeSubmitting] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [timerCompleteOpen, setTimerCompleteOpen] = useState(false);
  const [extendedMinutes, setExtendedMinutes] = useState(0);
  const [extending, setExtending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [cornerAnchor, setCornerAnchor] = useState(null);
  const [screenPosition, setScreenPosition] = useState(() => ({
    x: typeof window !== "undefined" ? window.screenX : 0,
    y: typeof window !== "undefined" ? window.screenY : 0,
  }));
  const completionPopupSent = useRef(false);

  useEffect(() => {
    let mounted = true;
    api.getOverlayTask().then((data) => {
      if (!mounted) return;
      setTask(data.task);
      const nextMode = data.mode || "full";
      setMode(nextMode);
      setSnoozeCount(data.task?.snoozeCount || 0);
      const serverElapsed = Number.isFinite(data.elapsedSeconds) ? data.elapsedSeconds : 0;
      if (data.sessionActive || data.task?.autoStart) {
        setTimerStarted(true);
        setSessionStarted(true);
        setElapsed(serverElapsed);
      } else if (serverElapsed > 0) {
        setElapsed(serverElapsed);
      }
      if (nextMode === "corner" && !data.sessionActive && !data.task?.autoStart) {
        setMode("full");
        api.setOverlayMode("full");
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
      if ((data.mode || "full") === "corner" && !data.sessionActive && !data.task?.autoStart) {
        setMode("full");
        api.setOverlayMode("full");
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
    const id = setInterval(() => {
      setElapsed((prevElapsed) => {
        const newElapsed = prevElapsed + 1;
        const estimatedTotalSeconds = ((task?.estimatedMinutes || 0) + extendedMinutes) * 60;
        if (newElapsed > estimatedTotalSeconds && !timerCompleteOpen) {
          setTimerCompleteOpen(true);
        }
        return newElapsed;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerStarted, task?.estimatedMinutes, extendedMinutes, timerCompleteOpen]);

  useEffect(() => {
    if (!timerCompleteOpen) {
      completionPopupSent.current = false;
      return;
    }
    if (
      mode !== "corner" ||
      completionPopupSent.current ||
      !task
    ) {
      return;
    }
    completionPopupSent.current = true;
    api.showCornerCompletionPopup({
      taskName: task.content,
      elapsedSeconds: elapsed,
      estimatedMinutes: task?.estimatedMinutes || 0,
    }).catch(() => undefined);
  }, [elapsed, mode, task, timerCompleteOpen]);

  useEffect(() => {
    if (mode !== "corner") {
      setDragging(false);
    }
  }, [mode]);

  useEffect(() => {
    const onMouseUp = async () => {
      if (!dragging) return;
      console.log("[Overlay][drag] mouseup");
      setDragging(false);
      if (mode === "corner") await api.snapOverlay();
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [dragging, mode]);

  useEffect(() => {
    if (!dragging || mode !== "corner") return undefined;
    let raf = null;
    const onMouseMove = (event) => {
      if (raf) return;
      const dx = event.movementX;
      const dy = event.movementY;
      if (!dx && !dy) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        console.log("[Overlay][drag] move", { dx, dy, movementX: event.movementX, movementY: event.movementY });
        api.moveOverlayBy({ dx, dy });
      });
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [dragging, mode]);

  useEffect(() => {
    let mounted = true;
    api.onOverlayCornerAnchor((anchor) => {
      if (!mounted) return;
      setCornerAnchor(anchor);
    });
    return () => {
      mounted = false;
      setCornerAnchor(null);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setScreenPosition({ x: window.screenX, y: window.screenY });
  }, [mode]);

  useEffect(() => {
    if (!dragging) return undefined;
    let frame = null;
    const update = () => {
      setScreenPosition({ x: window.screenX, y: window.screenY });
      frame = requestAnimationFrame(update);
    };
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [dragging]);

  const progress = useMemo(() => {
    if (!task?.estimatedMinutes) return 0;
    const total = (task.estimatedMinutes + extendedMinutes) * 60;
    return Math.min(100, (elapsed / total) * 100);
  }, [elapsed, task, extendedMinutes]);
  const remaining = useMemo(() => {
    if (!task?.estimatedMinutes) return 0;
    const total = (task.estimatedMinutes + extendedMinutes) * 60;
    return Math.max(0, total - elapsed);
  }, [elapsed, task, extendedMinutes]);
  const anchorLines = useMemo(() => {
    if (!cornerAnchor) return null;
    const width = cornerAnchor.width || 0;
    const height = cornerAnchor.height || 0;
    return {
      top: cornerAnchor.y - screenPosition.y,
      bottom: cornerAnchor.y + height - screenPosition.y,
      left: cornerAnchor.x - screenPosition.x,
      right: cornerAnchor.x + width - screenPosition.x,
    };
  }, [cornerAnchor, screenPosition]);
  const clampLinePos = (value, bound) => Math.min(Math.max(value, -16), bound + 16);
  const windowWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const windowHeight = typeof window !== "undefined" ? window.innerHeight : 0;

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
    setPostponeSubmitting(false);
  };

  const resetJustificationModal = () => {
    setJustificationOpen(false);
    setReason("");
  };

  const submitPostpone = async () => {
    if (!reason.trim() || postponeSubmitting) return;
    setPostponeSubmitting(true);
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
    
    try {
      const result = await api.postponeTask({
        taskId: task.id,
        taskName: task.content,
        description: task.description,
        mode,
        elapsedSeconds: elapsed,
        estimatedMinutes: task.estimatedMinutes || 30,
        reason: combinedReason,
      });
      
      if (!result.ok) {
        toast.error("Failed to postpone", {
          description: result.error || "Could not postpone task",
        });
        resetPostponeModal();
        return;
      }
      
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
          description: `Postponed to ${formatted}`,
        });
      } else if (result.sleep) {
        toast.success("Sleep mode enabled", {
          description: "Tasks will resume tomorrow",
        });
      }
      resetPostponeModal();
    } finally {
      setPostponeSubmitting(false);
    }
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

  const onTimerExtend = async () => {
    setExtending(true);
    setExtendedMinutes((prev) => prev + (task.estimatedMinutes || 30));
    setTimerCompleteOpen(false);
    setExtending(false);
  };

  const onTimerComplete = async () => {
    if (sessionStarted) {
      await api.stopTaskSession({
        taskId: task.id,
        elapsedSeconds: elapsed,
        mode,
      });
      setSessionStarted(false);
    }
    const completedTaskContent = task.content;
    await api.completeTask(task.id);
    if (mode === "corner") {
      setCompletedTask({ content: completedTaskContent, elapsed });
      setMode("completion");
      await api.setOverlayMode("completion");
    }
    setTimerCompleteOpen(false);
  };

  const onTimerCancel = () => {
    setTimerCompleteOpen(false);
  };

  if (!task) {
    return (
      <div
        className="h-screen flex items-center justify-center text-zinc-400"
        data-testid="page-overlay"
      >
        {api.isAvailable() ? "Waiting for task..." : "Overlay preview only in Electron"}
      </div>
    );
  }

  const progressColor = progress >= 100 ? "bg-amber-500" : "bg-emerald-500/30";

  return (
    <div
      className={`h-screen w-screen overlay-drag ${mode === "corner" ? "p-0" : "p-10"}`}
      data-testid="page-overlay"
      onMouseDown={(event) => {
        if (mode !== "corner") return;
        const target = event.target;
        if (target?.closest?.("button, input, textarea")) return;
        event.preventDefault();
        console.log("[Overlay][drag] mousedown", {
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY,
          buttons: event.buttons,
        });
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
      {mode === "corner" && dragging && anchorLines && (
        <div className="corner-guide-container">
          <div
            className="corner-guide-line horizontal"
            style={{ top: clampLinePos(anchorLines.top, windowHeight) }}
          />
          <div
            className="corner-guide-line horizontal"
            style={{ top: clampLinePos(anchorLines.bottom, windowHeight) }}
          />
          <div
            className="corner-guide-line vertical"
            style={{ left: clampLinePos(anchorLines.left, windowWidth) }}
          />
          <div
            className="corner-guide-line vertical"
            style={{ left: clampLinePos(anchorLines.right, windowWidth) }}
          />
        </div>
      )}
      {mode === "completion" ? (
        <div className="h-full w-full bg-ink/95 text-white flex flex-col items-center justify-center gap-4 relative z-10 p-8">
          <div className="text-4xl">✓</div>
          <h2 className="text-2xl font-semibold text-center">Task Completed</h2>
          {completedTask && (
            <>
              <p className="text-lg text-zinc-300 text-center max-w-md">
                {completedTask.content}
              </p>
              <p className="text-sm text-zinc-400">
                Time spent: {formatTime(completedTask.elapsed)}
              </p>
            </>
          )}
          <Button
            onClick={() => {
              setTask(null);
              setCompletedTask(null);
              setMode("full");
              api.setOverlayMode("full");
            }}
          >
            Close
          </Button>
        </div>
      ) : mode === "corner" ? (
          <>
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{ 
                backdropFilter: 'blur(20px)', 
                WebkitBackdropFilter: 'blur(20px)',
                zIndex: 5
              }}
            />
            <div 
              className="h-full w-full bg-black/30 border border-zinc-700/50 rounded-2xl relative z-10"
            >
            <div
              className={`overlay-corner-content flex items-center px-4 ${
                isHovered ? "" : ""
              }`}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              {!isHovered ? (
                <>
                  <div className="text-sm font-semibold mr-4">{formatTime(remaining)}</div>
                  <div className="flex-1 text-sm truncate">{task.content}</div>
                  <GripVertical className="h-4 w-4 text-zinc-500 ml-2 cursor-grab" />
                </>
              ) : (
                <>
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
                        const completedTaskContent = task.content;
                        await api.completeTask(task.id);
                        setCompletedTask({ content: completedTaskContent, elapsed });
                        setMode("completion");
                        await api.setOverlayMode("completion");
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
                  <GripVertical className="h-4 w-4 text-zinc-500 ml-auto cursor-grab flex-shrink-0" />
                </>
              )}
            </div>
          </div>
          </>
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
        submitting={postponeSubmitting}
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

       <TimerCompleteModal
         open={timerCompleteOpen}
         task={task}
         elapsedSeconds={elapsed}
         onExtend={onTimerExtend}
         onComplete={onTimerComplete}
         onCancel={onTimerCancel}
         extending={extending}
       />

     </div>
   );
}
