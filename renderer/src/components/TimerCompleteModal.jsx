import React from "react";
import { Button } from "./ui/button.jsx";

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

export function TimerCompleteModal({
  open,
  task,
  elapsedSeconds,
  onExtend,
  onComplete,
  onCancel,
  extending = false,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="w-[520px] bg-zinc-900 border border-zinc-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-2">Time's up!</h3>
        <p className="text-sm text-zinc-400 mb-4">
          You've been working on <span className="text-white font-medium">{task.content}</span> for{" "}
          <span className="text-emerald-400 font-medium">{formatTime(elapsedSeconds)}</span>.
        </p>

        <div className="flex flex-col gap-3">
          <Button
            onClick={onExtend}
            disabled={extending}
            variant="default"
          >
            {extending && (
              <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
            )}
            Extend by {task.estimatedMinutes} minutes
          </Button>
          <Button
            onClick={onComplete}
            variant="secondary"
          >
            Mark as Complete
          </Button>
          <Button
            onClick={onCancel}
            variant="ghost"
            className="text-zinc-400"
          >
            Keep Working
          </Button>
        </div>
      </div>
    </div>
  );
}
