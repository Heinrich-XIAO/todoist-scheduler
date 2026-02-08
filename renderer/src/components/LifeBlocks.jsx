import React, { useEffect, useMemo, useState } from "react";
import api from "../bridge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { DatePicker } from "./ui/date-picker.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.jsx";
import { Alert } from "./ui/alert.jsx";
import { Badge } from "./ui/badge.jsx";
import { Trash } from "./ui/icons.jsx";
import { ArrowLeft } from "./ui/icons.jsx";
import { toast } from "sonner";

const DAYS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
];

const DAY_LABELS = DAYS.reduce((acc, day) => {
  acc[day.key] = day.label;
  return acc;
}, {});

const getTodayDate = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().split("T")[0];
};

export default function LifeBlocks() {
  const [state, setState] = useState({ one_off: [], weekly: [] });
  const [type, setType] = useState("one_off");
  const [date, setDate] = useState(() => getTodayDate());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState({
    mon: false,
    tue: false,
    wed: false,
    thu: false,
    fri: false,
    sat: false,
    sun: false,
  });
  const [available, setAvailable] = useState(false);

  const handleBack = (event) => {
    event.preventDefault();
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  useEffect(() => {
    setAvailable(api.isAvailable());
    api.getLifeBlocks().then((data) => setState(data));
  }, []);

  const list = useMemo(() => {
    const entries = [];
    state.one_off.forEach((block, index) => {
      entries.push({
        kind: "one_off",
        index,
        text: `One-off ${block.date} ${block.start}-${block.end}${block.label ? ` (${block.label})` : ""}`,
      });
    });
    state.weekly.forEach((block, index) => {
      const dayText = (block.days || [])
        .map((day) => DAY_LABELS[day] || day)
        .join(",");
      entries.push({
        kind: "weekly",
        index,
        text: `Weekly ${dayText} ${block.start}-${block.end}${block.label ? ` (${block.label})` : ""}`,
      });
    });
    return entries;
  }, [state]);

  const saveState = async (next) => {
    setState(next);
    await api.saveLifeBlocks(next);
  };

  const onAdd = async () => {
    if (!start || !end) {
      toast.warning("Start and end time required.");
      return;
    }
    if (type === "one_off" && !date) {
      toast.warning("Date required for one-off blocks.");
      return;
    }
    if (type === "weekly" && !Object.values(days).some(Boolean)) {
      toast.warning("Pick at least one weekday.");
      return;
    }

    const next = { ...state };
    if (type === "one_off") {
      next.one_off = [
        ...next.one_off,
        { date, start, end, label: label.trim() },
      ];
    } else {
      const selected = DAYS.filter((d) => days[d.key]).map((d) => d.key);
      next.weekly = [
        ...next.weekly,
        { days: selected, start, end, label: label.trim() },
      ];
    }
    await saveState(next);
    setStart("");
    setEnd("");
    setLabel("");
    setDate(getTodayDate());
  };

  const onDelete = async (entry) => {
    const next = { ...state };
    next[entry.kind] = next[entry.kind].filter((_, idx) => idx !== entry.index);
    await saveState(next);
  };

  return (
    <div className="min-h-screen bg-ink text-white" data-testid="page-life-blocks">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
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
            <p className="text-sm uppercase tracking-[0.3em] text-amber">Life Blocks</p>
            <h1 className="text-3xl font-semibold">Protect your time</h1>
          </div>
          <div className="text-sm text-zinc-400">Data stored in data/life_blocks.json</div>
        </div>

        {!available && (
          <Alert variant="warning" className="mb-6">
            IPC not available in browser preview. Run the Electron app to save life blocks.
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Existing blocks</CardTitle>
              <CardDescription>These windows are protected from scheduling.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[400px] overflow-auto">
                {list.length === 0 && (
                  <p className="text-sm text-zinc-400">No life blocks yet.</p>
                )}
                {list.map((entry) => (
                  <div
                    key={`${entry.kind}-${entry.index}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                  >
                    <div className="text-sm">{entry.text}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(entry)}
                      aria-label="Delete block"
                      title="Delete"
                    >
                      <Trash />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add a block</CardTitle>
              <CardDescription>One-off or weekly recurring blocks.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="one_off" value={type} onValueChange={setType}>
                <TabsList>
                  <TabsTrigger value="one_off">One-off</TabsTrigger>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                </TabsList>
                <TabsContent value="one_off">
                  <div className="space-y-4">
                    <div>
                      <Label>Date</Label>
                      <DatePicker
                        value={date}
                        onChange={setDate}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="weekly">
                  <div className="space-y-4">
                    <div>
                      <Label>Days</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {DAYS.map((day) => (
                          <Badge
                            key={day.key}
                            variant={days[day.key] ? "default" : "secondary"}
                            className="cursor-pointer rounded-full w-9 h-9 px-0 justify-center text-sm"
                            onClick={() =>
                              setDays({ ...days, [day.key]: !days[day.key] })
                            }
                          >
                            {day.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <Label>Start</Label>
                  <Input
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    placeholder="HH:MM"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End</Label>
                  <Input
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    placeholder="HH:MM"
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="mt-4">
                <Label>Label (optional)</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Sleep, Gym, Commute"
                  className="mt-2"
                />
              </div>

              <Button
                onClick={onAdd}
                className="mt-5 w-full"
                disabled={!available}
              >
                Add block
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
