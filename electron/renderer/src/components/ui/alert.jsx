import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

const alertVariants = cva(
  "relative w-full rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-200",
  {
    variants: {
      variant: {
        default: "bg-zinc-900",
        warning: "border-amber/30 text-amber bg-zinc-900/70",
        danger: "border-danger/40 text-danger bg-zinc-900/70",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn("mb-1 font-medium leading-none", className)} {...props} />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm text-zinc-400", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
