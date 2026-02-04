import React, { useEffect, useMemo, useState } from "react";
import LifeBlocks from "./components/LifeBlocks.jsx";
import Overlay from "./components/Overlay.jsx";
import Home from "./components/Home.jsx";
import DaemonConfig from "./components/DaemonConfig.jsx";
import SchedulerControl from "./components/SchedulerControl.jsx";
import UsageData from "./components/UsageData.jsx";
import TaskQueue from "./components/TaskQueue.jsx";
import QuickStart from "./components/QuickStart.jsx";
import { Toaster } from "./components/ui/sonner.jsx";

function getRoute() {
  const url = new URL(window.location.href);
  const page = url.searchParams.get("page") || "";
  if (page === "overlay") return "overlay";
  if (page === "config") return "config";
  if (page === "daemons") return "daemons";
  if (page === "scheduler") return "scheduler";
  if (page === "data") return "data";
  if (page === "queue") return "queue";
  if (page === "quick") return "quick";
  return "home";
}

export default function App() {
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    const onNavigate = () => setRoute(getRoute());
    window.addEventListener("popstate", onNavigate);
    return () => window.removeEventListener("popstate", onNavigate);
  }, []);

  const page = useMemo(() => {
    if (route === "overlay") return <Overlay />;
    if (route === "config") return <LifeBlocks />;
    if (route === "daemons") return <DaemonConfig />;
    if (route === "scheduler") return <SchedulerControl />;
    if (route === "data") return <UsageData />;
    if (route === "queue") return <TaskQueue />;
    if (route === "quick") return <QuickStart />;
    return <Home />;
  }, [route]);

  return (
    <>
      <div className="min-h-screen bg-ink text-white">{page}</div>
      <Toaster position="top-right" richColors />
    </>
  );
}
