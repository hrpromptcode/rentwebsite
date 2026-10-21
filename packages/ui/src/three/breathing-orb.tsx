"use client";

import * as React from "react";
import { Scene3D, type SceneStatus } from "./core/scene-3d";
import { KitStyles } from "./core/kit-styles";
import { useCapability } from "./core/use-capability";
import type { TokenOrColor } from "./core/types";

export interface BreathingOrbProps {
  /** seconds: breathe in, hold, breathe out, hold */
  pattern?: [number, number, number, number];
  /** cue labels: in, hold, out */
  cues?: [string, string, string];
  colors?: TokenOrColor[];
  /** surface displacement amount */
  noise?: number;
  showCue?: boolean;
  /** default "relative h-full w-full" */
  className?: string;
}

/** Shared clock between the DOM cue and the scene. */
export interface BreathClock {
  start: number;
  pattern: [number, number, number, number];
}

/** 0..1 lung fullness + phase index (0 in, 1 hold, 2 out, 3 hold) at time `now` (ms). */
export function breathAt(clock: BreathClock, now: number): { value: number; phase: number; phaseProgress: number } {
  const [a, b, c, d] = clock.pattern;
  const total = Math.max(0.1, a + b + c + d);
  const t = ((((now - clock.start) / 1000) % total) + total) % total;
  const ease = (x: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, x))) / 2;
  if (t < a) return { value: ease(t / a), phase: 0, phaseProgress: t / a };
  if (t < a + b) return { value: 1, phase: 1, phaseProgress: (t - a) / Math.max(b, 1e-3) };
  if (t < a + b + c) return { value: 1 - ease((t - a - b) / c), phase: 2, phaseProgress: (t - a - b) / c };
  return { value: 0, phase: 3, phaseProgress: (t - a - b - c) / Math.max(d, 1e-3) };
}

const Impl = React.lazy(() => import("./impl/breathing-orb-scene"));

const RING_C = 2 * Math.PI * 14;

/** A breathing sphere (simplex-displaced, fresnel rim) that guides in–hold–out breathing, with a synced DOM cue + progress ring. */
export function BreathingOrb({ className = "relative h-full w-full", pattern = [4, 4, 6, 2], cues = ["หายใจเข้า", "ค้างไว้", "หายใจออก"], showCue = true, ...props }: BreathingOrbProps) {
  const cap = useCapability();
  const [status, setStatus] = React.useState<SceneStatus>("idle");
  const clock = React.useRef<BreathClock>({ start: 0, pattern });
  clock.current.pattern = pattern;
  const [phase, setPhase] = React.useState(0);
  const ringRef = React.useRef<SVGCircleElement>(null);
  const cssOrb = React.useRef<HTMLDivElement>(null);
  const reduced = cap.ready && cap.reducedMotion;

  React.useEffect(() => {
    if (!cap.ready || reduced) return;
    clock.current.start = performance.now();
    let raf = 0;
    let last = -1;
    const tick = () => {
      const b = breathAt(clock.current, performance.now());
      if (b.phase !== last) {
        last = b.phase;
        setPhase(b.phase);
      }
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_C * (1 - b.phaseProgress));
      if (cssOrb.current) cssOrb.current.style.transform = `translate(-50%,-50%) scale(${(0.82 + b.value * 0.2).toFixed(4)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cap.ready, reduced]);

  const cueText = phase === 0 ? cues[0] : phase === 2 ? cues[2] : cues[1];

  return (
    <div className={["rw3d-breath", className].filter(Boolean).join(" ")}>
      <KitStyles />
      <Scene3D
        className="absolute inset-0"
        fallback={<div ref={cssOrb} className="rw3d-breath-orb" style={{ animation: "none" }} aria-hidden />}
        reducedMotion="poster"
        minTier="mid"
        interactive={false}
        camera={{ fov: 35, position: [0, 0, 7] }}
        onStatusChange={setStatus}
      >
        <Impl {...props} clock={clock} />
      </Scene3D>
      {showCue ? (
        reduced ? (
          <ul className="rw3d-breath-list">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                {cues[i as 0 | 1 | 2]} {pattern[i]} วิ
              </li>
            ))}
          </ul>
        ) : (
          <div className="rw3d-breath-cue" aria-live="off" data-status={status}>
            <svg viewBox="0 0 34 34" aria-hidden>
              <circle cx="17" cy="17" r="14" style={{ stroke: "color-mix(in oklab, var(--foreground) 16%, transparent)" }} />
              <circle ref={ringRef} cx="17" cy="17" r="14" style={{ stroke: "var(--primary)", strokeLinecap: "round", strokeDasharray: RING_C, strokeDashoffset: RING_C }} />
            </svg>
            <span className="t">{cueText}</span>
          </div>
        )
      ) : null}
    </div>
  );
}
