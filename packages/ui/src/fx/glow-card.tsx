"use client";

import * as React from "react";
import { cn } from "../lib/utils";

type GlowTag = "div" | "article" | "li" | "section" | "a" | "span" | "figure";

export type GlowCardProps = React.HTMLAttributes<HTMLElement> & {
  as?: GlowTag;
  href?: string;
  /** glow radius in px */
  radius?: number;
  /** also light the border */
  border?: boolean;
};

/**
 * Pointer-tracked radial highlight + border glow (§2.5 cards). Writes only `--mx/--my` CSS vars on the element (no
 * React state); colours from --glow / --primary. Works with any card styling: it adds an overlay pseudo-element.
 */
export const GlowCard = React.forwardRef<HTMLElement, GlowCardProps>(function GlowCard(
  { as = "div", className, radius = 320, border = true, style, onPointerMove, onPointerLeave, children, ...rest },
  ref,
) {
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={cn("rw-glow-card", className)}
      data-glow-card={border ? "border" : ""}
      style={{ "--glow-r": `${radius}px`, ...style } as React.CSSProperties}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse") {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--mx", `${(e.clientX - r.left).toFixed(0)}px`);
          e.currentTarget.style.setProperty("--my", `${(e.clientY - r.top).toFixed(0)}px`);
          e.currentTarget.dataset.glow = "on";
        }
        onPointerMove?.(e);
      }}
      onPointerLeave={(e: React.PointerEvent<HTMLElement>) => {
        e.currentTarget.dataset.glow = "off";
        onPointerLeave?.(e);
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
});
