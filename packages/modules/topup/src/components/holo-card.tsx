"use client";

import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Holographic tilt wrapper (GameHub cards): on a fine pointer with motion allowed it writes the tilt / foil / parallax
 * CSS variables (`--rx --ry --px --py --dx --dy`) on its own element — no React state, one rAF per move. Children use
 * `.tp-foil` (holo sheen) and `.tp-cover > img` (counter-parallax). Touch, coarse pointers and reduced motion get the
 * static card.
 */
export function HoloCard({ children, className, max = 7, as = "div", style }: { children: React.ReactNode; className?: string; max?: number; as?: "div" | "li" | "article"; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLElement>(null);
  const raf = React.useRef(0);
  const ok = React.useRef(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    const set = () => (ok.current = mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => {
      mq.removeEventListener("change", set);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!ok.current || e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      el.style.setProperty("--rx", `${((0.5 - y) * max * 2).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((x - 0.5) * max * 2).toFixed(2)}deg`);
      el.style.setProperty("--px", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--py", `${(y * 100).toFixed(1)}%`);
      el.style.setProperty("--dx", (x - 0.5).toFixed(3));
      el.style.setProperty("--dy", (y - 0.5).toFixed(3));
      el.dataset.active = "";
    });
  };
  const onLeave = (e: React.PointerEvent<HTMLElement>) => {
    cancelAnimationFrame(raf.current);
    const el = e.currentTarget;
    delete el.dataset.active;
    for (const k of ["--rx", "--ry", "--dx", "--dy"]) el.style.removeProperty(k);
  };

  const Tag = as as React.ElementType;
  return (
    <Tag ref={ref} className={cn("tp-holo", className)} style={style} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </Tag>
  );
}
