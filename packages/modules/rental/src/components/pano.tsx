"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Inner-image parallax for horizontally moving panoramas: every `[data-pano]` image inside the root slides against
 * its frame by its distance from the viewport centre (±`strength` of the frame width). One rAF loop that runs only
 * while the root is on screen; transforms only (no React state); off under reduced motion.
 */
function usePanoParallax(root: React.RefObject<HTMLElement | null>, strength = 0.07) {
  React.useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let on = false;
    const items = () => Array.from(el.querySelectorAll<HTMLElement>("[data-pano]"));
    const tick = () => {
      const vw = window.innerWidth;
      for (const img of items()) {
        const frame = img.parentElement;
        if (!frame) continue;
        const r = frame.getBoundingClientRect();
        if (r.right < -vw * 0.2 || r.left > vw * 1.2) continue;
        const d = Math.max(-1.4, Math.min(1.4, (r.left + r.width / 2 - vw / 2) / vw));
        img.style.transform = `translate3d(${(-d * strength * r.width).toFixed(1)}px,0,0)`;
      }
      if (on) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      on = !!e?.isIntersecting;
      cancelAnimationFrame(raf);
      if (on) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      on = false;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [root, strength]);
}

export function PanoParallax({ children, className, strength }: { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  usePanoParallax(ref, strength);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Native horizontal filmstrip (scroll-snap) with mouse drag + inertia, inner-image parallax, a progress hairline and
 * 44px prev / next buttons. Touch uses the native swipe; keyboard focuses the region and scrolls with the arrows.
 */
export function Filmstrip({ children, label, className, prevLabel = "ภาพก่อนหน้า", nextLabel = "ภาพถัดไป" }: { children: React.ReactNode; label: string; className?: string; prevLabel?: string; nextLabel?: string }) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const barRef = React.useRef<HTMLSpanElement>(null);
  usePanoParallax(rowRef, 0.06);

  React.useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const onScroll = () => {
      const max = row.scrollWidth - row.clientWidth;
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.max(0.04, row.scrollLeft / max).toFixed(4) : "1"})`;
    };
    onScroll();
    row.addEventListener("scroll", onScroll, { passive: true });

    // mouse drag with inertia (touch keeps the native swipe)
    let down = false;
    let moved = 0;
    let lastX = 0;
    let v = 0;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true;
      moved = 0;
      lastX = e.clientX;
      v = 0;
      cancelAnimationFrame(raf);
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      if (moved > 4) row.dataset.dragging = "";
      row.scrollLeft -= dx;
      v = dx;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      delete row.dataset.dragging;
      if (reduce) return;
      const glide = () => {
        v *= 0.92;
        row.scrollLeft -= v;
        if (Math.abs(v) > 0.4) raf = requestAnimationFrame(glide);
      };
      raf = requestAnimationFrame(glide);
    };
    // a drag must not click the image link underneath
    const onClick = (e: MouseEvent) => {
      if (moved > 6) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    row.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    row.addEventListener("click", onClick, true);
    return () => {
      cancelAnimationFrame(raf);
      row.removeEventListener("scroll", onScroll);
      row.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      row.removeEventListener("click", onClick, true);
    };
  }, []);

  const page = (dir: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({ left: dir * row.clientWidth * 0.7, behavior: reduce ? "auto" : "smooth" });
  };

  const navBtn = "rw-press inline-flex size-11 items-center justify-center rounded-full border border-border bg-background transition-colors hover:border-foreground hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <div className={className}>
      <div ref={rowRef} className="rw-film" role="region" aria-label={label} tabIndex={0} data-cursor="drag" data-cursor-label="ลาก" data-lenis-prevent-horizontal="">
        {children}
      </div>
      <div className="container-x mt-6 flex items-center gap-5">
        <span aria-hidden className="relative h-px flex-1 overflow-hidden bg-border">
          <span ref={barRef} className="absolute inset-0 origin-left bg-foreground transition-transform duration-300" style={{ transform: "scaleX(0.04)" }} />
        </span>
        <div className="flex gap-2">
          <button type="button" className={navBtn} aria-label={prevLabel} onClick={() => page(-1)}>
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" className={navBtn} aria-label={nextLabel} onClick={() => page(1)}>
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
