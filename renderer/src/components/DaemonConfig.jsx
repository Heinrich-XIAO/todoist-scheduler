import React, { useEffect, useState } from "react";
import api from "../bridge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Alert } from "./ui/alert.jsx";
import { Badge } from "./ui/badge.jsx";
import { Switch } from "./ui/switch.jsx";
import { ArrowLeft } from "./ui/icons.jsx";
import { toast } from "sonner";

export default function DaemonConfig() {
  const [status, setStatus] = useState({ pids: [] });
  const [autostart, setAutostart] = useState(false);

  const handleBack = (event) => {
    event.preventDefault();
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const loadStatus = async () => {
    const res = await api.getLegacyDaemonStatus();
    setStatus(res);
    const auto = await api.getAutostartStatus();
    setAutostart(Boolean(auto.installed));
  };

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 5000);
    return () => clearInterval(id);
  }, []);

  const stopLegacy = async () => {
    const res = await api.stopLegacyDaemon();
    setStatus(res);
    toast.success("Legacy daemon stopped.");
  };

  const toggleAutostart = async (enabled) => {
    const res = enabled ? await api.enableAutostart() : await api.disableAutostart();
    setAutostart(Boolean(res.installed));
  };

  const running = status.pids.length > 0;

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
          <h1 className="text-3xl font-semibold mt-2">Daemon Control</h1>
          <p className="text-zinc-400 mt-2">
            This app replaces the legacy Python LaunchAgent and disables it on startup.
          </p>
        </div>

        {!api.isAvailable() && (
          <Alert variant="warning" className="mb-6">
            IPC not available in browser preview. Run the Electron app to control daemons.
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Legacy daemon</CardTitle>
            <CardDescription>Python LaunchAgent status.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant={running ? "default" : "secondary"}>
                    {running ? "Running" : "Stopped"}
                  </Badge>
                  {running && (
                    <span className="text-sm text-zinc-400">PIDs: {status.pids.join(", ")}</span>
                  )}
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={stopLegacy}
                disabled={!api.isAvailable()}
              >
                Stop legacy daemon
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Autostart</CardTitle>
            <CardDescription>Electron dev app LaunchAgent.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">
                  Launches `bun run dev` on login.
                </p>
              </div>
              <Switch
                checked={autostart}
                onCheckedChange={toggleAutostart}
                disabled={!api.isAvailable()}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
