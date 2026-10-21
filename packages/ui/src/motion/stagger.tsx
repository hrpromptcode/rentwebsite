"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "motion/react";
import { useRevealOnFocus } from "./reveal";

export interface StaggerProps extends HTMLMotionProps<"div"> {
  stagger?: number;
  delay?: number;
  once?: boolean;
}

/**
 * Parent: orchestrates a staggered "show" of StaggerItem children once in view (SSR-safe, see Reveal). Focus moving into
 * an item before the group was in view shows the group at once (RESPONSIVE_B2-06).
 */
export function Stagger({ children, stagger = 0.08, delay = 0, once = true, onViewportEnter, onFocusCapture, ...rest }: StaggerProps) {
  const reduce = useReducedMotion();
  const { seen, forced, markSeen, revealOnFocus } = useRevealOnFocus();
  const container: Variants = { show: { transition: { staggerChildren: stagger, delayChildren: delay } } };
  return (
    <motion.div
      variants={container}
      initial={false}
      whileInView={reduce || forced ? undefined : "show"}
      animate={!reduce && forced ? "show" : undefined}
      viewport={{ once, margin: "0px 0px -10% 0px" }}
      onViewportEnter={(entry) => {
        markSeen();
        onViewportEnter?.(entry);
      }}
      onFocusCapture={(e) => {
        if (!reduce && !seen()) revealOnFocus();
        onFocusCapture?.(e);
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

const item: Variants = {
  show: { opacity: [0, 1], y: [22, 0], scale: [0.98, 1], transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
};

/** Hidden start state: CSS on `[data-reveal-item]` (globals.css), transform-based so motion's end state clears it. */
export function StaggerItem({ children, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div data-reveal-item="" variants={item} initial={false} {...rest}>
      {children}
    </motion.div>
  );
}
