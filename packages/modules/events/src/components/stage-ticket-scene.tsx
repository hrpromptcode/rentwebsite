"use client";

import * as React from "react";
import { Scene3D, ScenePoster } from "@rentweb/ui/three";

/*
 * Maker Yard signature scene (§5.10): volumetric stage beams sweeping over the dimmed hero photo + a holographic
 * Ticket3D of the featured event, rendered in ONE canvas (max one live WebGL canvas per viewport). The kit's two scene
 * implementations are composed inside a single Scene3D host; the ticket is placed by the box's aspect (right of the
 * copy on desktop, above it on phones). Drag spins the ticket (inertia, snaps to the front), the foil catches the beams.
 * Fallback (SSR / no WebGL / low tier / scene3d=off / reduced motion — the canvas-drawn ticket face may not be ready in a
 * single static frame): the kit's stage poster + a CSS holo ticket.
 */

const Lights = React.lazy(() => import("@rentweb/ui/three/impl/stage-lights-scene"));
const Ticket = React.lazy(() => import("@rentweb/ui/three/impl/ticket-3d-scene"));

const HALF_H = 10 * Math.tan((25 * Math.PI) / 180); // camera fov 50 at z = 10 → half the visible height at z = 0

export interface StageTicketSceneProps {
  title: string;
  date: string;
  venue?: string;
  price?: string;
  code?: string;
  /** beam colours (theme tokens) */
  colors?: string[];
  /** auto = right of the copy on wide boxes, above it on narrow ones · center = middle of the box (framed media) */
  placement?: "auto" | "center";
  className?: string;
}

export function StageTicketScene({ title, date, venue, price, code, colors = ["primary", "accent"], placement = "auto", className = "absolute inset-0" }: StageTicketSceneProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBox((b) => (b && Math.abs(b.w - r.width) < 2 && Math.abs(b.h - r.height) < 2 ? b : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wide = placement === "auto" && !!box && box.w >= 900 && box.w / box.h >= 1.05;
  const aspect = box ? box.w / box.h : 1.6;
  const halfW = HALF_H * aspect;
  const position: [number, number, number] = wide ? [halfW * 0.5, 0.45, 0] : placement === "center" ? [0, 0.2, 0] : [0, HALF_H * 0.4, 0];
  const scale = wide ? 1.08 : placement === "center" ? 0.95 : 0.86;

  const fallback = (
    <div className="absolute inset-0" aria-hidden>
      <ScenePoster variant="stage" grain={0} style={{ background: "transparent" }} />
      <div className="ev-float absolute inset-0">
        <div className="ev-css-ticket" data-placement={placement}>
          <div className="flex min-w-0 flex-col justify-between p-[6%]">
            <span className="text-[clamp(.6rem,.9vw,.85rem)] font-medium opacity-80">{date}</span>
            <strong className="font-heading text-[clamp(1.1rem,2.4vw,2.4rem)] leading-[1.05] font-bold">{title}</strong>
            <span className="truncate text-[clamp(.55rem,.85vw,.8rem)] opacity-85">{[venue, price].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="ev-perf-v flex items-center justify-center border-current/40">
            <span className="ev-mono [writing-mode:vertical-rl] opacity-85">{code || "ADMIT ONE"}</span>
          </div>
          <span className="ev-holo" />
        </div>
      </div>
    </div>
  );

  return (
    <div ref={ref} className={className} data-ev-stage="">
      <Scene3D
        className="absolute inset-0"
        fallback={fallback}
        minTier="mid"
        reducedMotion="poster"
        interactive
        eventSource="self"
        flat
        camera={{ fov: 50, position: [0, 0, 10] }}
        style={{ touchAction: "pan-y" }}
        overlay={
          <div
            aria-hidden
            data-cursor="drag"
            data-cursor-label="ลาก"
            className={wide ? "absolute top-[22%] right-[7%] h-[46%] w-[36%]" : placement === "center" ? "absolute inset-x-[8%] top-[30%] h-[40%]" : "absolute top-[16%] right-[8%] left-[8%] h-[24%]"}
          />
        }
      >
        {/* the truss sits just above the frame: beams enter from off-screen, flares never sit behind the header */}
        {React.createElement("group", { position: [0, 0.75, 0] }, <Lights beams={6} colors={colors} haze sweep={0.4} bpm={112} floor="none" />)}
        {box &&
          React.createElement(
            "group",
            { position, scale },
            <Ticket title={title} date={date} venue={venue} price={price} code={code} holo interactive="drag" />,
          )}
      </Scene3D>
    </div>
  );
}
