"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
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

/** SSR-safe: hidden start state is CSS-only under `motion-safe:`; reduced-motion users see text immediately. */
export function TextRevealClient({ text, parts, as = "h2", className, delay = 0, stagger = 0.045, once = true }: TextRevealClientProps) {
  const reduce = useReducedMotion();
  const Tag = as;
  return (
    <Tag className={cn("inline-block", className)} aria-label={text}>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <span key={i}>{part}</span>;
        return (
          <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.08em] -mb-[0.08em]">
            <motion.span
              className="inline-block will-change-transform motion-safe:translate-y-[110%] motion-safe:opacity-0"
              initial={false}
              whileInView={reduce ? undefined : { y: ["110%", "0%"], opacity: [0, 1], rotate: [2, 0] }}
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
