"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { getLenis } from "./lenis-store";
import { motionLevel } from "./prefs";

export interface VelocityMarqueeProps {
  items: React.ReactNode[];
  /** px per second at rest */
  speed?: number;
  /** 1 = moves left, -1 = moves right */
  direction?: 1 | -1;
  /** scroll velocity speeds it up and flips its direction with the scroll direction */
  reactToScroll?: boolean;
  /** skew with scroll velocity (≤ 6°, expressive motion level only) */
  skew?: boolean;
  /** rendered between items (default a small dot) */
  separator?: React.ReactNode;
  /** outlined text (text-stroke) for alternate items */
  outline?: boolean | "alternate";
  size?: "sm" | "md" | "lg" | "giant";
  pauseOnHover?: boolean;
  /** CSS gap between items */
  gap?: string;
  className?: string;
  /** accessible label for the whole row (items are read once; copies are aria-hidden) */
  label?: string;
}

/**
 * Infinite marquee driven by rAF (§3.2): base speed + scroll velocity boost, direction follows the scroll direction,
 * optional velocity skew. Pauses off-screen, on hover (eases to a stop) and when the tab is hidden. Reduced motion:
 * a static, wrapped row with a single copy. Thai-safe line box (line-height ≥ 1.25 + block padding, no clipped marks).
 */
export function VelocityMarquee({
  items,
  speed = 40,
  direction = 1,
  reactToScroll = true,
  skew = true,
  separator,
  outline,
  size = "md",
  pauseOnHover = true,
  gap,
  className,
  label,
}: VelocityMarqueeProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [copies, setCopies] = React.useState(2);

  // Thai giant rows cap at --step-6 (§2.2); plain regex, identical on server and client
  const strings = items.filter((it): it is string => typeof it === "string").join(" ");
  const script = !strings ? undefined : /[฀-๿]/.test(strings) ? (/[A-Za-z]/.test(strings) ? "mixed" : "thai") : "latin";
  const sep = separator === undefined ? <span data-vm-sep="" aria-hidden="true" /> : separator;
  const group = (copy: number) => (
    <div data-vm-group="" aria-hidden={copy > 0 ? true : undefined} key={copy}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <span data-vm-item="" data-outline={outline === true || (outline === "alternate" && i % 2 === 1) ? "" : undefined}>
            {it}
          </span>
          {sep ? <span data-vm-sep-wrap="" aria-hidden="true">{sep}</span> : null}
        </React.Fragment>
      ))}
    </div>
  );

  React.useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) {
      root.dataset.state = "static";
      return;
    }
    root.dataset.state = "run";
    const canSkew = skew && motionLevel() === "expressive";

    let groupW = 0;
    const measure = () => {
      const g = track.firstElementChild as HTMLElement | null;
      if (!g) return;
      groupW = g.getBoundingClientRect().width;
      const need = groupW > 0 ? Math.max(2, Math.ceil(root.clientWidth / groupW) + 1) : 2;
      setCopies((c) => (c === need ? c : need));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (track.firstElementChild) ro.observe(track.firstElementChild);

    let x = 0;
    let dir = direction;
    let boost = 0;
    let hoverFactor = 1;
    let hovering = false;
    let lastY = window.scrollY;
    let raf = 0;
    let last = 0;
    let visible = false;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      if (!groupW) return;
      let v = 0; // px per second of scroll
      if (reactToScroll) {
        const lenis = getLenis();
        if (lenis) v = lenis.velocity * 60;
        else {
          const y = window.scrollY;
          v = dt > 0 ? (y - lastY) / dt : 0;
          lastY = y;
        }
        if (Math.abs(v) > 20) dir = (v > 0 ? 1 : -1) * direction as 1 | -1;
      }
      const targetBoost = Math.min(Math.abs(v) * 0.25, speed * 12);
      boost += (targetBoost - boost) * Math.min(1, dt * 6);
      hoverFactor += ((hovering && pauseOnHover ? 0 : 1) - hoverFactor) * Math.min(1, dt * 5);
      x -= dir * (speed + boost) * hoverFactor * dt;
      if (x <= -groupW) x += groupW;
      else if (x > 0) x -= groupW;
      const sk = canSkew ? Math.max(-6, Math.min(6, (-v / 400) * (dir as number))) : 0;
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)${sk ? ` skewX(${sk.toFixed(2)}deg)` : ""}`;
    };
    const play = () => {
      if (!raf && visible && !document.hidden) {
        last = 0;
        lastY = window.scrollY;
        raf = requestAnimationFrame(frame);
      }
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver((e) => {
      visible = !!e[e.length - 1]?.isIntersecting;
      if (visible) play();
      else pause();
    });
    io.observe(root);
    const onVis = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVis);
    const enter = () => (hovering = true);
    const leave = () => (hovering = false);
    root.addEventListener("pointerenter", enter);
    root.addEventListener("pointerleave", leave);
    const onReduce = () => {
      if (reduce.matches) {
        pause();
        root.dataset.state = "static";
        track.style.transform = "";
      }
    };
    reduce.addEventListener("change", onReduce);
    return () => {
      pause();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      root.removeEventListener("pointerenter", enter);
      root.removeEventListener("pointerleave", leave);
      reduce.removeEventListener("change", onReduce);
    };
  }, [speed, direction, reactToScroll, skew, pauseOnHover]);

  return (
    <div
      ref={rootRef}
      className={cn("rw-vmarquee", className)}
      data-size={size}
      data-state="ssr"
      data-script={script}
      role={label ? "group" : undefined}
      aria-label={label}
      style={gap ? ({ "--vm-gap": gap } as React.CSSProperties) : undefined}
    >
      <div ref={trackRef} data-vm-track="">
        {Array.from({ length: copies }, (_, c) => group(c))}
      </div>
    </div>
  );
}
