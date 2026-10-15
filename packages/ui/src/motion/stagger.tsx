"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "motion/react";

const container = (stagger: number, delay: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

const item: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export interface StaggerProps extends HTMLMotionProps<"div"> {
  stagger?: number;
  delay?: number;
  once?: boolean;
}

export function Stagger({ children, stagger = 0.08, delay = 0, once = true, ...rest }: StaggerProps) {
  const reduce = useReducedMotion();
  if (reduce) return <motion.div {...rest}>{children}</motion.div>;
  return (
    <motion.div
      variants={container(stagger, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: "0px 0px -10% 0px" }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={item} {...rest}>
      {children}
    </motion.div>
  );
}
