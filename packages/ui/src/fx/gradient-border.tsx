import * as React from "react";
import { cn } from "../lib/utils";

type GBTag = "div" | "article" | "li" | "section" | "span" | "a";

export type GradientBorderProps = React.HTMLAttributes<HTMLElement> & {
  as?: GBTag;
  href?: string;
  /** border width in px */
  width?: number;
  /** seconds per revolution */
  speed?: number;
  /** CSS colours / var()s around the ring (default primary → accent → glow) */
  colors?: string[];
};

/**
 * Animated conic gradient border (§3.2) for highlighted plans / cards. SERVER component (pure CSS: `@property
 * --rw-angle` spins the gradient; static under reduced motion). Inherits the element's border-radius.
 */
export function GradientBorder({ as = "div", className, width = 1.5, speed = 6, colors, style, children, ...rest }: GradientBorderProps) {
  const Tag = as as React.ElementType;
  const ring = (colors?.length ? colors : ["var(--primary)", "var(--accent)", "var(--glow)"]).join(", ");
  return (
    <Tag
      className={cn("rw-gradient-border", className)}
      data-gradient-border=""
      style={{ "--gb-w": `${width}px`, "--gb-speed": `${speed}s`, "--gb-colors": ring, ...style } as React.CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
