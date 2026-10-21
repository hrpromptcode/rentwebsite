"use client";

import * as React from "react";

export interface SectionProgressOptions {
  /** ScrollTrigger-style "<element edge> <viewport edge>"; edges: top | center | bottom | <n>%. Default "top bottom". */
  start?: string;
  /** Default "bottom top". For a sticky stage use start "top top", end "bottom bottom". */
  end?: string;
}

function edge(token: string | undefined, size: number, fallback: number): number {
  if (!token) return fallback * size;
  if (token === "top") return 0;
  if (token === "center") return size / 2;
  if (token === "bottom") return size;
  const m = /^(-?\d+(?:\.\d+)?)%$/.exec(token);
  if (m) return (parseFloat(m[1]!) / 100) * size;
  const px = /^(-?\d+(?:\.\d+)?)(px)?$/.exec(token);
  if (px) return parseFloat(px[1]!);
  return fallback * size;
}

/** Scroll position of `top` (document Y of the element's top edge) at which "<el> <vp>" meet. */
function scrollAt(spec: string, elTop: number, elH: number, vpH: number, defEl: number, defVp: number) {
  const [a, b] = spec.trim().split(/\s+/);
  return elTop + edge(a, elH, defEl) - edge(b, vpH, defVp);
}

/**
 * Scroll progress (0..1) of a section as a ref — no React state, no re-renders. rAF-driven only while the
 * section is within one viewport of the screen (IntersectionObserver), so idle pages cost nothing.
 * Works with native scroll and Lenis (which drives window scroll).
 */
export function useSectionProgress(ref: React.RefObject<Element | null>, opts: SectionProgressOptions = {}): React.MutableRefObject<number> {
  const progress = React.useRef(0);
  const { start = "top bottom", end = "bottom top" } = opts;
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let active = false;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const vpH = window.innerHeight;
      const y = window.scrollY;
      const top = r.top + y;
      const s = scrollAt(start, top, r.height, vpH, 0, 1);
      const e = scrollAt(end, top, r.height, vpH, 1, 0);
      const p = e === s ? (y >= e ? 1 : 0) : (y - s) / (e - s);
      progress.current = Math.min(1, Math.max(0, p));
      if (active) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        const next = !!entry?.isIntersecting;
        if (next && !active) {
          active = true;
          raf = requestAnimationFrame(tick);
        } else if (!next && active) {
          active = false;
          cancelAnimationFrame(raf);
          tick(); // settle at 0 or 1
        }
      },
      { rootMargin: "100% 0px 100% 0px" },
    );
    io.observe(el);
    tick();
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [ref, start, end]);
  return progress;
}
