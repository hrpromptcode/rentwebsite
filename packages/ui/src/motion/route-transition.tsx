"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { useIsoLayoutEffect } from "./prefs";

export type RouteTransitionStyle = "none" | "fade" | "rise" | "curtain";

let firstMountDone = false;

/**
 * Enter-only page transition (§2.6) for App Router. Put it in `template.tsx` (remounts on every navigation) or in a
 * layout with `routeKey={pathname}`. The very first page load never animates (no LCP delay); later navigations play
 * fade (220ms) · rise (fade + 24px rise, 450ms) · curtain (a --primary panel wipes up off the screen, 700ms).
 * Uses the Web Animations API on the existing node: no remount, the old page is never kept in the DOM, nothing blocks
 * input (the curtain is pointer-events: none). Reduced motion → none.
 */
export function RouteTransition({ style = "fade", routeKey, children, className }: { style?: RouteTransitionStyle; routeKey?: string; children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const curtainRef = React.useRef<HTMLDivElement>(null);
  const prevKey = React.useRef<string | undefined>(routeKey);
  const mounted = React.useRef(false);

  useIsoLayoutEffect(() => {
    let animate = false;
    if (!mounted.current) {
      // a real mount: animate only if some page already rendered before (template.tsx remount on navigation)
      mounted.current = true;
      animate = firstMountDone;
      firstMountDone = true;
    } else if (prevKey.current !== routeKey) {
      animate = true; // layout usage: the route key changed (StrictMode re-runs keep the same key → no replay)
    }
    prevKey.current = routeKey;
    if (!animate || style === "none") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const anims: Animation[] = [];
    if (style === "fade") {
      anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "cubic-bezier(0.25,1,0.5,1)" }));
    } else if (style === "rise") {
      anims.push(
        el.animate([{ opacity: 0, transform: "translate3d(0,24px,0)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(0.16,1,0.3,1)" }),
      );
    } else if (style === "curtain") {
      const c = curtainRef.current;
      if (c) {
        c.style.display = "block";
        const a = c.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 100% 0)" }], { duration: 700, easing: "cubic-bezier(0.85,0,0.15,1)", fill: "forwards" });
        a.onfinish = () => {
          c.style.display = "none";
        };
        anims.push(a);
      }
      anims.push(
        el.animate([{ opacity: 0.4, transform: "translate3d(0,40px,0)" }, { opacity: 1, transform: "none" }], { duration: 800, delay: 120, easing: "cubic-bezier(0.16,1,0.3,1)", fill: "backwards" }),
      );
    }
    return () => anims.forEach((a) => a.cancel());
  }, [routeKey, style]);

  return (
    <>
      <div ref={ref} className={cn("rw-route", className)} data-route-transition={style}>
        {children}
      </div>
      {style === "curtain" ? <div ref={curtainRef} data-route-curtain="" aria-hidden="true" /> : null}
    </>
  );
}

/**
 * 2px top progress line (§2.6): starts on a same-origin link click to another URL, completes when the URL changes
 * (the App Router commits the navigation) or after 8s. Also listens to `rw:route-start` / `rw:route-done` events.
 */
export function RouteProgress({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = false;
    let raf = 0;
    let p = 0;
    let startHref = "";
    let started = 0;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    const set = (v: number) => el.style.setProperty("--rp", v.toFixed(4));
    const done = () => {
      if (!active) return;
      active = false;
      cancelAnimationFrame(raf);
      set(1);
      el.dataset.state = "done";
      clearTimeout(doneTimer);
      doneTimer = setTimeout(() => {
        el.dataset.state = "idle";
        set(0);
      }, 380);
    };
    const loop = () => {
      if (!active) return;
      if (window.location.href !== startHref) return done();
      if (performance.now() - started > 8000) return done();
      p += (0.9 - p) * 0.035;
      set(p);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      clearTimeout(doneTimer);
      active = true;
      p = 0.08;
      startHref = window.location.href;
      started = performance.now();
      el.dataset.state = "run";
      set(p);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };
    const onPop = () => {
      if (active) done();
    };
    // bubble phase: links whose handlers call preventDefault (client-side filters, modals) do not start the bar
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);
    window.addEventListener("rw:route-start", start);
    window.addEventListener("rw:route-done", done);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(doneTimer);
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("rw:route-start", start);
      window.removeEventListener("rw:route-done", done);
    };
  }, []);
  return <div ref={ref} className={cn("rw-route-progress", className)} data-route-progress="" data-state="idle" aria-hidden="true" />;
}
