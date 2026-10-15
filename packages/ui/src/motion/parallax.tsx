"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

/** Moves children vertically relative to scroll. speed 0.2 = subtle, 0.6 = strong. Negative = opposite. */
export function Parallax({ children, speed = 0.3, className, scale = false }: { children: React.ReactNode; speed?: number; className?: string; scale?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [`${speed * -50}%`, `${speed * 50}%`]);
  const s = useTransform(scrollYProgress, [0, 0.5, 1], [1.08, 1, 1.08]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className} style={{ overflow: "hidden" }}>
      <motion.div style={{ y, scale: scale ? s : 1, willChange: "transform" }}>{children}</motion.div>
    </div>
  );
}
