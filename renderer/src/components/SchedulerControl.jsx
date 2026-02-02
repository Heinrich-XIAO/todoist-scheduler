import React, { useEffect, useState } from "react";
import api from "../bridge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Alert } from "./ui/alert.jsx";
import { ArrowLeft } from "./ui/icons.jsx";

export default function SchedulerControl() {
  const [status, setStatus] = useState("");
  const [lastRun, setLastRun] = useState(null);
  const [nextRun, setNextRun] = useState(null);
  const [lastError, setLastError] = useState(null);

  const handleBack = (event) => {
    event.preventDefault();
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  useEffect(() => {
    api.getSchedulerStatus().then((res) => {
      if (res?.lastRun) setLastRun(res.lastRun);
      if (res?.nextRun) setNextRun(res.nextRun);
      if (res?.lastError) setLastError(res.lastError);
    });
  }, []);

  const runNow = async () => {
    setStatus("Running scheduler...");
    const res = await api.runSchedulerNow();
    setStatus(res.ok ? "Scheduler run completed" : "Scheduler run failed");
    if (res.ok) setLastRun(new Date().toISOString());
  };

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="mb-8">
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-400"
            onClick={handleBack}
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft />
          </Button>
          <h1 className="text-3xl font-semibold mt-2">Run Scheduler</h1>
          <p className="text-zinc-400 mt-2">
            Manually trigger a scheduling pass. The app still runs automatically every 5 minutes.
          </p>
        </div>

        {!api.isAvailable() && (
          <Alert variant="warning" className="mb-6">
            IPC not available in browser preview. Run the Electron app to trigger scheduling.
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Scheduler</CardTitle>
            <CardDescription>
              Last run: {lastRun ? new Date(lastRun).toLocaleString() : "Unknown"}
              {nextRun ? `  Next: ${new Date(nextRun).toLocaleTimeString()}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={runNow} disabled={!api.isAvailable()}>
              Run scheduler now
            </Button>
            {status && <p className="text-sm text-amber mt-4">{status}</p>}
            {lastError && (
              <p className="text-sm text-danger mt-2">Last error: {lastError}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
