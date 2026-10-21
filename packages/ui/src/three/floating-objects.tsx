"use client";

import * as React from "react";
import { Scene3D } from "./core/scene-3d";
import { mulberry32, seedFromString } from "./core/random";

export type FloatingSet = "fashion" | "gaming" | "clinic" | "food" | "spa" | "corporate" | "pastry" | "yoga" | "resort" | "events" | "abstract";
export type FloatingMaterial = "auto" | "glass" | "chrome" | "clay" | "pearl" | "satin";

export interface FloatingObjectsProps {
  set: FloatingSet;
  /** auto: glass for clinic/resort, chrome for corporate/gaming/events, clay for pastry/food, satin for fashion/spa/yoga */
  material?: FloatingMaterial;
  /** object count (default by tier: 7–8 high, 5 mid) */
  count?: number;
  layout?: "orbit" | "scatter" | "stack" | "rain";
  pointerParallax?: boolean;
  /** objects drift with page scroll (0..1, depth-scaled) */
  scrollParallax?: number;
  /** poke = tap/click applies a spring impulse; drag = grab and throw (springs home) */
  interactive?: "none" | "poke" | "drag";
  /** keep the centre (where hero copy sits) clear, as a fraction of width (scatter only) */
  clearCenter?: number;
  /** default "absolute inset-0" */
  className?: string;
}

const Impl = React.lazy(() => import("./impl/floating-objects-scene"));

/** Static stand-in: a few soft theme-coloured orbs at seeded positions (no WebGL / reduced motion / low tier). */
function FloatingFallback({ set }: { set: FloatingSet }) {
  const r = mulberry32(seedFromString("fallback:" + set));
  const orbs = Array.from({ length: 4 }, (_, i) => ({ x: 8 + r() * 78, y: 8 + r() * 70, s: 8 + r() * 12, c: ["primary", "accent", "glow", "primary"][i]! }));
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {orbs.map((o, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${o.x}%`,
            top: `${o.y}%`,
            width: `${o.s}vmin`,
            aspectRatio: "1",
            borderRadius: "50%",
            background: `radial-gradient(circle at 34% 30%, color-mix(in oklab, #fff 85%, var(--${o.c})) 0%, var(--${o.c}) 38%, color-mix(in oklab, var(--${o.c}) 55%, var(--background)) 70%, transparent 71%)`,
            boxShadow: `0 30px 60px -24px color-mix(in oklab, var(--${o.c}) 55%, transparent)`,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}

/** Procedural, theme-coloured 3D objects per business (buttons & ribbons, gems & coins, droplets, donuts …) floating with pointer/scroll parallax. */
export function FloatingObjects({ className = "absolute inset-0", ...props }: FloatingObjectsProps) {
  const interactive = (props.interactive ?? "none") !== "none";
  return (
    <Scene3D
      className={className}
      fallback={<FloatingFallback set={props.set} />}
      minTier="mid"
      interactive={interactive}
      eventSource="self"
      camera={{ fov: 35, position: [0, 0, 9] }}
      style={interactive ? undefined : { pointerEvents: "none" }}
    >
      <Impl {...props} />
    </Scene3D>
  );
}
