/**
 * Motion preferences shared by every motion / fx component. SSR-safe: nothing touches window during render; hooks start
 * from a conservative "not ready" state and fill in after mount.
 */
import * as React from "react";

export type MotionLevel = "subtle" | "standard" | "expressive";

export function canUseDom() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function prefersReducedMotion(): boolean {
  return canUseDom() && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export function isFinePointer(): boolean {
  return canUseDom() && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
export function isDesktop(): boolean {
  return canUseDom() && window.matchMedia("(min-width: 768px)").matches;
}
export function saveData(): boolean {
  return canUseDom() && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}
/** html[data-motion] set by the tenant theme (effects.motionLevel). Defaults to "standard". */
export function motionLevel(): MotionLevel {
  if (!canUseDom()) return "standard";
  const v = document.documentElement.dataset.motion;
  return v === "subtle" || v === "expressive" ? v : "standard";
}
/** html[data-route="operational"] (shell RouteKind): cart, checkout, account … get no smooth scroll / cursor / pinning. */
export function isOperationalRoute(): boolean {
  return canUseDom() && document.documentElement.dataset.route === "operational";
}
/** Crawlers, Lighthouse and automation (Playwright sets navigator.webdriver). */
export function isBot(): boolean {
  if (!canUseDom()) return true;
  return navigator.webdriver === true || /bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent);
}

export interface MotionPrefs {
  /** false during SSR and the first client render */
  ready: boolean;
  reduce: boolean;
  fine: boolean;
  desktop: boolean;
  level: MotionLevel;
}

const SSR_PREFS: MotionPrefs = { ready: false, reduce: false, fine: false, desktop: false, level: "standard" };

/** Live motion preferences (re-renders when the OS setting / pointer / viewport class / data-motion changes). */
export function useMotionPrefs(): MotionPrefs {
  const [prefs, setPrefs] = React.useState<MotionPrefs>(SSR_PREFS);
  React.useEffect(() => {
    const qs = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(hover: hover) and (pointer: fine)"),
      window.matchMedia("(min-width: 768px)"),
    ];
    const read = () =>
      setPrefs((p) => {
        const n: MotionPrefs = { ready: true, reduce: qs[0]!.matches, fine: qs[1]!.matches, desktop: qs[2]!.matches, level: motionLevel() };
        return p.ready === n.ready && p.reduce === n.reduce && p.fine === n.fine && p.desktop === n.desktop && p.level === n.level ? p : n;
      });
    read();
    qs.forEach((q) => q.addEventListener("change", read));
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => {
      qs.forEach((q) => q.removeEventListener("change", read));
      mo.disconnect();
    };
  }, []);
  return prefs;
}

/** useLayoutEffect on the client, useEffect on the server (no warning, never runs there). */
export const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * Fires `onEnter` once when the element's top passes 85% of the viewport (§2.1 `start: "top 85%"`), or immediately when
 * keyboard focus lands inside it first. Callers flip a data attribute (no React state on scroll).
 */
export function useEnterOnce(ref: React.RefObject<Element | null>, onEnter: () => void, opts: { enabled?: boolean; rootMargin?: string } = {}) {
  const { enabled = true, rootMargin = "0px 0px -15% 0px" } = opts;
  const cb = React.useRef(onEnter);
  cb.current = onEnter;
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let done = false;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && fire(), { rootMargin });
    function fire() {
      if (done) return;
      done = true;
      io.disconnect();
      el!.removeEventListener("focusin", fire);
      cb.current();
    }
    io.observe(el);
    el.addEventListener("focusin", fire);
    return () => {
      done = true;
      io.disconnect();
      el.removeEventListener("focusin", fire);
    };
  }, [ref, enabled, rootMargin]);
}

/** Calls `cb(visible)` when the element enters / leaves the viewport (+margin): pause loops off-screen. */
export function useVisibility(ref: React.RefObject<Element | null>, cb: (visible: boolean) => void, rootMargin = "100px") {
  const fn = React.useRef(cb);
  fn.current = cb;
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (e) fn.current(e.isIntersecting);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
}

/** Resolves once the Preloader hands off (or never ran: window.__rwPreloader !== "on"), or after maxMs. */
export function whenPreloaded(maxMs = 1600): Promise<void> {
  if (!canUseDom() || (window as Window & { __rwPreloader?: string }).__rwPreloader !== "on") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener("rw:preloaded", done);
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(done, maxMs);
    window.addEventListener("rw:preloaded", done);
  });
}

/** Runs `cb(dt, t)` every animation frame (dt in seconds, capped at 50ms) until the returned stop function is called. */
export function onFrame(cb: (dt: number, t: number) => void): () => void {
  let raf = 0;
  let last = performance.now();
  const loop = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    cb(dt, t);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
