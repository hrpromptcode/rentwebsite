"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { motionLevel } from "./prefs";
import { useScrollEffect, viewportHeight } from "./scroll-loop";

export interface ParallaxMediaProps {
  /** shift as a fraction of the frame height across the viewport pass (negative = against the scroll). Clamped so the
   *  scaled media never exposes an edge: |speed| ≤ (scale − 1) / 2, and ≤ 0.12. */
  speed?: number;
  /** media scale inside the frame (headroom for the shift) */
  scale?: number;
  children: React.ReactNode;
  className?: string;
  /** class for the moving inner layer */
  innerClassName?: string;
}

/**
 * Scroll-scrubbed media parallax inside an overflow-hidden frame (§3.2). Batched with every other scroll effect (one
 * layout read per frame), runs only near the viewport, off for reduced motion and the "subtle" motion level, halved for
 * "standard". No inline transform in the SSR HTML. `Parallax` (motion/react) stays available for old call sites.
 */
export function ParallaxMedia({ speed = -0.15, scale = 1.12, children, className, innerClassName }: ParallaxMediaProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inner = React.useRef<HTMLDivElement>(null);
  const amp = React.useRef(0);
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lvl = motionLevel();
    const max = Math.min(0.12, Math.max(0, (scale - 1) / 2));
    const a = reduce || lvl === "subtle" ? 0 : Math.sign(speed) * Math.min(Math.abs(speed), max) * (lvl === "standard" ? 0.6 : 1);
    amp.current = a;
    setOn(a !== 0);
  }, [speed, scale]);
  const y = React.useRef(0);
  useScrollEffect(
    ref,
    {
      read: () => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vh = viewportHeight();
        const p = Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2)));
        y.current = p * amp.current * r.height;
      },
      write: () => {
        if (inner.current) inner.current.style.transform = `translate3d(0,${y.current.toFixed(1)}px,0) scale(${scale})`;
      },
    },
    { enabled: on },
  );
  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)} data-parallax-media="">
      <div ref={inner} className={cn("size-full will-change-transform", innerClassName)} style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
