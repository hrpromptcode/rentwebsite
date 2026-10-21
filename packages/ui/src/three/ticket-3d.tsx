"use client";

import * as React from "react";
import { Scene3D, type SceneStatus } from "./core/scene-3d";
import { KitStyles } from "./core/kit-styles";

export interface Ticket3DProps {
  title: string;
  date: string;
  venue?: string;
  price?: string;
  code?: string;
  /** iridescent foil */
  holo?: boolean;
  /** drag = spin with inertia (snaps to front) · tilt = follows the pointer · none = float only */
  interactive?: "drag" | "tilt" | "none";
  /** default "relative h-full w-full min-h-[320px]" */
  className?: string;
}

const Impl = React.lazy(() => import("./impl/ticket-3d-scene"));

/** A holographic event ticket with a perforated stub; text drawn with the theme fonts (Thai OK). DOM text mirror for a11y. */
export function Ticket3D({ className = "relative h-full w-full min-h-[320px]", ...props }: Ticket3DProps) {
  const [status, setStatus] = React.useState<SceneStatus>("idle");
  const { title, date, venue, price, code } = props;
  const mode = props.interactive ?? "drag";
  return (
    <div className={["rw3d-ticket", className].filter(Boolean).join(" ")} data-live={status === "live" ? "true" : "false"} data-cursor={mode === "drag" ? "drag" : undefined}>
      <KitStyles />
      <div className="rw3d-sr">
        {[title, date, venue, price, code].filter(Boolean).join(" · ")}
      </div>
      <Scene3D
        className="absolute inset-0"
        fallback={
          <div className="rw3d-ticket" aria-hidden>
            <div className="rw3d-ticket-css">
              <div className="main">
                <span className="meta">{date}</span>
                <strong>{title}</strong>
                <span className="meta">{[venue, price].filter(Boolean).join(" · ")}</span>
              </div>
              <div className="stub">{code || "ADMIT ONE"}</div>
            </div>
          </div>
        }
        minTier="mid"
        interactive={mode !== "none"}
        eventSource="self"
        camera={{ fov: 32, position: [0, 0, 7] }}
        onStatusChange={setStatus}
        style={{ touchAction: mode === "drag" ? "pan-y" : undefined }}
      >
        <Impl {...props} />
      </Scene3D>
    </div>
  );
}
