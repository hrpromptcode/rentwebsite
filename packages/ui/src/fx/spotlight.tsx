"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/** Radial spotlight that follows the pointer inside its container (midnight preset). */
export function Spotlight({ className, color = "var(--primary)" }: { className?: string; color?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect();
      el.style.setProperty("--sx", `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty("--sy", `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    parent.addEventListener("pointermove", onMove, { passive: true });
    return () => parent.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 transition-opacity duration-500", className)}
      style={{
        background: `radial-gradient(600px circle at var(--sx, 50%) var(--sy, 30%), color-mix(in oklab, ${color} 22%, transparent), transparent 70%)`,
      }}
    />
  );
}
