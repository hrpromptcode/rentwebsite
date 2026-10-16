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
const DEFAULT_DISTANCE = 28;

/**
 * SSR-safe reveal. The hidden start state is plain CSS keyed on `data-reveal` (packages/ui/src/styles/globals.css)
 * and only applies under `prefers-reduced-motion: no-preference` AND `scripting: enabled`, so reduced-motion users,
 * no-JS visitors and crawlers get visible content with zero inline styles; no hydration mismatch either way.
 * The start state uses the `transform` property — the same one motion animates inline — so the inline end state
 * (`opacity: 1; transform: none`) fully replaces it. (Tailwind v4 `translate-*`/`scale-*` classes set the separate
 * CSS `translate`/`scale` properties, which motion never clears — that left every block offset; RA-02.)
 */
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
  distance = DEFAULT_DISTANCE,
  once = true,
  as = "div",
  style,
  ...rest
}: RevealProps) {
  const reduce = useReducedMotion();
  const Comp = ((motion as unknown as Record<string, typeof motion.div>)[as] ?? motion.div) as typeof motion.div;
  return (
    <Comp
      data-reveal={direction}
      style={distance === DEFAULT_DISTANCE ? style : ({ ...style, "--reveal-distance": `${distance}px` } as HTMLMotionProps<"div">["style"])}
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
