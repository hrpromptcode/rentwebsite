/**
 * One batched scroll loop for every scroll-linked kit effect (parallax, horizontal tracks, progress rings, scrubbed
 * text). All subscribers READ (getBoundingClientRect, scrollY) first, then WRITE (transforms / CSS vars), once per frame,
 * so N effects cost one layout. With Lenis it runs inside Lenis' own scroll emit (same frame as the scroll it applies,
 * no 1-frame lag); with native scroll it runs on the next animation frame after a scroll / resize event.
 * Nothing here touches React state.
 */
import * as React from "react";
import { getLenis, subscribeLenis } from "./lenis-store";

export interface ScrollSub {
  read?: () => void;
  write?: () => void;
}

const subs = new Set<ScrollSub>();
let raf = 0;
let started = false;
let lenisOff: (() => void) | null = null;

function run() {
  raf = 0;
  subs.forEach((s) => s.read?.());
  subs.forEach((s) => s.write?.());
}
function schedule() {
  if (!raf) raf = requestAnimationFrame(run);
}
function bindLenis() {
  lenisOff?.();
  lenisOff = null;
  const l = getLenis();
  // Lenis emits inside its rAF tick right after applying the scroll: run synchronously (a rAF here would land a frame late)
  if (l)
    lenisOff = l.on("scroll", () => {
      if (raf) cancelAnimationFrame(raf);
      run();
    });
}
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  subscribeLenis(bindLenis);
  bindLenis();
}

/** Adds a subscriber; returns the unsubscribe function. Runs it once on the next frame. */
export function subscribeScroll(sub: ScrollSub): () => void {
  start();
  subs.add(sub);
  schedule();
  return () => {
    subs.delete(sub);
  };
}

/** Forces a pass on the next frame (e.g. after layout changed without a scroll event). */
export function requestScrollTick() {
  if (typeof window !== "undefined") schedule();
}

/**
 * Hook: subscribes `read`/`write` while the element is within `margin` of the viewport (IntersectionObserver gate), so
 * off-screen effects cost nothing. Callbacks are read through refs (no resubscribe on re-render).
 */
export function useScrollEffect(
  ref: React.RefObject<Element | null>,
  handlers: ScrollSub,
  opts: { enabled?: boolean; margin?: string; always?: boolean } = {},
) {
  const { enabled = true, margin = "25% 0px", always = false } = opts;
  const h = React.useRef(handlers);
  h.current = handlers;
  React.useEffect(() => {
    const el = ref.current;
    if (!enabled || (!el && !always)) return;
    const sub: ScrollSub = { read: () => h.current.read?.(), write: () => h.current.write?.() };
    let off: (() => void) | null = null;
    if (always || !el) {
      off = subscribeScroll(sub);
      return () => off?.();
    }
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries[entries.length - 1]?.isIntersecting;
        if (vis && !off) off = subscribeScroll(sub);
        else if (!vis && off) {
          // one last pass so the effect settles at its edge value
          sub.read?.();
          sub.write?.();
          off();
          off = null;
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      off?.();
    };
  }, [ref, enabled, margin, always]);
}

/** Viewport height without the mobile URL-bar jitter (largest seen for the current width). */
let vhCache = 0;
let vwCache = 0;
export function viewportHeight(): number {
  if (typeof window === "undefined") return 0;
  if (window.innerWidth !== vwCache || !vhCache) {
    vwCache = window.innerWidth;
    vhCache = window.innerHeight;
  }
  return vhCache;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
