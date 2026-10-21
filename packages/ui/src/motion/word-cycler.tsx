"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { useIsoLayoutEffect } from "./prefs";

export interface WordCyclerProps {
  words: string[];
  /** ms per word */
  interval?: number;
  mode?: "roll" | "blur" | "flip";
  className?: string;
  /** joiner for the screen-reader list (default ", ") */
  srJoin?: string;
}

/**
 * Cycles a word inside a sentence (fastwork "what 你 can do", §3.2). SSR shows words[0]; the slot width animates to
 * each word's measured width so the sentence closes up around it. Screen readers get one static sr-only list
 * ("ร้านค้า, คลินิก, …"); the visible words are aria-hidden CSS generated content (no duplicate DOM text for
 * getByText). Pauses off-screen and in hidden tabs; static under reduced motion.
 */
export function WordCycler({ words, interval = 2200, mode = "roll", className, srJoin = ", " }: WordCyclerProps) {
  const rootRef = React.useRef<HTMLSpanElement>(null);
  const [active, setActive] = React.useState(0);
  const [prev, setPrev] = React.useState(-1);
  const widths = React.useRef<number[]>([]);
  const n = words.length;

  const measure = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.ready = "";
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-cycler-w]"));
    widths.current = els.map((e) => e.getBoundingClientRect().width);
  }, []);

  useIsoLayoutEffect(() => {
    measure();
    const root = rootRef.current;
    const w = widths.current[0];
    if (root && w) root.style.width = `${w}px`;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(() => {
      measure();
      const r = rootRef.current;
      const cur = Number(r?.dataset.active ?? 0);
      const ww = widths.current[cur];
      if (r && ww) r.style.width = `${ww}px`;
    });
    const onResize = () => {
      measure();
      const r = rootRef.current;
      const ww = widths.current[Number(r?.dataset.active ?? 0)];
      if (r && ww) r.style.width = `${ww}px`;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure, n]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || n < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let visible = false;
    let idx = 0;
    const tick = () => {
      const next = (idx + 1) % n;
      setPrev(idx);
      setActive(next);
      idx = next;
      if (root) {
        root.dataset.active = String(next);
        const w = widths.current[next];
        if (w) root.style.width = `${w}px`;
      }
    };
    const play = () => {
      if (!timer && visible && !document.hidden) timer = setInterval(tick, interval);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const io = new IntersectionObserver((e) => {
      visible = !!e[e.length - 1]?.isIntersecting;
      if (visible) play();
      else stop();
    });
    io.observe(root);
    const onVis = () => (document.hidden ? stop() : play());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [n, interval]);

  return (
    <span ref={rootRef} className={cn("rw-cycler", className)} data-cycler={mode} data-active={active}>
      <span className="sr-only">{words.join(srJoin)}</span>
      <span data-cycler-vis="" aria-hidden="true">
        {words.map((w, i) => (
          <span key={i} data-cycler-w="" data-pt={w} data-state={i === active ? "in" : i === prev ? "out" : "wait"} />
        ))}
      </span>
    </span>
  );
}
