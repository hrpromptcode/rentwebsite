"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface MagneticProps {
  children: React.ReactNode;
  /** pull factor of the pointer offset from the centre */
  strength?: number;
  /** max pull in px */
  max?: number;
  /** a descendant marked `data-magnetic-inner` moves this much more (parallax label) */
  inner?: number;
  className?: string;
  as?: "span" | "div";
}

/**
 * Magnetic hover (§2.5): the wrapper eases toward the pointer (≤ `max` px), an optional `[data-magnetic-inner]` child
 * moves `inner`× for a parallax label. Fine pointers only; disabled inside forms and under reduced motion. The
 * transform is on this wrapper span (never the button itself) and follows the pointer, so a pointer resting at the
 * centre (what automation does before clicking) produces no offset.
 */
export function Magnetic({ children, strength = 0.35, max = 10, inner = 1.4, className, as = "span" }: MagneticProps) {
  const ref = React.useRef<HTMLElement>(null);
  const Tag = as as React.ElementType;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.closest("form")) return;
    const innerEl = el.querySelector<HTMLElement>("[data-magnetic-inner]");
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const loop = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      if (Math.abs(tx - x) < 0.05 && Math.abs(ty - y) < 0.05) {
        x = tx;
        y = ty;
      }
      el.style.transform = x || y ? `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)` : "";
      if (innerEl) innerEl.style.transform = x || y ? `translate3d(${(x * (inner - 1)).toFixed(2)}px,${(y * (inner - 1)).toFixed(2)}px,0)` : "";
      raf = x !== tx || y !== ty ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * strength;
      const dy = (e.clientY - (r.top + r.height / 2)) * strength;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      tx = dx * k;
      ty = dy * k;
      kick();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      kick();
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.style.transform = "";
      if (innerEl) innerEl.style.transform = "";
    };
  }, [strength, max, inner]);

  return (
    <Tag ref={ref} className={cn("rw-magnetic", className)} data-magnetic="">
      {children}
    </Tag>
  );
}
