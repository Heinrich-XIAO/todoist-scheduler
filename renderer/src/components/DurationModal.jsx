import React from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";

export function DurationModal({
  open,
  taskName,
  minutes,
  onMinutesChange,
  onCancel,
  onSubmit,
  submitting,
}) {
  if (!open) return null;

  const trimmedMinutes = String(minutes || "").trim();
  const parsedMinutes = Number(trimmedMinutes);
  const isInvalid = !trimmedMinutes || !Number.isFinite(parsedMinutes) || parsedMinutes <= 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="w-[520px] max-w-full bg-zinc-900 border border-zinc-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-2">Set task duration</h3>
        {taskName && <p className="text-sm text-zinc-400 mb-4 truncate">{taskName}</p>}

        <div className="mb-4">
          <label htmlFor="duration-minutes" className="text-sm text-zinc-300 mb-2 block">
            Duration (minutes)
          </label>
          <Input
            id="duration-minutes"
            type="number"
            min="1"
            inputMode="numeric"
            autoFocus
            placeholder="e.g., 30"
            value={minutes}
            onChange={(event) => onMinutesChange(event.target.value)}
            className="w-full"
          />
          <p className="text-xs text-zinc-500 mt-1">This overrides the AI estimate stored with the task.</p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || isInvalid}>
            {submitting && (
              <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
            )}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
