"use client";

import * as React from "react";
import { Scene3D, type SceneStatus } from "@rentweb/ui/three/core/scene-3d";
import { cn } from "@rentweb/ui/lib/utils";

const OceanImpl = React.lazy(() => import("@rentweb/ui/three/impl/ocean-surface-scene"));

/**
 * The hotel hero's signature moment (docs/design/hi-end-direction.md §5.9): a golden-hour WebGL sea (kit OceanSurface
 * scene, theme colours: sun = glow, water = accent) that fills the LOWER band of the hero photo. Local variant of the
 * kit wrapper whose fallback is transparent: low-tier devices, no WebGL, `data-scene3d="off"` and the server render show
 * the photo only (never a gradient poster pasted over the shore). The band fades in once the first frame is drawn; the
 * CSS mask (see rental-styles `.rw-sea`) melts its horizon into the photo. Pointer moves ripple the water.
 */
export function OceanBand({ horizon = 0.86, className }: { horizon?: number; className?: string }) {
  const [status, setStatus] = React.useState<SceneStatus>("idle");
  return (
    <div aria-hidden className={cn("rw-sea", className)} data-sea={status}>
      <Scene3D
        className="absolute inset-0"
        fallback={<span className="absolute inset-0" />}
        lite={false}
        minTier="mid"
        flat
        interactive={false}
        dpr={[1, 1.5]}
        rootMargin="0px"
        camera={{ position: [0, 0, 1] }}
        onStatusChange={setStatus}
      >
        <OceanImpl mode="ocean" sun="glow" water="accent" sky="glow" horizon={horizon} pointerRipples />
      </Scene3D>
    </div>
  );
}
