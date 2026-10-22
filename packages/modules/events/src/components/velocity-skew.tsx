"use client";

import * as React from "react";

/**
 * Writes `--ev-skew` (deg, ≤ max) on its element from the page's scroll velocity — the filmstrip leans into fast scrolls
 * and settles back. Expressive motion level + fine/desktop + motion allowed only; one rAF loop while on screen, no React
 * state. Children opt in with `.ev-skew`.
 */
export function VelocitySkew({ children, className, max = 6 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = document.documentElement;
    const ok = () => html.dataset.motion === "expressive" && window.matchMedia("(min-width: 768px) and (prefers-reduced-motion: no-preference)").matches;
    if (!ok()) return;
    let raf = 0;
    let last = window.scrollY;
    let v = 0;
    let visible = false;
    const loop = () => {
      const y = window.scrollY;
      const dy = y - last;
      last = y;
      v += (dy - v) * 0.12;
      const deg = Math.max(-max, Math.min(max, v * -0.12));
      el.style.setProperty("--ev-skew", `${deg.toFixed(2)}deg`);
      if (visible || Math.abs(v) > 0.05) raf = requestAnimationFrame(loop);
      else el.style.setProperty("--ev-skew", "0deg");
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) {
        last = window.scrollY;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [max]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
