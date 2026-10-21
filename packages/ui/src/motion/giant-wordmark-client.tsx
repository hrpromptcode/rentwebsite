"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import type { Script } from "./split";
import { motionLevel, useEnterOnce } from "./prefs";
import { useScrollEffect, viewportHeight } from "./scroll-loop";

export interface GiantWordmarkClientProps {
  text: string;
  parts: string[];
  script: Script;
  em: number;
  cap: string;
  effect: "rise" | "parallax" | "spotlight" | "marquee" | "none";
  outline?: boolean;
  image?: string;
  as: "p" | "div" | "span" | "h2";
  decorative: boolean;
  className?: string;
}

export function GiantWordmarkClient({ text, parts, script, em, cap, effect, outline, image, as, decorative, className }: GiantWordmarkClientProps) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const textRef = React.useRef<HTMLElement>(null);
  const Tag = as as React.ElementType;

  // fit refinement: one measurement after webfonts load (and on resize). Small error → scaleX (no layout change);
  // larger error → correct the font-size factor (the wordmark normally sits at the page end, below the fold).
  React.useEffect(() => {
    const w = wrap.current;
    const t = textRef.current;
    if (!w || !t || effect === "marquee") return;
    let k = 1;
    const fit = () => {
      const avail = w.clientWidth;
      t.style.transform = "";
      const natural = t.scrollWidth;
      if (!avail || !natural) return;
      const ratio = avail / natural;
      if (Math.abs(ratio - 1) <= 0.03) {
        t.style.transform = `scaleX(${ratio.toFixed(4)})`;
      } else {
        k = Math.max(0.4, Math.min(2.5, k * ratio));
        w.style.setProperty("--gw-k", k.toFixed(4));
        const after = t.scrollWidth;
        const r2 = after ? avail / after : 1;
        if (Math.abs(r2 - 1) <= 0.03) t.style.transform = `scaleX(${r2.toFixed(4)})`;
      }
    };
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    (fonts?.ready ?? Promise.resolve()).then(fit);
    const ro = new ResizeObserver(() => fit());
    ro.observe(w);
    return () => ro.disconnect();
  }, [effect, text]);

  const enter = React.useCallback(() => {
    const el = wrap.current;
    if (el) requestAnimationFrame(() => requestAnimationFrame(() => (el.dataset.state = "in")));
  }, []);
  useEnterOnce(wrap, enter, { enabled: effect === "rise", rootMargin: "0px 0px -5% 0px" });

  // parallax: the word slides up through its box as the page scrolls
  const [para, setPara] = React.useState(false);
  React.useEffect(() => {
    setPara(effect === "parallax" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && motionLevel() !== "subtle");
  }, [effect]);
  const y = React.useRef(0);
  useScrollEffect(
    wrap,
    {
      read: () => {
        const el = wrap.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vh = viewportHeight();
        const p = Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2)));
        y.current = p * r.height * 0.18;
      },
      write: () => wrap.current?.style.setProperty("--gw-y", `${y.current.toFixed(1)}px`),
    },
    { enabled: para },
  );

  // spotlight: background-clip text gradient following the pointer
  React.useEffect(() => {
    const el = wrap.current;
    if (!el || effect !== "spotlight") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    let mx = 50;
    let my = 50;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width) * 100;
      my = ((e.clientY - r.top) / r.height) * 100;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.setProperty("--mx", `${mx.toFixed(1)}%`);
          el.style.setProperty("--my", `${my.toFixed(1)}%`);
        });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [effect]);

  let i = 0;
  const units =
    effect === "rise"
      ? parts.map((g, k) =>
          /^\s+$/.test(g) ? (
            <span key={k} data-gw-space="" />
          ) : (
            <span key={k} data-gw-mask="">
              <span data-gw-unit="" style={{ "--i": i++ } as React.CSSProperties}>
                {g}
              </span>
            </span>
          ),
        )
      : text;

  return (
    <div
      ref={wrap}
      className={cn("rw-wordmark", className)}
      data-wordmark={effect}
      data-state="idle"
      data-outline={outline ? "" : undefined}
      data-image={image ? "" : undefined}
      data-script={script}
      aria-hidden={decorative ? true : undefined}
      style={{ "--gw-em": em, "--gw-cap": cap, "--gw-img": image ? `url("${image}")` : undefined, "--n": i } as React.CSSProperties}
    >
      {effect === "marquee" ? (
        <div data-gw-marquee="">
          <Tag data-gw-text="" aria-label={!decorative && as === "h2" ? text : undefined}>
            {text}
          </Tag>
          <span data-gw-text="" aria-hidden="true" data-pt={text} />
        </div>
      ) : (
        <Tag ref={textRef} data-gw-text="" aria-label={!decorative && as === "h2" ? text : undefined}>
          {units}
        </Tag>
      )}
    </div>
  );
}
