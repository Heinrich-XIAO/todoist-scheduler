import * as React from "react";
import { cn } from "../../lib/utils.js";

const Switch = React.forwardRef(({ className, checked, onCheckedChange, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onCheckedChange?.(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50",
      checked ? "bg-accent" : "bg-zinc-700",
      className
    )}
    {...props}
  >
    <span
      className={cn(
        "inline-block h-4 w-4 transform rounded-full bg-white transition",
        checked ? "translate-x-6" : "translate-x-1"
      )}
    />
  </button>
));
Switch.displayName = "Switch";

export { Switch };
