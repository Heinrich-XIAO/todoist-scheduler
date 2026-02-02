import React, { useEffect, useMemo, useState } from "react";
import React, { useEffect, useMemo, useState } from "react";
import api from "../bridge.js";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.jsx";

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
  const [status, setStatus] = useState("");

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
    const result = await api.postponeTask({
      taskId: task.id,
      taskName: task.content,
      description: task.description,
      mode,
      elapsedSeconds: elapsed,
      estimatedMinutes: task.estimatedMinutes || 30,
      reason: reason.trim(),
    });
    setStatus(result.sleep ? "Sleep mode enabled" : "Postponed, next task queued");
    setPostponeOpen(false);
    setReason("");
  };

  if (!task) {
    return (
      <div className="h-screen flex items-center justify-center text-zinc-400">
        {api.isAvailable() ? "Waiting for task..." : "Overlay preview only in Electron"}
      </div>
    );
  }

  return (
    <div className={`h-screen w-screen ${mode === "corner" ? "p-0" : "p-10"}`}>
      {mode === "corner" ? (
          <div className="h-full w-full bg-zinc-900/90 border border-zinc-700 rounded-2xl flex items-center px-4">
            <div className="text-sm font-semibold mr-4">{formatTime(elapsed)}</div>
            <div className="flex-1 text-sm truncate">{task.content}</div>
            <Button variant="ghost" size="sm" onClick={() => api.completeTask(task.id)}>
              Complete
            </Button>
          </div>
      ) : (
        <div className="h-full w-full bg-ink text-white flex flex-col items-center justify-center gap-6">
          <h1 className="text-5xl font-semibold text-center max-w-4xl">{task.content}</h1>
          {task.description && (
            <p className="text-lg text-zinc-400 max-w-3xl text-center">{task.description}</p>
          )}

          {!timerStarted ? (
            <div className="flex flex-col items-center gap-4">
              <Button size="lg" onClick={() => setTimerStarted(true)}>
                Start Task
              </Button>
              <Button size="lg" variant="secondary" onClick={onSnooze}>
                Wait 5 min
              </Button>
              <Button size="lg" variant="default" onClick={() => setPostponeOpen(true)}>
                Postpone
              </Button>
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
                <Button onClick={() => api.setOverlayMode("corner")}>Continue (Corner)</Button>
                <Button variant="secondary" onClick={() => setPostponeOpen(true)}>
                  Postpone
                </Button>
                <Button variant="default" onClick={() => api.completeTask(task.id)}>
                  Done
                </Button>
              </div>
            </div>
          )}

          {status && <div className="text-sm text-amber">{status}</div>}
        </div>
      )}

      {(postponeOpen || justificationOpen) && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <Card className="w-[520px]">
            <CardHeader>
              <CardTitle>
                {justificationOpen ? "Why do you need another snooze?" : "Why are you postponing?"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400 mb-4">
                {justificationOpen
                  ? "Be specific. The assistant will decide."
                  : "If it's sleep-related, tasks will pause until next start window."}
              </p>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Type your reason"
                className="mb-4"
              />
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPostponeOpen(false);
                    setJustificationOpen(false);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={justificationOpen ? submitJustification : submitPostpone}>
                  Submit
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
