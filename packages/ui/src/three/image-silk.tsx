"use client";

import * as React from "react";
import { Scene3D } from "./core/scene-3d";
import { KitStyles } from "./core/kit-styles";

export interface ImageSilkProps {
  image: string;
  alt: string;
  /** wind strength 0..1.5 */
  wind?: number;
  pointer?: boolean;
  /** rod = hangs from a thin rod · free = pinned at the two top corners */
  hang?: "rod" | "free";
  /** satin sheen 0..1 (theme glow) */
  sheen?: number;
  /** default "relative h-full w-full" */
  className?: string;
}

const Impl = React.lazy(() => import("./impl/image-silk-scene"));

/** A lookbook photo printed on hanging silk: layered-noise wind, pointer dents that ripple outward, satin sheen. */
export function ImageSilk({ className = "relative h-full w-full", ...props }: ImageSilkProps) {
  return (
    <div className={["rw3d-silk", className].filter(Boolean).join(" ")} role="img" aria-label={props.alt}>
      <KitStyles />
      <Scene3D
        className="absolute inset-0"
        fallback={
          <div className="rw3d-silk" aria-hidden>
            {props.hang !== "free" ? <span className="rw3d-silk-rod" /> : null}
            <div className="rw3d-silk-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={props.image} alt="" loading="lazy" decoding="async" />
            </div>
          </div>
        }
        minTier="mid"
        interactive={false}
        camera={{ fov: 30, position: [0, 0, 8] }}
      >
        <Impl {...props} />
      </Scene3D>
    </div>
  );
}
