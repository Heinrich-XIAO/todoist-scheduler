import React, { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "./button.jsx";
import { Calendar as CalendarIcon } from "./icons.jsx";
import { cn } from "../../lib/utils.js";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const toIsoDate = (date) => {
  if (!(date instanceof Date)) {
    return null;
  }
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
};

const parseIsoDate = (value) => {
  if (!value) {
    return null;
  }
  const segments = value.split("-");
  if (segments.length !== 3) {
    return null;
  }
  const [year, month, day] = segments.map(Number);
  if ([year, month, day].some((segment) => Number.isNaN(segment))) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const formatDisplayDate = (value) => {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return "";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const buildCalendarCells = (monthStart) => {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const offset = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < offset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
};

const DatePicker = React.forwardRef(
  ({ value, onChange, className, disabled, ...props }, ref) => {
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);

    const parsedValue = parseIsoDate(value);
    const selectedKey = parsedValue ? toIsoDate(parsedValue) : null;
    const todayKey = toIsoDate(new Date());

    const [visibleMonth, setVisibleMonth] = useState(() => {
      const base = parsedValue || new Date();
      return new Date(base.getFullYear(), base.getMonth(), 1);
    });

    useEffect(() => {
      if (parsedValue) {
        setVisibleMonth(
          new Date(parsedValue.getFullYear(), parsedValue.getMonth(), 1)
        );
      }
    }, [value, parsedValue]);

    const weeks = useMemo(() => buildCalendarCells(visibleMonth), [
      visibleMonth,
    ]);

    useEffect(() => {
      if (!isOpen) {
        return undefined;
      }
      const handleClickOutside = (event) => {
        if (
          panelRef.current &&
          triggerRef.current &&
          !panelRef.current.contains(event.target) &&
          !triggerRef.current.contains(event.target)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    useEffect(() => {
      const handleEscape = (event) => {
        if (event.key === "Escape") {
          setIsOpen(false);
        }
      };
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, []);

    const displayLabel = formatDisplayDate(value) || "Pick a date";
    const monthLabel = visibleMonth.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const handleSelect = (date) => {
      if (!date) {
        return;
      }
      const iso = toIsoDate(date);
      onChange?.(iso);
      setIsOpen(false);
    };

    const goToPreviousMonth = () =>
      setVisibleMonth(
        (prev) =>
          new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
      );

    const goToNextMonth = () =>
      setVisibleMonth(
        (prev) =>
          new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
      );

    const dayClasses = (day) => {
      const base =
        "flex aspect-square w-10 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink";
      if (!day) {
        return `${base} opacity-0`;
      }
      const iso = toIsoDate(day);
      const selected = iso === selectedKey;
      const today = iso === todayKey;
      return cn(
        base,
        selected && "bg-amber text-zinc-950",
        !selected && today && "text-amber",
        !selected && !today && "text-zinc-200 hover:bg-zinc-900"
      );
    };

    return (
      <div className="relative w-full" {...props}>
        <div className="relative">
          <Button
            ref={(element) => {
              triggerRef.current = element;
              if (typeof ref === "function") {
                ref(element);
              } else if (ref) {
                ref.current = element;
              }
            }}
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-between text-left",
              className,
              disabled && "cursor-not-allowed opacity-70"
            )}
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            disabled={disabled}
          >
            <span
              className={cn(
                "text-sm",
                displayLabel === "Pick a date" ? "text-zinc-500" : "text-white"
              )}
            >
              {displayLabel}
            </span>
            <CalendarIcon className="h-5 w-5 text-zinc-400" />
          </Button>
        </div>
        {isOpen && !disabled && (
          <div
            ref={panelRef}
            className="absolute left-0 top-full z-50 mt-2 w-[280px] rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between text-sm font-semibold text-white">
              <button
                type="button"
                onClick={goToPreviousMonth}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:border-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                &lt;
              </button>
              <div className="text-sm font-semibold text-white">{monthLabel}</div>
              <button
                type="button"
                onClick={goToNextMonth}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:border-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                &gt;
              </button>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1 text-[0.7rem] uppercase tracking-[0.3em] text-zinc-500">
              {WEEKDAYS.map((day) => (
                <div key={day} className="flex h-10 items-center justify-center">
                  {day}
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-1">
              {weeks.map((week, index) => (
                <div key={index} className="flex justify-between gap-1">
                  {week.map((day, dayIndex) => (
                    <button
                      key={dayIndex}
                      type="button"
                      onClick={() => handleSelect(day)}
                      className={dayClasses(day)}
                      disabled={!day}
                    >
                      {day?.getDate() ?? ""}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

DatePicker.displayName = "DatePicker";

export { DatePicker };
