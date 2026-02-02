import React, { useEffect, useMemo, useState } from "react";
import LifeBlocks from "./components/LifeBlocks.jsx";
import Overlay from "./components/Overlay.jsx";
import Home from "./components/Home.jsx";
import DaemonConfig from "./components/DaemonConfig.jsx";
import SchedulerControl from "./components/SchedulerControl.jsx";

function getRoute() {
  const hash = window.location.hash || "";
  if (hash.startsWith("#/overlay")) return "overlay";
  return "home";
}

export default function App() {
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const page = useMemo(() => {
    if (route === "overlay") return <Overlay />;
    if (route === "config") return <LifeBlocks />;
    if (route === "daemons") return <DaemonConfig />;
    if (route === "scheduler") return <SchedulerControl />;
    return <Home />;
  }, [route]);

  return <div className="min-h-screen bg-ink text-white">{page}</div>;
}
