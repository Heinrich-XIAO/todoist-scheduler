import React, { useEffect, useRef, useState } from "react";
import api from "../bridge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Alert } from "./ui/alert.jsx";

export default function QuickStart() {
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        api.closeQuickWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    const trimmed = taskName.trim();
    if (!trimmed) return;
    setStatus("");
    setSubmitting(true);
    const res = await api.startQuickTask({
      taskName: trimmed,
      description: description.trim(),
    });
    setSubmitting(false);
    if (!res?.ok) {
      setStatus("Could not start the task.");
    }
  };

  return (
    <div className="min-h-screen bg-ink text-white flex items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Start a task</CardTitle>
          <CardDescription>Type what you need to do. AI will estimate time.</CardDescription>
        </CardHeader>
        <CardContent>
          {!api.isAvailable() && (
            <Alert variant="warning" className="mb-4">
              IPC not available in browser preview. Run the Electron app.
            </Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-zinc-300">Task name</label>
              <Input
                ref={inputRef}
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="Write status update"
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-300">Notes (optional)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a bit more context"
                className="mt-2"
              />
            </div>
            {status && <p className="text-sm text-amber">{status}</p>}
            <div className="flex items-center justify-between">
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
        </CardContent>
      </Card>
    </div>
  );
}
