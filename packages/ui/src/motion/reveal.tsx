"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { cn } from "../lib/utils";

type Direction = "up" | "down" | "left" | "right" | "none" | "scale" | "blur";

export interface RevealProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  direction?: Direction;
  distance?: number;
  once?: boolean;
  /** render as a different element */
  as?: "div" | "section" | "span" | "li" | "article" | "header" | "footer";
}

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * SSR-safe reveal: the hidden start state lives in CSS under `motion-safe:` (so users who prefer
 * reduced motion — and crawlers — get visible content with zero inline styles), and motion animates
 * with explicit keyframes once the element scrolls into view. No hydration mismatch either way.
 */
const HIDDEN: Record<Direction, string> = {
  up: "motion-safe:opacity-0 motion-safe:translate-y-7",
  down: "motion-safe:opacity-0 motion-safe:-translate-y-7",
  left: "motion-safe:opacity-0 motion-safe:translate-x-7",
  right: "motion-safe:opacity-0 motion-safe:-translate-x-7",
  scale: "motion-safe:opacity-0 motion-safe:scale-[0.92]",
  blur: "motion-safe:opacity-0 motion-safe:blur-md motion-safe:translate-y-3",
  none: "motion-safe:opacity-0",
};

function keyframes(direction: Direction, distance: number) {
  switch (direction) {
    case "up":
      return { opacity: [0, 1], y: [distance, 0] };
    case "down":
      return { opacity: [0, 1], y: [-distance, 0] };
    case "left":
      return { opacity: [0, 1], x: [distance, 0] };
    case "right":
      return { opacity: [0, 1], x: [-distance, 0] };
    case "scale":
      return { opacity: [0, 1], scale: [0.92, 1] };
    case "blur":
      return { opacity: [0, 1], filter: ["blur(12px)", "blur(0px)"], y: [distance / 2, 0] };
    default:
      return { opacity: [0, 1] };
  }
}

export function Reveal({
  children,
  delay = 0,
  duration = 0.65,
  direction = "up",
  distance = 28,
  once = true,
  as = "div",
  className,
  ...rest
}: RevealProps) {
  const reduce = useReducedMotion();
  const Comp = ((motion as unknown as Record<string, typeof motion.div>)[as] ?? motion.div) as typeof motion.div;
  return (
    <Comp
      className={cn(HIDDEN[direction], className)}
      initial={false}
      whileInView={reduce ? undefined : keyframes(direction, distance)}
      viewport={{ once, margin: "0px 0px -12% 0px" }}
      transition={{ duration, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Comp>
  );
}
