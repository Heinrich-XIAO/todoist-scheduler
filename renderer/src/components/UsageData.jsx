import React, { useEffect, useMemo, useState } from "react";
import api from "../bridge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Alert } from "./ui/alert.jsx";
import { ArrowLeft } from "./ui/icons.jsx";

function formatSeconds(total) {
  if (!total || total <= 0) return "0m";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatEventLabel(type) {
  return String(type)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function UsageData() {
  const [dashboard, setDashboard] = useState({
    time: { today_seconds: 0, last7_seconds: 0, last30_seconds: 0 },
    counts: { all_time: {}, last7: {}, last30: {} },
    top_tasks: [],
    recent_events: [],
  });

  const handleBack = (event) => {
    event.preventDefault();
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  useEffect(() => {
    api.getUsageDashboard().then((data) => {
      if (data?.time) setDashboard(data);
    });
  }, []);

  const countEntries = useMemo(() => {
    const all = dashboard.counts?.all_time || {};
    return Object.entries(all)
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value);
  }, [dashboard]);

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="max-w-5xl mx-auto px-8 py-12">
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
          <h1 className="text-3xl font-semibold mt-2">My Data</h1>
          <p className="text-zinc-400 mt-2">Local usage and time stats stored on this device.</p>
        </div>

        {!api.isAvailable() && (
          <Alert variant="warning" className="mb-6">
            IPC not available in browser preview. Run the Electron app to view your data.
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Time</CardTitle>
              <CardDescription>Tracked focus time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Today</span>
                <span className="text-sm font-semibold">
                  {formatSeconds(dashboard.time?.today_seconds)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Last 7 days</span>
                <span className="text-sm font-semibold">
                  {formatSeconds(dashboard.time?.last7_seconds)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Last 30 days</span>
                <span className="text-sm font-semibold">
                  {formatSeconds(dashboard.time?.last30_seconds)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Tasks</CardTitle>
              <CardDescription>Most time spent recently.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard.top_tasks?.length ? (
                dashboard.top_tasks.map((task) => (
                  <div key={task.task_id} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-200 truncate max-w-[220px]">
                      {task.task_name || "Untitled"}
                    </span>
                    <span className="text-sm text-zinc-400">
                      {formatSeconds(task.total_seconds)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-400">No task time recorded yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Event Counts</CardTitle>
              <CardDescription>All-time usage events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {countEntries.length ? (
                countEntries.slice(0, 8).map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-200">
                      {formatEventLabel(entry.key)}
                    </span>
                    <span className="text-sm text-zinc-400">{entry.value}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-400">No events captured yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
            <CardDescription>Latest usage actions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[360px] overflow-auto">
              {dashboard.recent_events?.length ? (
                dashboard.recent_events.map((event, index) => (
                  <div
                    key={`${event.type}-${event.at}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{formatEventLabel(event.type)}</div>
                      <div className="text-xs text-zinc-400">
                        {event.task_name || event.task_id || ""}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {event.at ? new Date(event.at).toLocaleString() : ""}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-400">No recent events yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
