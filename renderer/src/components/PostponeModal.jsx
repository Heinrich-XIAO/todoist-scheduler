import React from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";

export function PostponeModal({
  open,
  title,
  description,
  reason,
  onReasonChange,
  when,
  onWhenChange,
  showWhen = true,
  onCancel,
  onSubmit,
  submitLabel = "Submit",
  disabled = false,
  reasonLabel = "Reason:",
  reasonPlaceholder = "Why are you postponing?",
  whenLabel = "Postpone to:",
  whenPlaceholder = "tomorrow, next Monday, in 2 hours, sleep, etc.",
  helperText = "AI will parse this and extract the date/time",
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="w-[520px] bg-zinc-900 border border-zinc-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        {description && <p className="text-sm text-zinc-400 mb-4">{description}</p>}

        <div className="mb-4">
          <label className="text-sm text-zinc-300 mb-2 block">{reasonLabel}</label>
          <Input
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={reasonPlaceholder}
            className="w-full"
          />
        </div>

        {showWhen && (
          <div className="mb-4">
            <label className="text-sm text-zinc-300 mb-2 block">{whenLabel}</label>
            <Input
              value={when}
              onChange={(e) => onWhenChange(e.target.value)}
              placeholder={whenPlaceholder}
              className="w-full"
            />
            {helperText && <p className="text-xs text-zinc-500 mt-1">{helperText}</p>}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={disabled}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
