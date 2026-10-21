"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { isOperationalRoute } from "./prefs";
import { clamp01, useScrollEffect, viewportHeight } from "./scroll-loop";
import { scrollToTarget } from "./lenis-store";

export interface HorizontalScrollProps {
  children: React.ReactNode;
  /** accessible name of the track region */
  label: string;
  /** native mode: scroll-snap to each child */
  snap?: boolean;
  /** progress line under the track */
  progress?: boolean;
  className?: string;
  /** class for the flex track (gap / padding) */
  trackClassName?: string;
  /** prev / next button labels (native mode) */
  prevLabel?: string;
  nextLabel?: string;
  /** optional content above the track inside the sticky stage (title …) */
  header?: React.ReactNode;
}

/**
 * Pinned horizontal track (§3.2). Desktop (≥ 768px, motion allowed, marketing route): the section grows to
 * `track overflow + 100vh`, a CSS-sticky stage holds the track and vertical scroll drives `translateX` (lerped, batched
 * scroll loop; no GSAP pin). Keyboard focus inside the track scrolls the page so the focused card is in view.
 * Mobile / reduced motion / SSR: a native swipe row (`overflow-x: auto`, scroll-snap) with 44px prev / next buttons.
 */
export function HorizontalScroll({ children, label, snap = true, progress = true, className, trackClassName, prevLabel = "ก่อนหน้า", nextLabel = "ถัดไป", header }: HorizontalScrollProps) {
  const sectionRef = React.useRef<HTMLElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const barRef = React.useRef<HTMLSpanElement>(null);
  const [pinned, setPinned] = React.useState(false);
  const overflow = React.useRef(0);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px) and (prefers-reduced-motion: no-preference)");
    const evaluate = () => setPinned(mq.matches && !isOperationalRoute());
    evaluate();
    mq.addEventListener("change", evaluate);
    return () => mq.removeEventListener("change", evaluate);
  }, []);

  // measure the overflow and size the section (pinned mode)
  React.useEffect(() => {
    const section = sectionRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!section || !viewport || !track) return;
    if (!pinned) {
      section.style.height = "";
      track.style.transform = "";
      return;
    }
    const measure = () => {
      overflow.current = Math.max(0, track.scrollWidth - viewport.clientWidth);
      section.style.height = `${Math.round(overflow.current + viewportHeight())}px`;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    ro.observe(viewport);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      section.style.height = "";
      track.style.transform = "";
    };
  }, [pinned]);

  const target = React.useRef(0);
  const x = React.useRef(0);
  const p = React.useRef(0);
  const raf = React.useRef(0);
  const settle = React.useCallback(() => {
    cancelAnimationFrame(raf.current);
    const step = () => {
      x.current += (target.current - x.current) * 0.18;
      if (Math.abs(target.current - x.current) < 0.3) x.current = target.current;
      if (trackRef.current) trackRef.current.style.transform = `translate3d(${(-x.current).toFixed(1)}px,0,0)`;
      if (barRef.current) barRef.current.style.transform = `scaleX(${p.current.toFixed(4)})`;
      if (x.current !== target.current) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);
  React.useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useScrollEffect(
    sectionRef,
    {
      read: () => {
        const s = sectionRef.current;
        if (!s) return;
        const r = s.getBoundingClientRect();
        const travel = r.height - viewportHeight();
        p.current = travel > 0 ? clamp01(-r.top / travel) : 0;
        target.current = p.current * overflow.current;
      },
      write: settle,
    },
    { enabled: pinned, margin: "10% 0px" },
  );

  // native mode: progress from the row's own scroll
  React.useEffect(() => {
    const v = viewportRef.current;
    if (!v || pinned || !progress) return;
    const onScroll = () => {
      const max = v.scrollWidth - v.clientWidth;
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? (v.scrollLeft / max).toFixed(4) : "0"})`;
    };
    onScroll();
    v.addEventListener("scroll", onScroll, { passive: true });
    return () => v.removeEventListener("scroll", onScroll);
  }, [pinned, progress]);

  // pinned: focusing a card scrolls the page to the position that shows it
  const onFocus = (e: React.FocusEvent) => {
    if (!pinned) return;
    const s = sectionRef.current;
    const v = viewportRef.current;
    const item = (e.target as HTMLElement).closest("[data-hs-track] > *") as HTMLElement | null;
    if (!s || !v || !item) return;
    v.scrollLeft = 0;
    const want = Math.max(0, Math.min(overflow.current, item.offsetLeft - v.clientWidth * 0.1));
    const travel = s.offsetHeight - viewportHeight();
    const top = s.getBoundingClientRect().top + window.scrollY;
    if (travel > 0 && overflow.current > 0) scrollToTarget(top + (want / overflow.current) * travel, { offset: 0, immediate: true });
  };

  const page = (dir: 1 | -1) => {
    const v = viewportRef.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    v.scrollBy({ left: dir * v.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section ref={sectionRef} className={cn("rw-hscroll", className)} data-mode={pinned ? "pin" : "native"} data-snap={snap ? "" : undefined}>
      <div data-hs-sticky="">
        {header ? <div data-hs-header="">{header}</div> : null}
        <div ref={viewportRef} data-hs-viewport="" role="region" aria-label={label} tabIndex={0} onFocus={onFocus} data-lenis-prevent-horizontal="">
          <div ref={trackRef} data-hs-track="" className={trackClassName}>
            {children}
          </div>
        </div>
        <div data-hs-foot="">
          {progress ? (
            <span data-hs-progress="" aria-hidden="true">
              <span ref={barRef} />
            </span>
          ) : null}
          <div data-hs-nav="">
            <button type="button" aria-label={prevLabel} onClick={() => page(-1)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" aria-label={nextLabel} onClick={() => page(1)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
