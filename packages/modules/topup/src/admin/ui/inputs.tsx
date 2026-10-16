"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@rentweb/ui/components/input";
import { cn } from "@rentweb/ui/lib/utils";

/** Styled native <select>: works inside GET filter forms and plain server-action forms. */
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

/** Baht text input (string state, converted to satang with bahtToSatang on submit). */
export function MoneyInput({ className, invalid, ...props }: Omit<React.ComponentProps<typeof Input>, "type"> & { invalid?: boolean }) {
  return (
    <span className={cn("relative block", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">฿</span>
      <Input type="text" inputMode="decimal" autoComplete="off" aria-invalid={invalid || undefined} {...props} className="pl-7 text-right tabular-nums" />
    </span>
  );
}
