"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface LiveClockProps {
  /** IANA time zone */
  tz?: string;
  /** city label before the time ("" to hide) */
  label?: string;
  seconds?: boolean;
  hour12?: boolean;
  className?: string;
  /** small dot that blinks every second */
  pulse?: boolean;
}

const THAI = /[฀-๿]/;

/**
 * Studio-style live clock (§3.2): "กรุงเทพฯ 23:10". Hydration-safe — the server and the first client render show
 * "--:--"; the time fills in after mount and updates on the minute (or second). Mono font via `.mono-label`.
 */
export function LiveClock({ tz = "Asia/Bangkok", label = "กรุงเทพฯ", seconds = false, hour12 = false, className, pulse = true }: LiveClockProps) {
  const [time, setTime] = React.useState<string | null>(null);
  const [iso, setIso] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    let fmt: Intl.DateTimeFormat;
    try {
      fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12, timeZone: tz });
    } catch {
      fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12 });
    }
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const now = new Date();
      setTime(fmt.format(now));
      setIso(now.toISOString());
      const step = seconds ? 1000 : 60_000;
      timer = setTimeout(update, step - (now.getTime() % step) + 15);
    };
    update();
    return () => clearTimeout(timer);
  }, [tz, seconds, hour12]);
  return (
    <span className={cn("mono-label rw-clock", className)} data-script={label && THAI.test(label) ? "thai" : "latin"}>
      {pulse ? <span data-clock-dot="" aria-hidden="true" /> : null}
      {label ? <span data-clock-label="">{label}</span> : null}
      <time dateTime={iso} suppressHydrationWarning>
        {time ?? (seconds ? "--:--:--" : "--:--")}
      </time>
    </span>
  );
}
