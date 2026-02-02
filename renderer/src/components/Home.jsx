import React from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card.jsx";
import { buttonVariants } from "./ui/button.jsx";
import { cn } from "../lib/utils.js";

const cards = [
  {
    title: "Configuration",
    description: "Life blocks and scheduling preferences.",
    route: "/?page=config",
  },
  {
    title: "Daemon Control",
    description: "Replace legacy daemons and view status.",
    route: "/?page=daemons",
  },
  {
    title: "Run Scheduler",
    description: "Manually trigger a scheduling pass.",
    route: "/?page=scheduler",
  },
];

export default function Home() {
  const handleNavigate = (event, route) => {
    event.preventDefault();
    window.history.pushState({}, "", route);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.3em] text-amber">Todoist Scheduler</p>
          <h1 className="text-4xl font-semibold">Control Center</h1>
          <p className="text-zinc-400 mt-2">
            This Electron app replaces the Python daemons and runs scheduling locally.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card) => (
            <Card key={card.title} className="hover:border-accent transition">
              <CardHeader>
                <CardTitle>{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardFooter>
                <a
                  href={card.route}
                  className={cn(buttonVariants({ variant: "secondary" }))}
                  onClick={(event) => handleNavigate(event, card.route)}
                >
                  Open
                </a>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
