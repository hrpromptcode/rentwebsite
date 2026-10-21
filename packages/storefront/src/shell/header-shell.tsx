"use client";

import * as React from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { cn } from "@rentweb/ui/lib/utils";

type Variant = "classic" | "centered" | "split" | "floating" | "minimal" | "sidebar";

/**
 * Sticky / transparent header behaviour (§6.3). State lives in data attributes written straight to the DOM (no React
 * state on scroll, so the header's children never re-render while scrolling):
 * - `data-scrolled` after 24px: transparent → glass (solid, blurred)
 * - `data-compact` after 120px: the row shrinks 80 → 64px (md+), the floating pill narrows
 * - `data-on-dark` when the page starts with a dark hero (`[data-hero-dark]`): light text while transparent
 * There is no hide-on-scroll (a hidden fixed header breaks Playwright clicks).
 * Publishes the height the header covers at the top of the viewport as `--header-h` on <html> (0px when it does not
 * stick), so sticky panels (`top-[calc(var(--header-h)+1rem)]`) and scroll-padding-top clear every header variant.
 * packages/ui globals.css has SSR estimates keyed on `data-site-header` / `data-sticky`.
 */
export function HeaderShell({
  children,
  variant,
  transparent,
  sticky,
  className,
}: {
  children: React.ReactNode;
  variant: Variant;
  transparent: boolean;
  sticky: boolean;
  className?: string;
}) {
  const ref = React.useRef<HTMLElement>(null);
  // the header persists across pages, the hero under it does not: re-detect per route (same tree on server + client)
  const routeKey = useSelectedLayoutSegments().join("/");

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const detect = () => el.setAttribute("data-on-dark", document.querySelector("[data-hero-dark]") ? "true" : "false");
    detect();
    const raf = requestAnimationFrame(detect);
    const t = setTimeout(detect, 400); // streamed / lazily rendered heroes
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [routeKey]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let scrolled: boolean | null = null;
    let compact: boolean | null = null;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      const s = y > 24;
      const c = y > 120;
      if (s !== scrolled) el.setAttribute("data-scrolled", String((scrolled = s)));
      if (c !== compact) el.setAttribute("data-compact", String((compact = c)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    let last = -1;
    const set = () => {
      const h = sticky ? Math.round(el.getBoundingClientRect().height) : 0;
      if (h === last) return;
      last = h;
      root.style.setProperty("--header-h", `${h}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--header-h");
    };
  }, [sticky]);

  const common = {
    ref,
    "data-site-header": variant,
    "data-sticky": variant === "floating" ? "true" : sticky ? "true" : "false",
    "data-transparent": transparent ? "true" : "false",
    // in-flow sticky header (sticky + opaque): compensates its row shrink with a margin so the page never jumps
    "data-flow": variant !== "floating" && sticky && !transparent ? "true" : "false",
    "data-scrolled": "false",
    "data-compact": "false",
    "data-on-dark": "false",
    suppressHydrationWarning: true,
  } as const;

  if (variant === "floating") {
    return (
      <header {...common} className={cn("rw-header rw-header--floating pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 md:px-6 md:pt-4", className)}>
        <div data-header-pill="" className="rw-header-pill pointer-events-auto mx-auto flex h-14 items-center rounded-full border px-3 md:h-16 md:px-5">
          {children}
        </div>
      </header>
    );
  }

  return (
    <header {...common} className={cn("rw-header z-40 w-full", sticky && (transparent ? "fixed inset-x-0 top-0" : "sticky top-0"), className)}>
      {children}
    </header>
  );
}
