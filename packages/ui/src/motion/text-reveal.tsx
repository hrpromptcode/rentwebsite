"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";

/**
 * Word-by-word (Thai-aware via Intl.Segmenter) mask reveal for headlines.
 * Falls back to plain text when reduced motion is requested.
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

function segment(text: string, granularity: "words" | "chars"): string[] {
  try {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new (Intl as any).Segmenter("th", { granularity: granularity === "chars" ? "grapheme" : "word" });
      return Array.from(seg.segment(text), (s: { segment: string }) => s.segment);
    }
  } catch {
    /* ignore */
  }
  return granularity === "chars" ? Array.from(text) : text.split(/(\s+)/);
}

export function TextReveal({ text, as = "h2", className, delay = 0, stagger = 0.045, granularity = "words", once = true }: TextRevealProps) {
  const reduce = useReducedMotion();
  const Tag = as;
  const parts = React.useMemo(() => segment(text, granularity), [text, granularity]);

  if (reduce) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag className={cn("inline-block", className)} aria-label={text}>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <span key={i}>{part}</span>;
        return (
          <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.08em] -mb-[0.08em]">
            <motion.span
              className="inline-block will-change-transform"
              initial={{ y: "110%", opacity: 0, rotate: 2 }}
              whileInView={{ y: "0%", opacity: 1, rotate: 0 }}
              viewport={{ once }}
              transition={{ duration: 0.7, delay: delay + i * stagger, ease: [0.22, 1, 0.36, 1] }}
            >
              {part}
            </motion.span>
          </span>
        );
      })}
    </Tag>
  );
}
