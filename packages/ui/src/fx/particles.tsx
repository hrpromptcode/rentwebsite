"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Lightweight 2D canvas particle field with connecting lines. ~120 particles on desktop, 50 on mobile.
 * Pauses when off-screen or when the user prefers reduced motion.
 */
export function Particles({ className, density = 1, connect = true }: { className?: string; density?: number; connect?: boolean }) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduce = mq.matches;
    const onMq = (e: MediaQueryListEvent) => (reduce = e.matches);
    mq.addEventListener("change", onMq);

    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let visible = true;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const style = getComputedStyle(canvas);
    const color = style.getPropertyValue("--primary").trim() || "#8b5cf6";
    const accent = style.getPropertyValue("--accent").trim() || "#22d3ee";

    type P = { x: number; y: number; vx: number; vy: number; r: number; c: string };
    let ps: P[] = [];

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.floor((w < 640 ? 50 : 120) * density);
      ps = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.8 + 0.6,
        c: Math.random() > 0.7 ? accent : color,
      }));
    };

    const step = () => {
      if (!visible) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        if (!reduce) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = 0.75;
        ctx.fill();
      }
      if (connect) {
        ctx.globalAlpha = 1;
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            const a = ps[i]!;
            const b = ps[j]!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 120 * 120) {
              ctx.strokeStyle = color;
              ctx.globalAlpha = (1 - Math.sqrt(d2) / 120) * 0.18;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) raf = requestAnimationFrame(step);
      else cancelAnimationFrame(raf);
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) step();
    });
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      mq.removeEventListener("change", onMq);
    };
  }, [density, connect]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}
