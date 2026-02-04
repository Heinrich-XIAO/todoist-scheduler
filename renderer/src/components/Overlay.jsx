import React, { useEffect, useMemo, useState } from "react";
import api from "../bridge.js";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.jsx";
import { ArrowDownRight, Calendar, Clock, X } from "./ui/icons.jsx";
import { MarkdownText } from "./ui/markdown.jsx";

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
  const [status, setStatus] = useState("");
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
    });
    const handler = (next) => setMode(next);
    api.onOverlayMode(handler);
    return () => {
      mounted = false;
    };
  }, []);

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
    setStatus("");
    if (snoozeCount > 0) {
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
    setStatus(result.message);
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
      setStatus(`Postponed to ${formatted} - scheduler will not move it`);
    } else if (result.sleep) {
      setStatus("Sleep mode enabled - tasks will resume tomorrow");
    } else {
      setStatus("Postponed 30 minutes - next task queued");
    }
    setPostponeOpen(false);
    setReason("");
    setPostponeWhen("");
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
      {dragging && mode === "corner" && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-10 w-[320px] h-[70px] border border-dashed border-amber/70 rounded-2xl pointer-events-none z-50" />
      )}
      {mode === "corner" ? (
          <div 
            className={`h-full w-full border border-zinc-700 rounded-2xl flex items-center px-4 relative z-10 cursor-pointer transition-colors ${
              isHovered ? 'bg-zinc-800' : 'bg-zinc-900/90'
            }`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            {!isHovered ? (
              <>
                <div className="text-sm font-semibold mr-4">{formatTime(elapsed)}</div>
                <div className="flex-1 text-sm truncate">{task.content}</div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-2">
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
      ) : (
        <div className="h-full w-full bg-ink/95 text-white flex flex-col items-center justify-center gap-6 relative z-10">
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

          {status && <div className="text-sm text-amber">{status}</div>}
        </div>
      )}

      {(postponeOpen || justificationOpen) && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="w-[520px] bg-zinc-900 border border-zinc-700 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-2">
              {justificationOpen ? "Why do you need another snooze?" : "Postpone Task"}
            </h3>
            
            {justificationOpen ? (
              <>
                <p className="text-sm text-zinc-400 mb-4">
                  Be specific. The assistant will decide.
                </p>
                <div className="mb-4">
                  <label className="text-sm text-zinc-300 mb-2 block">Reason:</label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why you need to snooze again"
                    className="w-full"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <label className="text-sm text-zinc-300 mb-2 block">Reason:</label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why are you postponing?"
                    className="w-full"
                  />
                </div>
                <div className="mb-4">
                  <label className="text-sm text-zinc-300 mb-2 block">Postpone to:</label>
                  <Input
                    value={postponeWhen}
                    onChange={(e) => setPostponeWhen(e.target.value)}
                    placeholder="tomorrow, next Monday, in 2 hours, sleep, etc."
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    AI will parse this and extract the date/time
                  </p>
                </div>
              </>
            )}
            
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setPostponeOpen(false);
                  setJustificationOpen(false);
                  setReason("");
                  setPostponeWhen("");
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={justificationOpen ? submitJustification : submitPostpone}
                disabled={!reason.trim()}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
