"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import type { Script, SplitToken } from "./split";
import { useEnterOnce, useIsoLayoutEffect, whenPreloaded } from "./prefs";
import { clamp01, useScrollEffect, viewportHeight } from "./scroll-loop";

export type SplitTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div" | "blockquote";
export type SplitMode = "words" | "lines" | "chars";
export type SplitFrom = "mask" | "below" | "blur" | "rotate";
export type SplitTrigger = "mount" | "inView" | "scrub";

export interface SplitRevealClientProps {
  text: string;
  tokens: SplitToken[];
  script: Script;
  as?: SplitTag;
  mode?: SplitMode;
  from?: SplitFrom;
  trigger?: SplitTrigger;
  /** seconds */
  delay?: number;
  /** seconds between units (words/chars) or lines */
  stagger?: number;
  /** seconds per unit */
  duration?: number;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}

const HEADING = /^h[1-6]$/;

/**
 * Client half of SplitReveal: renders the server-made tokens (never re-segments) and animates them with CSS
 * transitions keyed on `data-split-state` (globals: motion.css). The hidden start state only exists under
 * `prefers-reduced-motion: no-preference` + `scripting: enabled`, so reduced-motion users, crawlers and no-JS visitors
 * read the final text from the first paint. Headings carry `aria-label` = full text (split spans are inline-blocks,
 * which would otherwise put spaces between Thai words in accessible names); textContent stays the text, once.
 */
export function SplitRevealClient({
  text,
  tokens,
  script,
  as = "h2",
  mode = "words",
  from = "mask",
  trigger = "inView",
  delay = 0,
  stagger,
  duration,
  className,
  id,
  style,
}: SplitRevealClientProps) {
  const ref = React.useRef<HTMLElement>(null);
  const Tag = as as React.ElementType;

  // unit count + stagger cap (whole cascade ≤ 0.9s; long text animates by line instead)
  let units = 0;
  for (const t of tokens) if (!t.ws) units += mode === "chars" && t.c ? t.c.length : 1;
  const baseStagger = stagger ?? (mode === "chars" ? 0.025 : mode === "lines" ? 0.12 : script === "latin" ? 0.06 : 0.08);
  const effStagger = mode === "lines" ? baseStagger : units > 1 ? Math.min(baseStagger, 0.9 / (units - 1)) : 0;
  const effDuration = duration ?? (mode === "chars" ? 0.8 : 0.9);

  const reveal = React.useCallback(() => {
    const el = ref.current;
    if (!el || el.dataset.splitState === "in") return;
    // two frames: the start state is painted before the transition starts
    requestAnimationFrame(() => requestAnimationFrame(() => el && (el.dataset.splitState = "in")));
  }, []);

  // lines: group words by their rendered line (after webfonts load) and stagger per line
  const [measured, setMeasured] = React.useState(mode !== "lines");
  useIsoLayoutEffect(() => {
    if (mode !== "lines") return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const masks = Array.from(el.querySelectorAll<HTMLElement>("[data-split-mask]"));
      let line = -1;
      let lastTop = -Infinity;
      for (const m of masks) {
        const top = m.offsetTop;
        if (top > lastTop + 2) {
          line++;
          lastTop = top;
        }
        m.querySelectorAll<HTMLElement>("[data-split-unit]").forEach((u) => u.style.setProperty("--i", String(line)));
      }
      el.style.setProperty("--n", String(line + 1));
      setMeasured(true);
    };
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const timeout = new Promise((r) => setTimeout(r, 1200));
    Promise.race([fonts?.ready ?? Promise.resolve(), timeout]).then(measure);
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // mount trigger: wait for the preloader curtain (if any)
  React.useEffect(() => {
    if (trigger !== "mount" || !measured) return;
    let live = true;
    whenPreloaded().then(() => live && reveal());
    return () => {
      live = false;
    };
  }, [trigger, measured, reveal]);

  useEnterOnce(ref, reveal, { enabled: trigger === "inView" && measured });

  // scrub: progress 0→1 while the element travels from 85% to 35% of the viewport
  const reduceRef = React.useRef(false);
  React.useEffect(() => {
    reduceRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (trigger === "scrub" && ref.current) ref.current.dataset.splitState = reduceRef.current ? "in" : "scrub";
  }, [trigger]);
  const progress = React.useRef(0);
  useScrollEffect(
    ref,
    {
      read: () => {
        const el = ref.current;
        if (!el) return;
        const vh = viewportHeight();
        const top = el.getBoundingClientRect().top;
        progress.current = clamp01((vh * 0.85 - top) / (vh * 0.5));
      },
      write: () => ref.current?.style.setProperty("--p", progress.current.toFixed(4)),
    },
    { enabled: trigger === "scrub" && !reduceRef.current },
  );

  let i = 0;
  const children = tokens.map((tok, k) => {
    if (tok.ws) return tok.t;
    if (mode === "chars" && tok.c) {
      return (
        <span key={k} data-split-mask="" data-split-word="">
          {tok.c.map((c, j) => (
            <span key={j} data-split-unit="" style={{ "--i": i++ } as React.CSSProperties}>
              {c}
            </span>
          ))}
        </span>
      );
    }
    return (
      <span key={k} data-split-mask="">
        <span data-split-unit="" style={{ "--i": mode === "lines" ? 0 : i++ } as React.CSSProperties}>
          {tok.t}
        </span>
      </span>
    );
  });

  return (
    <Tag
      ref={ref}
      id={id}
      className={cn("rw-split", className)}
      data-split={mode}
      data-split-from={from}
      data-split-state="idle"
      data-script={script}
      aria-label={HEADING.test(as) ? text : undefined}
      style={
        {
          "--split-delay": `${Math.round(delay * 1000)}ms`,
          "--split-stagger": `${Math.round(effStagger * 1000)}ms`,
          "--split-dur": `${Math.round(effDuration * 1000)}ms`,
          "--n": units,
          ...style,
        } as React.CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
