"use client";

import * as React from "react";
import { Input } from "@rentweb/ui/components/input";
import { cn } from "@rentweb/ui/lib/utils";

/** Baht text input (string state, converted to satang with bahtToSatang on submit). */
export function MoneyInput({ className, invalid, ...props }: Omit<React.ComponentProps<typeof Input>, "type"> & { invalid?: boolean }) {
  return (
    <span className={cn("relative block", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">฿</span>
      <Input type="text" inputMode="decimal" autoComplete="off" aria-invalid={invalid || undefined} {...props} className="pl-7 text-right tabular-nums" />
    </span>
  );
}
