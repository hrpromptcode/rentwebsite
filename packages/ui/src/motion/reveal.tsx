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

// §2.1 --ease-out-expo
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Shared by Reveal / Stagger: `forced` flips to true when focus lands inside a block before it has been in view, and the
 * block then animates to its shown state via `animate` (whileInView is dropped so it does not replay later).
 */
export function useRevealOnFocus() {
  const seenRef = React.useRef(false);
  const [forced, setForced] = React.useState(false);
  return {
    forced,
    seen: () => seenRef.current || forced,
    markSeen: () => {
      seenRef.current = true;
    },
    revealOnFocus: () => setForced(true),
  };
}
const DEFAULT_DISTANCE = 28;

/**
 * SSR-safe reveal. The hidden start state is plain CSS keyed on `data-reveal` (packages/ui/src/styles/globals.css)
 * and only applies under `prefers-reduced-motion: no-preference` AND `scripting: enabled`, so reduced-motion users,
 * no-JS visitors and crawlers get visible content with zero inline styles; no hydration mismatch either way.
 * The start state uses the `transform` property — the same one motion animates inline — so the inline end state
 * (`opacity: 1; transform: none`) fully replaces it. (Tailwind v4 `translate-*`/`scale-*` classes set the separate
 * CSS `translate`/`scale` properties, which motion never clears — that left every block offset; RA-02.)
 * Keyboard focus entering a block that has not revealed yet (e.g. Tab stops at the bottom edge of the viewport, inside
 * the excluded in-view band) reveals it immediately, so a focused control is never invisible (RESPONSIVE_B2-06).
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
  duration = 0.9,
  direction = "up",
  distance = DEFAULT_DISTANCE,
  once = true,
  as = "div",
  style,
  onViewportEnter,
  onFocusCapture,
  ...rest
}: RevealProps) {
  const reduce = useReducedMotion();
  const { seen, forced, markSeen, revealOnFocus } = useRevealOnFocus();
  const target = keyframes(direction, distance);
  const Comp = ((motion as unknown as Record<string, typeof motion.div>)[as] ?? motion.div) as typeof motion.div;
  return (
    <Comp
      data-reveal={direction}
      style={distance === DEFAULT_DISTANCE ? style : ({ ...style, "--reveal-distance": `${distance}px` } as HTMLMotionProps<"div">["style"])}
      initial={false}
      whileInView={reduce || forced ? undefined : target}
      animate={!reduce && forced ? target : undefined}
      viewport={{ once, margin: "0px 0px -12% 0px" }}
      onViewportEnter={(entry) => {
        markSeen();
        onViewportEnter?.(entry);
      }}
      onFocusCapture={(e) => {
        if (!reduce && !seen()) revealOnFocus();
        onFocusCapture?.(e);
      }}
      transition={{ duration, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Comp>
  );
}
