"use client";

import * as React from "react";
import { Scene3D, type SceneStatus } from "./core/scene-3d";
import { KitStyles } from "./core/kit-styles";
import { useSectionProgress } from "./core/use-section-progress";
import { cssColor, type TokenOrColor } from "./core/types";

export interface TunnelStep {
  kicker?: string;
  title: string;
  body?: string;
  image?: string;
}

export interface WormholeTunnelProps {
  steps: TunnelStep[];
  tint?: TokenOrColor;
  wireframe?: boolean;
  rings?: number;
  stars?: boolean;
  /** scroll length of the section: 200 / 300 / 400 svh */
  length?: "short" | "normal" | "long";
  /** accessible name of the steps list */
  ariaLabel?: string;
  className?: string;
}

const Impl = React.lazy(() => import("./impl/wormhole-tunnel-scene"));

const pad2 = (n: number) => String(n).padStart(2, "0");

/** CSS fallback: concentric rings flying toward the viewer as you scroll (no WebGL / low tier). */
function TunnelRings({ progress, live }: { progress: React.MutableRefObject<number>; live: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || live) return;
    let raf = 0;
    const rings = Array.from(el.children) as HTMLElement[];
    const total = 3600;
    const tick = () => {
      const p = progress.current;
      rings.forEach((r, k) => {
        const z = ((k * (total / rings.length) + p * total * 1.6) % total) - total + 500;
        r.style.setProperty("--z", `${z.toFixed(0)}px`);
        r.style.setProperty("--o", String(Math.max(0, Math.min(1, (z + total) / total))));
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [progress, live]);
  return (
    <div ref={ref} className="rw3d-tunnel-rings" aria-hidden>
      {Array.from({ length: 14 }, (_, k) => (
        <i key={k} style={{ ["--z" as string]: `${-k * 257}px` }} />
      ))}
    </div>
  );
}

/**
 * Wireframe wormhole the camera flies through as the section scrolls (sticky 100svh stage); each step is a tilted
 * floating card along the path and its text crossfades in a DOM overlay. The <ol> of steps is the accessible content
 * (and the whole layout under reduced motion).
 */
export function WormholeTunnel({ steps, tint = "primary", wireframe = true, rings = 48, stars = true, length = "normal", ariaLabel, className }: WormholeTunnelProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(rootRef, { start: "top top", end: "bottom bottom" });
  const [active, setActive] = React.useState(0);
  const [status, setStatus] = React.useState<SceneStatus>("idle");
  const n = steps.length;

  React.useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      const i = Math.min(n - 1, Math.max(0, Math.floor(progress.current * n * 0.999)));
      if (i !== last) {
        last = i;
        setActive(i);
      }
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      if (e?.isIntersecting) raf = requestAnimationFrame(tick);
    });
    if (rootRef.current) io.observe(rootRef.current);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [n, progress]);

  if (!n) return null;
  const live = status === "live";

  return (
    <div ref={rootRef} className={["rw3d-tunnel", className].filter(Boolean).join(" ")} data-length={length} style={{ ["--rw3d-tint" as string]: cssColor(tint) }}>
      <KitStyles />
      <div className="rw3d-tunnel-stage">
        <Scene3D
          className="absolute inset-0"
          fallback={<TunnelRings progress={progress} live={live} />}
          reducedMotion="poster"
          minTier="mid"
          interactive={false}
          rootMargin="400px"
          camera={{ fov: 62, position: [0, 0, 0], near: 0.05, far: 80 }}
          onStatusChange={setStatus}
        >
          <Impl steps={steps} tint={tint} wireframe={wireframe} rings={rings} stars={stars} progress={progress} />
        </Scene3D>
        <div className="rw3d-tunnel-scrim" aria-hidden />
        <div className="rw3d-tunnel-overlay" aria-hidden>
          {steps.map((s, i) => (
            <div key={i} className="rw3d-tunnel-step" data-active={i === active ? "true" : "false"}>
              <span className="k">
                {pad2(i + 1)} / {pad2(n)}
                {s.kicker ? ` · ${s.kicker}` : ""}
              </span>
              <h3>{s.title}</h3>
              {s.body ? <p>{s.body}</p> : null}
            </div>
          ))}
        </div>
        <div className="rw3d-tunnel-progress" aria-hidden>
          {steps.map((_, i) => (
            <b key={i} data-on={i <= active ? "true" : "false"} />
          ))}
        </div>
      </div>
      <ol className="rw3d-tunnel-list rw3d-sr" aria-label={ariaLabel}>
        {steps.map((s, i) => (
          <li key={i}>
            <span className="n">{pad2(i + 1)}</span>
            {s.kicker ? <small>{s.kicker}</small> : null}
            <h3>{s.title}</h3>
            {s.body ? <p>{s.body}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
