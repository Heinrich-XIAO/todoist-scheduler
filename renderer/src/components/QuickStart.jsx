import React, { useEffect, useRef, useState } from "react";
import api from "../bridge.js";
import { Button } from "./ui/button.jsx";

export default function QuickStart() {
  const [taskName, setTaskName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        api.closeQuickWindow();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    inputRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

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
              <Button type="submit" disabled={!api.isAvailable() || submitting || !taskName.trim()}>
                {submitting ? "Starting..." : "Start"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
