"use client";

import * as React from "react";
import { Scene3D } from "./core/scene-3d";
import { ScenePoster } from "./core/poster";
import type { PosterVariant, TokenOrColor } from "./core/types";

export type ShaderBackdropVariant = "aurora" | "silk" | "mesh" | "grain-gradient" | "ember" | "caustics";

export interface ShaderBackdropProps {
  variant: ShaderBackdropVariant;
  /** up to 4 colours (tokens or CSS colours); default ["primary","accent","glow","background"] */
  colors?: TokenOrColor[];
  speed?: number;
  intensity?: number;
  /** pointer bends the flow locally */
  pointer?: boolean;
  /** film grain amount 0..0.2 */
  grain?: number;
  /** default "absolute inset-0" (fills the positioned parent) */
  className?: string;
}

const POSTER: Record<ShaderBackdropVariant, PosterVariant> = {
  aurora: "aurora",
  silk: "silk",
  mesh: "mesh",
  "grain-gradient": "mesh",
  ember: "ember",
  caustics: "aurora",
};

const Impl = React.lazy(() => import("./impl/shader-backdrop-scene"));

/** Full-bleed animated shader background (fbm aurora, silk folds, mesh gradient, ember, caustics). Cheap: runs on mid tier and in "lite" mode. */
export function ShaderBackdrop({ className = "absolute inset-0", ...props }: ShaderBackdropProps) {
  return (
    <Scene3D
      className={className}
      fallback={<ScenePoster variant={POSTER[props.variant] ?? "aurora"} grain={props.grain ?? 0.05} />}
      lite
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
