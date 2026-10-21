"use client";

import * as React from "react";
import { Scene3D } from "./core/scene-3d";
import { ScenePoster } from "./core/poster";
import type { TokenOrColor } from "./core/types";

export interface OceanSurfaceProps {
  /** ocean: low camera over Gerstner waves with sun glitter · pool: top-down caustics · ripple: pointer ripples refracting a photo */
  mode: "ocean" | "pool" | "ripple";
  /** ripple mode: the photo to refract (also the poster) */
  image?: string;
  imageAlt?: string;
  sun?: TokenOrColor;
  water?: TokenOrColor;
  sky?: TokenOrColor;
  /** horizon height, 0..1 of the box (ocean) */
  horizon?: number;
  pointerRipples?: boolean;
  /** default "absolute inset-0" */
  className?: string;
}

const Impl = React.lazy(() => import("./impl/ocean-surface-scene"));

/** Water: an analytic ocean at golden hour, a caustic pool from above, or a photo you can ripple with the pointer. */
export function OceanSurface({ className = "absolute inset-0", ...props }: OceanSurfaceProps) {
  const poster =
    props.mode === "ripple" ? (
      <ScenePoster variant="plain" image={props.image} imageAlt="" grain={0.03} />
    ) : (
      <ScenePoster variant={props.mode === "pool" ? "aurora" : "ocean"} grain={0.04} />
    );
  return (
    <Scene3D
      className={className}
      fallback={poster}
      lite={props.mode !== "ocean"}
      minTier="mid"
      flat
      interactive={false}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 1] }}
    >
      <Impl {...props} />
    </Scene3D>
  );
}
