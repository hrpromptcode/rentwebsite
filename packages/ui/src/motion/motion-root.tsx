"use client";

import * as React from "react";
import { MotionConfig } from "motion/react";

/** Wrap the storefront once: honours the OS reduced-motion preference for every motion component. */
export function MotionRoot({ children, level = "standard" }: { children: React.ReactNode; level?: "subtle" | "standard" | "expressive" }) {
  const transition = level === "subtle" ? { duration: 0.3 } : level === "expressive" ? { duration: 0.7 } : { duration: 0.5 };
  return (
    <MotionConfig reducedMotion="user" transition={transition}>
      {children}
    </MotionConfig>
  );
}
