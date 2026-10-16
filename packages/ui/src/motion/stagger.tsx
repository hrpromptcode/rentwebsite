"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "motion/react";

export interface StaggerProps extends HTMLMotionProps<"div"> {
  stagger?: number;
  delay?: number;
  once?: boolean;
}

/** Parent: orchestrates a staggered "show" of StaggerItem children once in view (SSR-safe, see Reveal). */
export function Stagger({ children, stagger = 0.08, delay = 0, once = true, ...rest }: StaggerProps) {
  const reduce = useReducedMotion();
  const container: Variants = { show: { transition: { staggerChildren: stagger, delayChildren: delay } } };
  return (
    <motion.div variants={container} initial={false} whileInView={reduce ? undefined : "show"} viewport={{ once, margin: "0px 0px -10% 0px" }} {...rest}>
      {children}
    </motion.div>
  );
}

const item: Variants = {
  show: { opacity: [0, 1], y: [22, 0], scale: [0.98, 1], transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

/** Hidden start state: CSS on `[data-reveal-item]` (globals.css), transform-based so motion's end state clears it. */
export function StaggerItem({ children, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div data-reveal-item="" variants={item} initial={false} {...rest}>
      {children}
    </motion.div>
  );
}
