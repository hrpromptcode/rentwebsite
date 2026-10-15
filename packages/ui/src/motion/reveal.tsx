"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

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

function initialFor(direction: Direction, distance: number) {
  switch (direction) {
    case "up":
      return { opacity: 0, y: distance };
    case "down":
      return { opacity: 0, y: -distance };
    case "left":
      return { opacity: 0, x: distance };
    case "right":
      return { opacity: 0, x: -distance };
    case "scale":
      return { opacity: 0, scale: 0.92 };
    case "blur":
      return { opacity: 0, filter: "blur(12px)", y: distance / 2 };
    default:
      return { opacity: 0 };
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
  ...rest
}: RevealProps) {
  const reduce = useReducedMotion();
  const Comp = (motion as unknown as Record<string, typeof motion.div>)[as] ?? motion.div;
  if (reduce) return <Comp {...rest}>{children}</Comp>;
  return (
    <Comp
      initial={initialFor(direction, distance)}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" }}
      viewport={{ once, margin: "0px 0px -12% 0px" }}
      transition={{ duration, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Comp>
  );
}
