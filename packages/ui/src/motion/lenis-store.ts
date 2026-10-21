/**
 * Tiny registry for the page's single Lenis instance (no lenis import here, so it is free to import anywhere).
 * SmoothScroll publishes the instance; useLenis() / scrollToTarget() / the scroll loop read it.
 */
import * as React from "react";

/** The subset of the Lenis API the kit uses (keeps this module free of a lenis import). */
export interface LenisLike {
  scroll: number;
  limit: number;
  velocity: number;
  direction: number;
  isStopped: boolean;
  scrollTo(target: number | string | HTMLElement, opts?: { offset?: number; duration?: number; immediate?: boolean; lock?: boolean; force?: boolean; onComplete?: () => void }): void;
  on(event: "scroll", cb: (l: LenisLike) => void): () => void;
  start(): void;
  stop(): void;
  resize(): void;
}

let current: LenisLike | null = null;
const listeners = new Set<() => void>();

export function setLenis(l: LenisLike | null) {
  current = l;
  listeners.forEach((fn) => fn());
}
export function getLenis(): LenisLike | null {
  return current;
}
export function subscribeLenis(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The active Lenis instance, or null (smooth scroll off: reduced motion, touch-only, operational route, disabled). */
export function useLenis(): LenisLike | null {
  return React.useSyncExternalStore(subscribeLenis, getLenis, () => null);
}

function headerOffset(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--header-h").trim();
  if (!v) return 0;
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;height:${v}`;
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

/**
 * Scrolls to a y position, element or selector — through Lenis when it runs, else native (instant under reduced motion).
 * `offset` defaults to minus the sticky header height (+8px) for elements.
 */
export function scrollToTarget(target: number | string | HTMLElement, opts: { offset?: number; duration?: number; immediate?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : typeof target === "number" ? null : target;
  if (typeof target !== "number" && !el) return;
  const offset = opts.offset ?? (el ? -(headerOffset() + 8) : 0);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lenis = getLenis();
  if (lenis && !reduce) {
    lenis.scrollTo(el ?? (target as number), { offset, duration: opts.duration, immediate: opts.immediate });
    return;
  }
  const y = el ? el.getBoundingClientRect().top + window.scrollY + offset : (target as number) + offset;
  window.scrollTo({ top: Math.max(0, y), behavior: reduce || opts.immediate ? "auto" : "smooth" });
}
