"use client";

import * as React from "react";
import { Scene3D, type SceneStatus } from "./core/scene-3d";
import { KitStyles } from "./core/kit-styles";
import type { TokenOrColor } from "./core/types";

export interface CardStackItem {
  image: string;
  title: string;
  badge?: string;
  href?: string;
}

export interface CardStack3DProps {
  items: CardStackItem[];
  /** fan = spread arc that opens on hover · orbit = circling a glowing portal ring · stack = deck that deals the top card */
  layout?: "fan" | "orbit" | "stack";
  autoplay?: boolean;
  /** synthwave grid floor in the same canvas */
  floor?: "synthgrid" | "none";
  rim?: TokenOrColor;
  ariaLabel?: string;
  /** default "relative h-full w-full min-h-[420px]" */
  className?: string;
}

export interface StackBridge {
  focus: number | null;
  open: (i: number) => void;
  setHovering: (on: boolean) => void;
}

const Impl = React.lazy(() => import("./impl/card-stack-3d-scene"));

/** Holographic game-cover cards (rim light, foil sheen) as a fan, a portal orbit or a dealing deck; links in a DOM mirror. */
export function CardStack3D({ className = "relative h-full w-full min-h-[420px]", ...props }: CardStack3DProps) {
  const { items, ariaLabel } = props;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const [status, setStatus] = React.useState<SceneStatus>("idle");
  const live = status === "live";
  const bridge = React.useRef<StackBridge>(null as unknown as StackBridge);
  if (!bridge.current) {
    bridge.current = {
      focus: null,
      open(i) {
        listRef.current?.querySelector<HTMLAnchorElement>(`a[data-stack-index="${i}"]`)?.click();
      },
      setHovering(on) {
        if (!rootRef.current) return;
        rootRef.current.style.cursor = on ? "pointer" : "";
        rootRef.current.dataset.cursor = on ? "view" : "";
      },
    };
  }
  if (!items.length) return null;
  const n = items.length;
  const mid = (n - 1) / 2;
  // Static fan (reduced motion / no WebGL / poster): the cards overlap more as the count grows and the card width is
  // capped so the hover-spread fan (1 + (n-1)·stepHover card widths) stays inside the box at any count.
  const step = n <= 5 ? 0.46 : Math.max(0.3, 0.46 - (n - 5) * 0.04);
  const stepHover = n <= 4 ? 0.62 : step + 0.08;
  const fanStyle = {
    ["--fan-step" as string]: `${(step * 100).toFixed(1)}%`,
    ["--fan-step-h" as string]: `${(stepHover * 100).toFixed(1)}%`,
    ["--fan-rot" as string]: `${n > 6 ? 5 : 7}deg`,
    ["--fan-w" as string]: `${(92 / (1 + (n - 1) * stepHover)).toFixed(2)}%`,
  } as React.CSSProperties;
  return (
    <div ref={rootRef} className={["rw3d-stack", className].filter(Boolean).join(" ")} data-live={live ? "true" : "false"}>
      <KitStyles />
      <Scene3D className="absolute inset-0" fallback={null} reducedMotion="poster" minTier="mid" eventSource="self" camera={{ fov: 38, position: [0, 0.2, 8] }} onStatusChange={setStatus}>
        <Impl {...props} bridge={bridge.current} />
      </Scene3D>
      <ul ref={listRef} className="rw3d-stack-fan" data-mode={live ? "mirror" : "fan"} aria-label={ariaLabel} style={fanStyle}>
        {items.map((it, i) => {
          const body = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.image} alt="" loading="lazy" decoding="async" draggable={false} />
              {it.badge ? <span className="rw3d-badge">{it.badge}</span> : null}
              <span className="rw3d-cap">{it.title}</span>
            </>
          );
          return (
            <li key={`${it.title}-${i}`} style={{ ["--i" as string]: String(i - mid), ["--a" as string]: String(Math.abs(i - mid)), zIndex: 100 - Math.round(Math.abs(i - mid) * 2) }}>
              {it.href ? (
                <a
                  href={it.href}
                  data-stack-index={i}
                  onFocus={() => {
                    bridge.current.focus = i;
                  }}
                  onBlur={() => {
                    if (bridge.current.focus === i) bridge.current.focus = null;
                  }}
                >
                  {body}
                </a>
              ) : (
                <div className="rw3d-card">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
