import * as React from "react";
import { cn } from "../lib/utils";

/** Soft blurred blobs breathing slowly — uses theme colors. */
export function GradientMesh({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute -top-1/4 -left-1/4 size-[70vmax] rounded-full bg-primary/30 blur-[120px] animate-breathe" />
      <div className="absolute -right-1/4 top-1/4 size-[60vmax] rounded-full bg-accent/25 blur-[120px] animate-breathe [animation-delay:-3s]" />
      <div className="absolute bottom-[-30%] left-1/3 size-[55vmax] rounded-full bg-glow/40 blur-[140px] animate-breathe [animation-delay:-6s]" />
    </div>
  );
}

/** Organic morphing blobs (candy / zen). */
export function Blobs({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute -top-20 -left-10 h-[46vmax] w-[46vmax] bg-primary/25 blur-2xl animate-blob" />
      <div className="absolute top-1/3 -right-24 h-[40vmax] w-[40vmax] bg-accent/30 blur-2xl animate-blob [animation-delay:-5s]" />
      <div className="absolute -bottom-24 left-1/4 h-[36vmax] w-[36vmax] bg-glow/40 blur-2xl animate-blob [animation-delay:-9s]" />
    </div>
  );
}

/** Northern-lights style moving bands. */
export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute inset-[-40%] opacity-60 blur-3xl animate-spin-slow"
        style={{
          background:
            "conic-gradient(from 90deg at 50% 50%, var(--primary) 0deg, transparent 90deg, var(--accent) 180deg, transparent 270deg, var(--glow) 360deg)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background" />
    </div>
  );
}

/** Blueprint grid with radial fade (quartz / studio). */
export function GridPattern({ className, size = 48 }: { className?: string; size?: number }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]", className)}
      style={{
        backgroundImage:
          "linear-gradient(to right, color-mix(in oklab, var(--foreground) 10%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 10%, transparent) 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}

/** Layered animated waves at the bottom of a hero. */
export function Waves({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-[32vh] overflow-hidden", className)}>
      {[0, 1, 2].map((i) => (
        <svg
          key={i}
          className="absolute bottom-0 left-0 h-full w-[200%] animate-marquee"
          style={{ animationDuration: `${26 + i * 10}s`, opacity: 0.35 - i * 0.1 }}
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          <path
            fill={i === 0 ? "var(--primary)" : i === 1 ? "var(--accent)" : "var(--glow)"}
            d="M0,192L48,176C96,160,192,128,288,133.3C384,139,480,181,576,186.7C672,192,768,160,864,138.7C960,117,1056,107,1152,122.7C1248,139,1344,181,1392,202.7L1440,224L1440,320L0,320Z M1440,192L1488,176C1536,160,1632,128,1728,133.3C1824,139,1920,181,2016,186.7C2112,192,2208,160,2304,138.7C2400,117,2496,107,2592,122.7C2688,139,2784,181,2832,202.7L2880,224L2880,320L1440,320Z"
          />
        </svg>
      ))}
    </div>
  );
}

/** Warm gradient with film-noise texture (ember). */
export function NoiseGradient({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--primary)_30%,transparent),transparent_60%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklab,var(--accent)_25%,transparent),transparent_55%)]" />
      <svg className="absolute inset-0 size-full opacity-[0.12] mix-blend-multiply dark:mix-blend-screen" aria-hidden>
        <filter id="rw-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#rw-noise)" />
      </svg>
    </div>
  );
}
