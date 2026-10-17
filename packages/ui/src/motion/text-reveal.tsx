import * as React from "react";
import { TextRevealClient } from "./text-reveal-client";

/**
 * Word-by-word (Thai-aware via Intl.Segmenter) mask reveal for headlines.
 * Segmentation runs ONCE here (server component) and the parts are passed to the client, because
 * Node's and the browser's ICU dictionaries can split Thai text differently — segmenting on both
 * sides caused hydration mismatches.
 */
export interface TextRevealProps {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  delay?: number;
  stagger?: number;
  /** "words" (default) or "chars" */
  granularity?: "words" | "chars";
  once?: boolean;
}

export function segmentText(text: string, granularity: "words" | "chars" = "words"): string[] {
  try {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new (Intl as any).Segmenter("th", { granularity: granularity === "chars" ? "grapheme" : "word" });
      return Array.from(seg.segment(text), (s: { segment: string }) => s.segment);
    }
  } catch {
    /* ignore */
  }
  // no Segmenter: never split a base letter from its combining marks (Thai vowels / tone marks are \p{M}).
  return granularity === "chars" ? (text.match(/\P{M}\p{M}*/gu) ?? []) : text.split(/(\s+)/);
}

export function TextReveal({ text, granularity = "words", ...rest }: TextRevealProps) {
  const parts = segmentText(text, granularity);
  return <TextRevealClient text={text} parts={parts} {...rest} />;
}
