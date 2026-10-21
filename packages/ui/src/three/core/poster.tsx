/**
 * ScenePoster — server-safe (no "use client") static art used as the fallback of every 3D scene
 * (SSR, reduced motion, no WebGL, low-power, context loss). Layered CSS gradients from theme tokens + optional
 * photo + grain, so it is a deliberate design on its own (§1.7), and it recolours with the tenant theme.
 */
import type * as React from "react";
import type { PosterVariant } from "./types";

const mix = (token: string, pct: number, other = "transparent") => `color-mix(in oklab, var(--${token}) ${pct}%, ${other})`;

export const GRAIN_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const LAYERS: Record<PosterVariant, string[]> = {
  aurora: [
    `radial-gradient(55% 45% at 18% 28%, ${mix("primary", 62)} 0%, transparent 70%)`,
    `radial-gradient(48% 55% at 82% 22%, ${mix("accent", 50)} 0%, transparent 72%)`,
    `radial-gradient(70% 50% at 55% 105%, ${mix("glow", 70)} 0%, transparent 70%)`,
    `conic-gradient(from 200deg at 50% 40%, transparent 0deg, ${mix("primary", 14)} 60deg, transparent 140deg, ${mix("accent", 12)} 250deg, transparent 360deg)`,
  ],
  silk: [
    `radial-gradient(60% 40% at 70% 25%, ${mix("glow", 55)} 0%, transparent 70%)`,
    `repeating-linear-gradient(118deg, transparent 0%, ${mix("foreground", 5)} 6%, transparent 11%, ${mix("primary", 10)} 17%, transparent 23%)`,
    `linear-gradient(160deg, ${mix("primary", 28)} 0%, transparent 45%, ${mix("accent", 22)} 100%)`,
  ],
  mesh: [
    `radial-gradient(50% 50% at 0% 0%, ${mix("primary", 70)} 0%, transparent 100%)`,
    `radial-gradient(50% 50% at 100% 0%, ${mix("accent", 60)} 0%, transparent 100%)`,
    `radial-gradient(55% 55% at 100% 100%, ${mix("glow", 70)} 0%, transparent 100%)`,
    `radial-gradient(55% 55% at 0% 100%, ${mix("surface", 90)} 0%, transparent 100%)`,
  ],
  ocean: [
    `radial-gradient(14% 10% at 68% 58%, ${mix("glow", 95)} 0%, transparent 100%)`,
    `radial-gradient(80% 12% at 50% 62%, ${mix("glow", 55)} 0%, transparent 100%)`,
    `linear-gradient(180deg, ${mix("background", 100)} 0%, ${mix("glow", 30, "var(--background)")} 58%, ${mix("accent", 75, "var(--background)")} 63%, ${mix("accent", 55, "#000")} 100%)`,
  ],
  stage: [
    `conic-gradient(from 168deg at 22% -8%, transparent 0deg, ${mix("primary", 42)} 5deg, transparent 12deg)`,
    `conic-gradient(from 178deg at 50% -10%, transparent 0deg, ${mix("accent", 38)} 4deg, transparent 10deg)`,
    `conic-gradient(from 188deg at 78% -8%, transparent 0deg, ${mix("primary", 42)} 5deg, transparent 12deg)`,
    `radial-gradient(60% 22% at 50% 100%, ${mix("glow", 55)} 0%, transparent 100%)`,
  ],
  ember: [
    `radial-gradient(45% 35% at 50% 105%, ${mix("glow", 85)} 0%, transparent 100%)`,
    `radial-gradient(60% 50% at 50% 100%, ${mix("primary", 50)} 0%, transparent 100%)`,
    `radial-gradient(30% 30% at 25% 20%, ${mix("accent", 18)} 0%, transparent 100%)`,
  ],
  orb: [
    `radial-gradient(circle at 50% 50%, transparent 0 30%, ${mix("glow", 30)} 31%, transparent 46%)`,
    `radial-gradient(circle at 43% 38%, ${mix("glow", 100, "#fff")} 0%, ${mix("primary", 90)} 16%, ${mix("primary", 70, "var(--background)")} 26%, transparent 31%)`,
    `radial-gradient(70% 70% at 50% 50%, ${mix("accent", 18)} 0%, transparent 70%)`,
  ],
  grid: [
    `radial-gradient(60% 30% at 50% 52%, ${mix("primary", 40)} 0%, transparent 100%)`,
    `linear-gradient(180deg, transparent 0%, ${mix("background", 100)} 100%)`,
  ],
  plain: [`radial-gradient(70% 60% at 30% 20%, ${mix("primary", 16)} 0%, transparent 70%)`, `radial-gradient(60% 60% at 80% 90%, ${mix("accent", 12)} 0%, transparent 70%)`],
};

export interface ScenePosterProps {
  variant: PosterVariant;
  /** optional photo laid under the gradients (cinematic crop, object-cover) */
  image?: string;
  imageAlt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** grain opacity 0..0.2 (default 0.06) */
  grain?: number;
  children?: React.ReactNode;
}

export function ScenePoster({ variant, image, imageAlt = "", className, style, grain = 0.06, children }: ScenePosterProps) {
  const layers = LAYERS[variant] ?? LAYERS.plain;
  return (
    <div
      data-scene-poster={variant}
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "var(--background)", isolation: "isolate", ...style }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={imageAlt}
          aria-hidden={imageAlt ? undefined : true}
          loading="lazy"
          decoding="async"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.92 }}
        />
      ) : null}
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: layers.join(","), mixBlendMode: image ? "soft-light" : undefined }} />
      {variant === "grid" ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "-50%",
            right: "-50%",
            bottom: "-10%",
            height: "62%",
            backgroundImage: `linear-gradient(${mix("foreground", 16)} 1px, transparent 1px), linear-gradient(90deg, ${mix("foreground", 16)} 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
            transform: "perspective(520px) rotateX(62deg)",
            transformOrigin: "50% 0%",
            maskImage: "linear-gradient(180deg, transparent 0%, #000 35%, #000 100%)",
            WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 35%, #000 100%)",
          }}
        />
      ) : null}
      {variant === "stage" ? (
        <div aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${mix("background", 0)} 55%, ${mix("background", 85)} 100%)` }} />
      ) : null}
      {grain > 0 ? (
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: GRAIN_URL, backgroundSize: "160px 160px", opacity: grain, mixBlendMode: "overlay", pointerEvents: "none" }} />
      ) : null}
      {children}
    </div>
  );
}
