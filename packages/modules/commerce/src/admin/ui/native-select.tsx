import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

/** Styled native <select>: works inside GET filter forms and plain server-action forms (no client JS needed). */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={cn("relative block", className)}>
      <select
        {...props}
        className={cn(
          "h-11 w-full appearance-none rounded-md border border-input bg-background pl-3.5 pr-9 text-base shadow-xs outline-none transition-[color,box-shadow] md:text-sm",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </span>
  );
}
