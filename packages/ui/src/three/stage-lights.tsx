"use client";

import * as React from "react";
import { Scene3D } from "./core/scene-3d";
import { ScenePoster } from "./core/poster";
import type { TokenOrColor } from "./core/types";

export interface StageLightsProps {
  beams?: number;
  colors?: TokenOrColor[];
  /** volumetric haze + dust motes */
  haze?: boolean;
  /** sweep amount 0..1 */
  sweep?: number;
  /** intensity pulse tempo */
  bpm?: number;
  floor?: "reflect" | "none";
  /** silhouette crowd strip along the bottom */
  crowd?: boolean;
  /** default "absolute inset-0" (transparent: lay it over a photo) */
  className?: string;
}

const Impl = React.lazy(() => import("./impl/stage-lights-scene"));

/** Concert lighting: volumetric beams sweeping from a truss, pulsing to a tempo, with dust, floor reflections and an optional crowd. */
export function StageLights({ className = "absolute inset-0", ...props }: StageLightsProps) {
  return (
    <Scene3D
      className={className}
      fallback={<ScenePoster variant="stage" grain={0} style={{ background: "transparent" }} />}
      minTier="mid"
      interactive={false}
      flat
      camera={{ fov: 50, position: [0, 0, 10] }}
      style={{ pointerEvents: "none" }}
    >
      <Impl {...props} />
    </Scene3D>
  );
}
