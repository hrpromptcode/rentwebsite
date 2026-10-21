/**
 * GSAP entry for the motion kit (client-only usage). Import gsap / ScrollTrigger / useGSAP from HERE so plugins are
 * registered exactly once and every ScrollTrigger is refreshed after webfonts load (Thai fonts change line heights).
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
import { Observer } from "gsap/Observer";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

let registered = false;

/** Registers ScrollTrigger, Flip, Observer, CustomEase and the kit eases once (no-op on the server). */
export function registerGsap(): typeof gsap {
  if (registered || typeof window === "undefined") return gsap;
  registered = true;
  gsap.registerPlugin(ScrollTrigger, Flip, Observer, CustomEase, useGSAP);
  // §2.1 motion tokens as named GSAP eases (same curves as the CSS custom properties)
  CustomEase.create("rw.expo", "0.16,1,0.3,1");
  CustomEase.create("rw.quart", "0.25,1,0.5,1");
  CustomEase.create("rw.circ", "0.85,0,0.15,1");
  CustomEase.create("rw.spring", "0.34,1.56,0.64,1");
  ScrollTrigger.config({ ignoreMobileResize: true });
  const refresh = () => ScrollTrigger.refresh();
  try {
    document.fonts?.ready.then(refresh).catch(() => {});
  } catch {
    /* ignore */
  }
  if (document.readyState !== "complete") window.addEventListener("load", refresh, { once: true });
  return gsap;
}

export const MM_CONDITIONS = {
  reduce: "(prefers-reduced-motion: reduce)",
  motion: "(prefers-reduced-motion: no-preference)",
  fine: "(pointer: fine)",
  desktop: "(min-width: 768px)",
} as const;

export type MMConditions = { [K in keyof typeof MM_CONDITIONS]: boolean };

/**
 * gsap.matchMedia() with the kit conditions. `fn` runs (and re-runs) whenever a condition flips; animations created in
 * it are reverted automatically. Returns the MatchMedia so callers can `.revert()` (useGSAP does it for you).
 */
export function mm(fn: (c: MMConditions, ctx: gsap.Context) => void | (() => void), scope?: Element | string | object) {
  registerGsap();
  const m = gsap.matchMedia(scope as Element | undefined);
  m.add(MM_CONDITIONS, (ctx) => fn(ctx.conditions as MMConditions, ctx));
  return m;
}

/** Durations (seconds) and eases matching the CSS tokens (§2.1). */
export const DUR = { micro: 0.16, ui: 0.32, reveal: 0.9, hero: 1.4, curtain: 0.9 } as const;
export const EASE = { expo: "rw.expo", quart: "rw.quart", circ: "rw.circ", spring: "rw.spring" } as const;

/** Debounced ScrollTrigger.refresh() — call after images in a pinned/scrubbed section load. */
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
export function refreshScroll(delay = 120) {
  if (typeof window === "undefined") return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => ScrollTrigger.refresh(), delay);
}

export { gsap, ScrollTrigger, Flip, Observer, CustomEase, useGSAP };
