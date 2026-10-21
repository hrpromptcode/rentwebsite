import * as React from "react";
import { OdometerClient } from "./odometer-client";

export interface OdometerProps {
  /** a number (formatted with `locale`) or a pre-formatted string such as "129" / "4.9" */
  value: number | string;
  locale?: string;
  prefix?: string;
  suffix?: string;
  /** fraction digits for numbers (default 0) */
  decimals?: number;
  /** seconds */
  duration?: number;
  trigger?: "inView" | "mount";
  className?: string;
}

/**
 * Odometer (§3.2): rolling digit columns with tabular numerals; separators static; the final value is in the SSR HTML
 * (sr-only) and visible without JS / under reduced motion. Formatting happens here on the server (no Intl drift
 * between Node and the browser). MARKETING STATS ONLY — never totals, prices or balances on operational pages
 * (journeys read those as text; use plain text there).
 */
export function Odometer({ value, locale = "th-TH", decimals, prefix, suffix, duration, trigger, className }: OdometerProps) {
  const formatted =
    typeof value === "number"
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: decimals ?? 0, minimumFractionDigits: decimals ?? 0 }).format(value)
      : String(value);
  return <OdometerClient formatted={formatted} prefix={prefix} suffix={suffix} duration={duration} trigger={trigger} className={className} />;
}
