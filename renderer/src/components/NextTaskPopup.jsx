import React, { useEffect, useMemo, useState } from "react";
import api from "../bridge.js";
import { Button } from "./ui/button.jsx";

function formatCountdown(seconds) {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function NextTaskPopup() {
  const [data, setData] = useState(null);
  const [pending, setPending] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    let mounted = true;
    const off = api.onNextTaskPopupData((payload) => {
      if (!mounted) return;
      setData(payload || null);
    });
    return () => {
      mounted = false;
      if (typeof off === "function") off();
    };
  }, []);

  const deadlineAt = useMemo(() => {
    if (!data?.deadlineAt) return null;
    const parsed = Number(data.deadlineAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [data]);

  useEffect(() => {
    if (!deadlineAt) {
      setRemainingSeconds(0);
      return undefined;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    };
    update();
    const id = setInterval(update, 250);
    return () => clearInterval(id);
  }, [deadlineAt]);

  const onStart = async () => {
    if (!data?.task || pending) return;
    setPending(true);
    try {
      await api.sendNextTaskPopupAction({ action: "start" });
    } finally {
      setPending(false);
    }
  };

  if (!data || data.empty || !data.task) {
    return (
      <div className="h-screen w-screen bg-transparent flex items-center justify-center">
        <div className="w-[480px] rounded-2xl border border-zinc-800 bg-zinc-950/90 p-6 text-white">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Queue</div>
          <h2 className="mt-2 text-2xl font-semibold">Out of tasks</h2>
          <p className="mt-2 text-sm text-zinc-400">
            You have no queued tasks right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-transparent flex items-center justify-center">
      <div className="w-[520px] rounded-2xl border border-emerald-500/40 bg-zinc-950/95 p-6 text-white shadow-[0_0_40px_rgba(16,185,129,0.2)]">
        <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">Next Task</div>
        <h2 className="mt-2 text-2xl font-semibold leading-snug">{data.task.content}</h2>
        {data.task.description && (
          <p className="mt-2 text-sm text-zinc-400 line-clamp-3">
            {data.task.description}
          </p>
        )}
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">Auto-start in</div>
          <div className="mt-2 text-3xl font-mono text-emerald-200">
            {formatCountdown(remainingSeconds)}
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end">
          <Button
            variant="default"
            onClick={onStart}
            disabled={pending}
          >
            {pending ? "Starting..." : "Start task"}
          </Button>
        </div>
      </div>
    </div>
  );
}
