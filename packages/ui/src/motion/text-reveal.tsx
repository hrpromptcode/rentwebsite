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
  let parts: string[] | null = null;
  try {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new (Intl as any).Segmenter("th", { granularity: granularity === "chars" ? "grapheme" : "word" });
      parts = Array.from(seg.segment(text), (s: { segment: string }) => s.segment);
    }
  } catch {
    /* ignore */
  }
  // no Segmenter: never split a base letter from its combining marks (Thai vowels / tone marks are \p{M}).
  parts ??= granularity === "chars" ? (text.match(/\P{M}\p{M}*/gu) ?? []) : text.split(/(\s+)/);
  return granularity === "words" ? glueMaiYamok(parts) : parts;
}

/**
 * Thai typography: the repetition mark ๆ (mai yamok) never starts a line. Every word part is its own inline-block, so
 * "ช้า ๆ" could wrap as "ช้า / ๆ แล้ว…" (demo-salon hero at 390 px). Glue ๆ, and the space before it as a no-break
 * space, onto the preceding word.
 */
const MAI_YAMOK = String.fromCharCode(0x0e46);
const NBSP = String.fromCharCode(0xa0);
export function glueMaiYamok(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (part.startsWith(MAI_YAMOK) && out.length) {
      const space = /^\s+$/.test(out[out.length - 1]!) ? out.pop()! : "";
      if (out.length) {
        out[out.length - 1] += (space ? NBSP : "") + part;
        continue;
      }
      if (space) out.push(space);
    }
    out.push(part);
  }
  return out;
}

export function TextReveal({ text, granularity = "words", ...rest }: TextRevealProps) {
  const parts = segmentText(text, granularity);
  return <TextRevealClient text={text} parts={parts} {...rest} />;
}
