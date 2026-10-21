"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { useEnterOnce } from "./prefs";
import { clamp01, useScrollEffect, viewportHeight } from "./scroll-loop";

export interface ScatterCardLayout {
  image: string;
  alt?: string;
  title?: string;
  tag?: string;
  avatar?: string;
  /** desktop centre position, % of the stage */
  x: number;
  y: number;
  /** phone centre position, % of the stage */
  mx: number;
  my: number;
  /** shown on phones */
  mobile: boolean;
  /** tilt (deg) */
  rot: number;
  /** 0 far · 1 mid · 2 near */
  depth: number;
  floatDur: number;
  floatDelay: number;
}

const DEPTH_PX = [4, 10, 18];

export function ScatterCardsClient({
  cards,
  float,
  assemble,
  className,
  minHeight,
  children,
}: {
  cards: ScatterCardLayout[];
  float: boolean;
  assemble: "none" | "in" | "out";
  className?: string;
  minHeight?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const enter = React.useCallback(() => {
    const el = ref.current;
    if (el) requestAnimationFrame(() => requestAnimationFrame(() => (el.dataset.state = "in")));
  }, []);
  useEnterOnce(ref, enter, { rootMargin: "0px" });

  // pointer parallax: one CSS var pair on the stage, every card derives its own offset (CSS transition smooths it)
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      py = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.setProperty("--px", px.toFixed(3));
          el.style.setProperty("--py", py.toFixed(3));
        });
    };
    const onLeave = () => {
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // scroll-out: cards drift outward as the stage leaves the top of the viewport
  const so = React.useRef(0);
  const [outOn, setOutOn] = React.useState(false);
  React.useEffect(() => {
    setOutOn(assemble === "out" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [assemble]);
  useScrollEffect(
    ref,
    {
      read: () => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        so.current = clamp01(-r.top / Math.max(1, Math.min(r.height, viewportHeight())));
      },
      write: () => ref.current?.style.setProperty("--so", so.current.toFixed(4)),
    },
    { enabled: outOn },
  );

  return (
    <div ref={ref} className={cn("rw-scatter", className)} data-state="idle" data-assemble={assemble} data-float={float ? "" : undefined} style={minHeight ? { minHeight } : undefined}>
      <div data-scatter-cards="" aria-hidden={cards.every((c) => !c.title) ? true : undefined}>
        {cards.map((c, i) => (
          <figure
            key={i}
            data-scatter-card=""
            data-depth={c.depth}
            data-mobile={c.mobile ? "" : undefined}
            style={
              {
                "--x": `${c.x}%`,
                "--y": `${c.y}%`,
                "--mx": `${c.mx}%`,
                "--my": `${c.my}%`,
                "--dx": ((c.x - 50) / 50).toFixed(3),
                "--dy": ((c.y - 50) / 50).toFixed(3),
                "--r": `${c.rot}deg`,
                "--d": DEPTH_PX[c.depth] ?? 10,
                "--i": i,
                "--fd": `${c.floatDur}s`,
                "--fdl": `${c.floatDelay}s`,
              } as React.CSSProperties
            }
          >
            <div data-scatter-parallax="">
              <div data-scatter-float="">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image} alt={c.alt ?? ""} loading="lazy" decoding="async" draggable={false} />
                {c.title || c.tag ? (
                  <figcaption>
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img data-scatter-avatar="" src={c.avatar} alt="" loading="lazy" decoding="async" />
                    ) : null}
                    {c.title ? <span data-scatter-title="">{c.title}</span> : null}
                    {c.tag ? <span data-scatter-tag="">{c.tag}</span> : null}
                  </figcaption>
                ) : null}
              </div>
            </div>
          </figure>
        ))}
      </div>
      <div data-scatter-center="">{children}</div>
    </div>
  );
}
