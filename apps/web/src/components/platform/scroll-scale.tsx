"use client";

import * as React from "react";
import { useScrollEffect } from "@rentweb/ui/motion";

/**
 * Scales its child from `from` → 1 while it travels from the bottom of the viewport to `end` (fraction of the
 * viewport height from the top). Vyre's "WORKS ©21—26" title. Transform only (no layout shift); static under
 * reduced motion.
 */
export function ScrollScale({ children, from = 0.6, end = 0.35, origin = "50% 100%", className }: { children: React.ReactNode; from?: number; end?: number; origin?: string; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const p = React.useRef(1);
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => {
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  useScrollEffect(
    ref,
    {
      read: () => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const t = (vh - r.top) / (vh * (1 - end));
        p.current = t < 0 ? 0 : t > 1 ? 1 : t;
      },
      write: () => {
        const el = ref.current?.firstElementChild as HTMLElement | null;
        if (!el) return;
        const e = 1 - Math.pow(1 - p.current, 3);
        el.style.transform = `scale(${(from + (1 - from) * e).toFixed(4)})`;
      },
    },
    { enabled },
  );
  return (
    <div ref={ref} className={className}>
      <div style={{ transformOrigin: origin, willChange: enabled ? "transform" : undefined }}>{children}</div>
    </div>
  );
}
