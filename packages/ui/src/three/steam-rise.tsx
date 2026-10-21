"use client";

import * as React from "react";
import { Scene3D } from "./core/scene-3d";
import { KitStyles } from "./core/kit-styles";
import type { TokenOrColor } from "./core/types";

export interface SteamRiseProps {
  /** where the steam rises from: bottom edge, centre, or [x, y] in 0..1 of the box */
  origin?: "bottom" | "center" | [number, number];
  density?: number;
  embers?: boolean;
  warmth?: TokenOrColor;
  /** default "absolute inset-0" (transparent overlay for food photos) */
  className?: string;
}

const Impl = React.lazy(() => import("./impl/steam-rise-scene"));

function SteamFallback() {
  return (
    <div className="rw3d-steam" aria-hidden>
      <KitStyles />
      <i />
      <i />
      <i />
    </div>
  );
}

/** Soft curl-noise steam with ember sparks rising over a food photo (transparent canvas). */
export function SteamRise({ className = "absolute inset-0", ...props }: SteamRiseProps) {
  return (
    <Scene3D className={className} fallback={<SteamFallback />} minTier="mid" interactive={false} flat camera={{ fov: 40, position: [0, 0, 6] }} style={{ pointerEvents: "none" }}>
      <Impl {...props} />
    </Scene3D>
  );
}
