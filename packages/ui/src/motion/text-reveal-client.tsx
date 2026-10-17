"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "../lib/utils";

export interface TextRevealClientProps {
  text: string;
  /** pre-segmented parts (computed on the server) */
  parts: string[];
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  delay?: number;
  stagger?: number;
  once?: boolean;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const THAI = /[฀-๿]/;

/**
 * SSR-safe word mask reveal. Hidden start state is CSS on `[data-reveal-word]` (globals.css; motion-allowed + JS only),
 * so reduced-motion / no-JS visitors see the text immediately. The in-view trigger sits on the heading itself:
 * each word starts fully below its overflow-hidden mask, so an IntersectionObserver on the word never fires (RA-03).
 * The mask (`[data-reveal-mask]`, globals.css) is padded on every side and pulled back with equal negative margins, so
 * the line box is unchanged but Thai upper vowels / tone marks (ที่, เปิ้ล) and below vowels (คุณ) that rise above or
 * drop below the em box are not clipped (RESPONSIVE_B2-01). Parts come from Intl.Segmenter, so a mask never splits a
 * grapheme cluster. Thai headings (`data-reveal-thai`) also get a line-height of at least 1.2 on the masks, because display
 * leading (0.95-1) lets the stacked marks of one line collide with the line above.
 */
export function TextRevealClient({ text, parts, as = "h2", className, delay = 0, stagger = 0.045, once = true }: TextRevealClientProps) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  const word: Variants = {
    show: (i: number) => ({
      y: ["140%", "0%"],
      opacity: [0, 1],
      rotate: [2, 0],
      transition: { duration: 0.7, delay: delay + i * stagger, ease: EASE },
    }),
  };
  return (
    <Tag
      className={cn("inline-block", className)}
      aria-label={text}
      data-reveal-thai={THAI.test(text) ? "" : undefined}
      initial={false}
      whileInView={reduce ? undefined : "show"}
      viewport={{ once }}
    >
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <span key={i}>{part}</span>;
        return (
          <span key={i} data-reveal-mask="" className="inline-block overflow-hidden align-bottom">
            <motion.span data-reveal-word="" className="inline-block will-change-transform" variants={word} custom={i} initial={false}>
              {part}
            </motion.span>
          </span>
        );
      })}
    </Tag>
  );
}
