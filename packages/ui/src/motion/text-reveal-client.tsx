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

/**
 * SSR-safe word mask reveal. Hidden start state is CSS on `[data-reveal-word]` (globals.css; motion-allowed + JS only),
 * so reduced-motion / no-JS visitors see the text immediately. The in-view trigger sits on the heading itself:
 * each word starts fully below its overflow-hidden mask, so an IntersectionObserver on the word never fires (RA-03).
 */
export function TextRevealClient({ text, parts, as = "h2", className, delay = 0, stagger = 0.045, once = true }: TextRevealClientProps) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  const word: Variants = {
    show: (i: number) => ({
      y: ["110%", "0%"],
      opacity: [0, 1],
      rotate: [2, 0],
      transition: { duration: 0.7, delay: delay + i * stagger, ease: EASE },
    }),
  };
  return (
    <Tag className={cn("inline-block", className)} aria-label={text} initial={false} whileInView={reduce ? undefined : "show"} viewport={{ once }}>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <span key={i}>{part}</span>;
        return (
          <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.08em] -mb-[0.08em]">
            <motion.span data-reveal-word="" className="inline-block will-change-transform" variants={word} custom={i} initial={false}>
              {part}
            </motion.span>
          </span>
        );
      })}
    </Tag>
  );
}
