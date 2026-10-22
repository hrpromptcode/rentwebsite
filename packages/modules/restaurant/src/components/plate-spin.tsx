"use client";

import * as React from "react";

/**
 * Plates arrive rotated (≤ 12°) and settle to 0° as they travel from the right edge to the middle of the viewport.
 * Works for the pinned horizontal track (translateX) and the native swipe row alike because it only reads each
 * plate's on-screen position. rAF runs only while the container is on screen; reduced motion → no work at all.
 */
export function PlateSpin({ children, className, max = 12 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (document.documentElement.dataset.motion === "subtle") return;
    const plates = Array.from(root.querySelectorAll<HTMLElement>("[data-plate]"));
    if (!plates.length) return;
    let raf = 0;
    let on = false;
    const last = new Map<HTMLElement, number>();
    const tick = () => {
      const vw = window.innerWidth;
      for (const el of plates) {
        const r = el.getBoundingClientRect();
        const c = r.left + r.width / 2;
        // 0 at / left of the viewport middle → 1 at the right edge (and beyond)
        const t = Math.max(0, Math.min(1, (c - vw * 0.5) / (vw * 0.5)));
        const deg = Math.round(max * t * 10) / 10;
        if (last.get(el) !== deg) {
          last.set(el, deg);
          el.style.setProperty("--spin", `${deg}deg`);
        }
      }
      if (on) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        on = !!e?.isIntersecting;
        cancelAnimationFrame(raf);
        if (on) raf = requestAnimationFrame(tick);
      },
      { rootMargin: "100px 0px" },
    );
    io.observe(root);
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
