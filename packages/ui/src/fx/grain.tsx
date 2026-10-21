import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Film-grain overlay (§2.4): SVG fractal noise, 3–6% opacity, `steps(4)` jitter at ~8 fps (static under reduced
 * motion), pointer-events none, above content (z 45) and below dialogs (z 50). Rendering it replaces the static
 * `[data-grain="true"] body::after` texture. Server-safe (pure markup + CSS).
 */
export function Grain({ opacity = 0.05, animated = true, className }: { opacity?: number; animated?: boolean; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rw-grain", className)}
      data-rw-grain={animated ? "animated" : "static"}
      style={{ "--grain-o": Math.max(0, Math.min(0.12, opacity)) } as React.CSSProperties}
    />
  );
}
