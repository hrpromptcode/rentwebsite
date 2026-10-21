import * as React from "react";
import { scriptOf, tokenize } from "./split";
import { SplitRevealClient, type SplitFrom, type SplitMode, type SplitTag, type SplitTrigger } from "./split-reveal-client";

export type { SplitFrom, SplitMode, SplitTag, SplitTrigger };

export interface SplitRevealProps {
  text: string;
  as?: SplitTag;
  /** words (default) · lines (words grouped by rendered line after fonts load) · chars (graphemes; Thai ≤ 12 only) */
  mode?: SplitMode;
  /** mask (rise out of a Thai-safe mask) · below (rise + fade) · blur · rotate */
  from?: SplitFrom;
  /** inView (default, top hits 85% of the viewport, plays once) · mount (hero; waits for the preloader) · scrub */
  trigger?: SplitTrigger;
  /** seconds */
  delay?: number;
  /** seconds between units / lines; the whole word cascade is capped at 0.9s */
  stagger?: number;
  /** seconds per unit */
  duration?: number;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * Thai-safe split-text reveal (§3.2). SERVER component: segmentation (Intl.Segmenter word / grapheme) happens here,
 * once, and the client only animates — Node and Chrome segment Thai differently, so the client never re-segments.
 * Renders `data-script="thai|latin|mixed"`; the accessible name of a heading is its full text (aria-label).
 */
export function SplitReveal({ text, mode = "words", ...rest }: SplitRevealProps) {
  const tokens = tokenize(text, { chars: mode === "chars" });
  return <SplitRevealClient text={text} tokens={tokens} script={scriptOf(text)} mode={mode} {...rest} />;
}
