"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import type { Script } from "./split";
import { clamp01, useScrollEffect, viewportHeight } from "./scroll-loop";

export function ScrubTextClient({
  parts,
  script,
  as = "p",
  className,
  start = 0.85,
  end = 0.3,
}: {
  parts: string[];
  script: Script;
  as?: "p" | "h2" | "h3" | "blockquote" | "div";
  className?: string;
  start?: number;
  end?: number;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const Tag = as as React.ElementType;
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (ref.current) ref.current.dataset.scrub = reduce ? "off" : "on";
    setOn(!reduce);
  }, []);
  const p = React.useRef(0);
  useScrollEffect(
    ref,
    {
      read: () => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vh = viewportHeight();
        // 0 when the block's top reaches `start`·vh, 1 when its bottom reaches `end`·vh
        const from = vh * start;
        const to = vh * end - r.height;
        p.current = clamp01((from - r.top) / Math.max(1, from - to));
      },
      write: () => ref.current?.style.setProperty("--p", p.current.toFixed(4)),
    },
    { enabled: on, margin: "10% 0px" },
  );
  let i = 0;
  let n = 0;
  for (const part of parts) if (!/^\s+$/.test(part)) n++;
  return (
    <Tag ref={ref} className={cn("rw-scrub", className)} data-scrub="ssr" data-script={script} style={{ "--n": n } as React.CSSProperties}>
      {parts.map((part, k) =>
        /^\s+$/.test(part) ? (
          part
        ) : (
          <span key={k} data-scrub-w="" style={{ "--i": i++ } as React.CSSProperties}>
            {part}
          </span>
        ),
      )}
    </Tag>
  );
}
