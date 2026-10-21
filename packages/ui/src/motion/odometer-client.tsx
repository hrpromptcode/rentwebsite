"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { useEnterOnce } from "./prefs";

export interface OdometerClientProps {
  /** formatted value (server-formatted, e.g. "1,250") */
  formatted: string;
  prefix?: string;
  suffix?: string;
  /** seconds */
  duration?: number;
  trigger?: "inView" | "mount";
  className?: string;
}

/**
 * Rolling digit columns. Each digit is a 0–9 ×2 strip drawn with CSS generated content (no DOM text), so the only text
 * in the DOM is the sr-only final value — screen readers, textContent and getByText see "1,250" exactly once.
 */
export function OdometerClient({ formatted, prefix, suffix, duration = 1.6, trigger = "inView", className }: OdometerClientProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const roll = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => requestAnimationFrame(() => (el.dataset.state = "in")));
  }, []);
  useEnterOnce(ref, roll, { enabled: trigger === "inView" });
  React.useEffect(() => {
    if (trigger === "mount") roll();
  }, [trigger, roll]);

  const chars = Array.from(formatted);
  const digitCount = chars.filter((c) => c >= "0" && c <= "9").length;
  let col = 0;
  return (
    <span ref={ref} className={cn("rw-odo", className)} data-odo="" data-state="idle" style={{ "--odo-dur": `${Math.round(duration * 1000)}ms`, "--odo-n": digitCount } as React.CSSProperties}>
      <span className="sr-only">{`${prefix ?? ""}${formatted}${suffix ?? ""}`}</span>
      <span data-odo-vis="" aria-hidden="true">
        {prefix ? <span data-odo-fix="" data-pt={prefix} /> : null}
        {chars.map((c, k) =>
          c >= "0" && c <= "9" ? (
            <span key={k} data-odo-col="" style={{ "--d": Number(c), "--i": col++ } as React.CSSProperties}>
              <span data-odo-strip="" />
            </span>
          ) : (
            <span key={k} data-odo-sep="" data-pt={c} />
          ),
        )}
        {suffix ? <span data-odo-fix="" data-pt={suffix} /> : null}
      </span>
    </span>
  );
}
