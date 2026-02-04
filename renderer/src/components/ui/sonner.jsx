import React from "react";
import { Toaster as Sonner } from "sonner";
import { cn } from "../../lib/utils.js";

export function Toaster({ className, ...props }) {
  return (
    <Sonner
      className={cn("toaster group", className)}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-zinc-900/95 group-[.toaster]:text-zinc-100 group-[.toaster]:border-zinc-800 group-[.toaster]:shadow-xl",
          description: "group-[.toast]:text-zinc-300",
          actionButton:
            "group-[.toast]:bg-emerald-500 group-[.toast]:text-emerald-950",
          cancelButton:
            "group-[.toast]:bg-zinc-800 group-[.toast]:text-zinc-200",
        },
      }}
      {...props}
    />
  );
}
