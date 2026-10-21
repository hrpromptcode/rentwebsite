"use client";

import * as React from "react";
import { getLenis, scrollToTarget, setLenis, useLenis, type LenisLike } from "./lenis-store";

export { useLenis, scrollToTarget };

export interface SmoothScrollProps {
  /** theme effects.smoothScroll; false = native scroll */
  enabled?: boolean;
  /** pathname pattern (RegExp, or its source string from a server component) where smooth scroll stays off */
  disabledRoutes?: RegExp | string;
  /** Lenis lerp (0..1, lower = smoother) */
  lerp?: number;
}

/**
 * Nested scroll areas that must keep native wheel scrolling (dialogs, sheets, menus, selects, maps, cmdk, iframes).
 * Elements may also opt out with `data-lenis-prevent` (Lenis' own attribute).
 */
const PREVENT =
  '[data-lenis-prevent],[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"],[data-radix-popper-content-wrapper],[data-radix-select-viewport],[data-radix-scroll-area-viewport],[cmdk-list],[data-vaul-drawer],.leaflet-container,.maplibregl-map,.mapboxgl-map,iframe,textarea';

let owners = 0;

/**
 * Lenis smooth scrolling driven by the GSAP ticker (one rAF for Lenis + ScrollTrigger + kit scroll effects).
 * - Off under prefers-reduced-motion, on touch-only devices (native momentum is better), when html[data-route] is
 *   "operational", when html[data-smooth="false"], when `enabled` is false or the pathname matches `disabledRoutes`.
 *   It re-evaluates when those change (route kind flips on client navigation).
 * - Stops while body[data-scroll-locked] (Radix dialogs/sheets lock scroll); dialogs, menus and `data-lenis-prevent`
 *   areas scroll natively; other nested scrollers are detected (allowNestedScroll).
 * - Same-page hash links scroll smoothly to the target minus the sticky header (`--header-h`), update the URL hash and
 *   move focus to the target.
 * - Lenis and GSAP are loaded lazily, only when smooth scrolling actually turns on.
 * Render it once per document (extra instances are inert).
 */
export function SmoothScroll({ enabled = true, disabledRoutes, lerp = 0.1 }: SmoothScrollProps) {
  const routeSource = typeof disabledRoutes === "string" ? disabledRoutes : disabledRoutes?.source;
  const routeFlags = typeof disabledRoutes === "string" ? "" : (disabledRoutes?.flags ?? "");

  React.useEffect(() => {
    if (!enabled) return;
    if (owners > 0) return; // another SmoothScroll owns the document
    owners++;
    const html = document.documentElement;
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touchOnlyMq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const routeRe = routeSource ? new RegExp(routeSource, routeFlags) : null;

    let lenis: (LenisLike & { raf(t: number): void; destroy(): void }) | null = null;
    let tick: ((time: number) => void) | null = null;
    let gsapRef: typeof import("./gsap") | null = null;
    let loading = false;
    let disposed = false;

    const shouldRun = () =>
      !reduceMq.matches &&
      !touchOnlyMq.matches &&
      html.dataset.route !== "operational" &&
      html.dataset.smooth !== "false" &&
      !(routeRe && routeRe.test(window.location.pathname));

    const syncLock = () => {
      if (!lenis) return;
      if (document.body.hasAttribute("data-scroll-locked")) lenis.stop();
      else if (lenis.isStopped) lenis.start();
    };

    const mount = async () => {
      if (lenis || loading) return;
      loading = true;
      const [{ default: Lenis }, g] = await Promise.all([import("lenis"), import("./gsap")]);
      loading = false;
      if (disposed || lenis || !shouldRun()) return;
      g.registerGsap();
      gsapRef = g;
      const l = new Lenis({
        lerp,
        smoothWheel: true,
        syncTouch: false,
        autoRaf: false,
        anchors: false,
        allowNestedScroll: true,
        stopInertiaOnNavigate: true,
        prevent: (node: HTMLElement) => typeof node.matches === "function" && node.matches(PREVENT),
      });
      lenis = l as unknown as typeof lenis;
      l.on("scroll", g.ScrollTrigger.update);
      tick = (time: number) => l.raf(time * 1000);
      g.gsap.ticker.add(tick, false, true); // prioritised: Lenis applies the scroll before any other tick reads it
      g.gsap.ticker.lagSmoothing(0);
      setLenis(l as unknown as LenisLike);
      syncLock();
      g.ScrollTrigger.refresh();
    };

    const unmount = () => {
      if (!lenis) return;
      if (gsapRef && tick) {
        gsapRef.gsap.ticker.remove(tick);
        gsapRef.gsap.ticker.lagSmoothing(500, 33);
      }
      lenis.destroy();
      lenis = null;
      tick = null;
      if (getLenis()) setLenis(null);
    };

    const evaluate = () => (shouldRun() ? void mount() : unmount());
    evaluate();

    const htmlMo = new MutationObserver(evaluate);
    htmlMo.observe(html, { attributes: true, attributeFilter: ["data-route", "data-smooth"] });
    const bodyMo = new MutationObserver(syncLock);
    bodyMo.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    reduceMq.addEventListener("change", evaluate);
    touchOnlyMq.addEventListener("change", evaluate);
    window.addEventListener("popstate", evaluate);

    // same-page hash links: smooth scroll with the header offset, keep the URL and focus in sync
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.search !== window.location.search || !url.hash) return;
      const id = decodeURIComponent(url.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      e.preventDefault();
      scrollToTarget(target);
      if (window.location.hash !== url.hash) window.history.pushState(window.history.state, "", url.hash);
      if (!target.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };
    document.addEventListener("click", onClick);

    return () => {
      disposed = true;
      owners--;
      htmlMo.disconnect();
      bodyMo.disconnect();
      reduceMq.removeEventListener("change", evaluate);
      touchOnlyMq.removeEventListener("change", evaluate);
      window.removeEventListener("popstate", evaluate);
      document.removeEventListener("click", onClick);
      unmount();
    };
  }, [enabled, routeSource, routeFlags, lerp]);

  return null;
}
