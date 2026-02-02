import * as React from "react";
import { cn } from "../../lib/utils.js";

const TabsContext = React.createContext(null);

function Tabs({ defaultValue, value, onValueChange, children }) {
  const [internal, setInternal] = React.useState(defaultValue);
  const current = value ?? internal;
  const setValue = (val) => {
    setInternal(val);
    onValueChange?.(val);
  };
  return (
    <TabsContext.Provider value={{ value: current, setValue }}>
      <div>{children}</div>
    </TabsContext.Provider>
  );
}

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("inline-flex h-10 items-center gap-2 rounded-md bg-zinc-900 p-1", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef(({ className, value, ...props }, ref) => {
  const ctx = React.useContext(TabsContext);
  const active = ctx?.value === value;
  return (
    <button
      ref={ref}
      onClick={() => ctx?.setValue(value)}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md transition",
        active ? "bg-accent text-white" : "text-zinc-400 hover:text-white",
        className
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef(({ className, value, ...props }, ref) => {
  const ctx = React.useContext(TabsContext);
  if (ctx?.value !== value) return null;
  return <div ref={ref} className={cn("mt-4", className)} {...props} />;
});
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
