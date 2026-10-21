"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { useScrollEffect } from "./scroll-loop";

/** Page scroll progress 0..1 (document). */
export function pageProgress(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

export interface ScrollProgressProps {
  /** bar: fixed 2px line at the top of the viewport · ring: inline circular ring (place it yourself) */
  variant?: "bar" | "ring";
  /** ring diameter (px) */
  size?: number;
  className?: string;
}

/** Thin page-scroll progress (§3.2), batched with the kit scroll loop, colours from --primary. Decorative. */
export function ScrollProgress({ variant = "bar", size = 44, className }: ScrollProgressProps) {
  const ref = React.useRef<HTMLElement | null>(null);
  const p = React.useRef(0);
  useScrollEffect(
    ref,
    {
      read: () => {
        p.current = pageProgress();
      },
      write: () => ref.current?.style.setProperty("--sp", p.current.toFixed(4)),
    },
    { always: true },
  );
  if (variant === "ring") {
    const r = 45;
    const c = 2 * Math.PI * r;
    return (
      <span ref={ref as React.RefObject<HTMLSpanElement>} className={cn("rw-scroll-ring", className)} data-scroll-progress="ring" aria-hidden="true" style={{ width: size, height: size, "--c": c.toFixed(2) } as React.CSSProperties}>
        <svg viewBox="0 0 100 100" width={size} height={size}>
          <circle cx="50" cy="50" r={r} data-track="" />
          <circle cx="50" cy="50" r={r} data-bar="" strokeDasharray={c.toFixed(2)} />
        </svg>
      </span>
    );
  }
  return <div ref={ref as React.RefObject<HTMLDivElement>} className={cn("rw-scroll-bar", className)} data-scroll-progress="bar" aria-hidden="true" />;
}
