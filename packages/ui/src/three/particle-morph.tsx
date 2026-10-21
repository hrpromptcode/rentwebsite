"use client";

import * as React from "react";
import { Scene3D } from "./core/scene-3d";
import { ScenePoster } from "./core/poster";
import type { TokenOrColor } from "./core/types";

export type ParticleShape =
  | "sphere"
  | "torus"
  | "knot"
  | "crystal-flower"
  | "star"
  | "wave"
  | "globe"
  | { text: string; font?: string; weight?: number }
  | { svgPath: string; viewBox?: string }
  | { image: string; threshold?: number };

export interface ParticleMorphProps {
  shapes: ParticleShape[];
  /** controlled shape index (morphOn "controlled"; implied when set) */
  active?: number;
  /** time-based cycling (seconds per shape) */
  auto?: { interval: number };
  morphOn?: "time" | "scroll" | "controlled";
  /** particle count; default by tier (high 40k / mid 18k) */
  count?: number;
  /** point size (px at 1080p) */
  size?: number;
  /** gradient along the shape (bottom → top) */
  colors?: [TokenOrColor, TokenOrColor];
  /** pointer repulsion strength (0 = off) */
  pointerRepel?: number;
  /** idle spin, rad/s */
  rotate?: number;
  /** extra z thickness for flat shapes (text, svg, image) */
  depth?: number;
  /** default "relative h-full w-full" — the parent sets the size */
  className?: string;
}

const Impl = React.lazy(() => import("./impl/particle-morph-scene"));

/** GPU particle field that morphs between shapes (primitives, a crystal flower, text, SVG paths, images) with a curl-noise swirl. */
export function ParticleMorph({ className = "relative h-full w-full", ...props }: ParticleMorphProps) {
  return (
    <Scene3D className={className} fallback={<ScenePoster variant="orb" />} minTier="mid" interactive={false} camera={{ fov: 40, position: [0, 0, 6.4] }}>
      <Impl {...props} />
    </Scene3D>
  );
}
