"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { motionLevel, useEnterOnce } from "./prefs";
import { useScrollEffect, viewportHeight } from "./scroll-loop";

export interface ImageRevealProps {
  src?: string;
  alt?: string;
  /** wipe origin */
  from?: "bottom" | "top" | "left" | "right" | "center" | "circle";
  /** inner image scale at the start of the reveal (settles to 1) */
  scaleFrom?: number;
  /** scroll parallax of the image inside its frame (fraction of the frame height, 0 = off; ±12% max) */
  parallax?: number;
  /** LCP / hero image: eager + fetchPriority high; visible from the first paint (only the scale settles) */
  priority?: boolean;
  sizes?: string;
  srcSet?: string;
  width?: number;
  height?: number;
  /** CSS aspect-ratio of the frame, e.g. "4/5" (reserves the box: no layout shift) */
  aspect?: string;
  className?: string;
  imgClassName?: string;
  /** seconds */
  delay?: number;
  /** render your own <img>/<Image> instead of src/alt (it gets the reveal + parallax styling) */
  children?: React.ReactNode;
  /** cursor label zone (fx/cursor), e.g. "view" */
  cursor?: string;
  cursorLabel?: string;
}

/**
 * Clip-path wipe + scale settle on enter (§3.2), optional scroll parallax. The <img> is in the SSR HTML; the hidden
 * start state applies only under `scripting: enabled` + motion allowed, so no-JS / reduced motion see the image at once.
 */
export function ImageReveal({
  src,
  alt = "",
  from = "bottom",
  scaleFrom = 1.18,
  parallax = 0.08,
  priority,
  sizes,
  srcSet,
  width,
  height,
  aspect,
  className,
  imgClassName,
  delay = 0,
  children,
  cursor,
  cursorLabel,
}: ImageRevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const layer = React.useRef<HTMLDivElement>(null);
  const reveal = React.useCallback(() => {
    const el = ref.current;
    if (el) requestAnimationFrame(() => requestAnimationFrame(() => (el.dataset.state = "in")));
  }, []);
  useEnterOnce(ref, reveal, { rootMargin: "0px 0px -10% 0px" });

  const amp = React.useRef(0);
  const [para, setPara] = React.useState(false);
  React.useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lvl = motionLevel();
    const a = reduce || lvl === "subtle" ? 0 : Math.min(Math.abs(parallax), 0.12) * (lvl === "standard" ? 0.6 : 1) * Math.sign(parallax || 1);
    amp.current = a;
    setPara(a !== 0);
  }, [parallax]);
  const layerScale = (1 + Math.min(Math.abs(parallax), 0.12) * 2.2).toFixed(3);
  const y = React.useRef(0);
  useScrollEffect(
    ref,
    {
      read: () => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vh = viewportHeight();
        // -1 (frame below the viewport) … 1 (frame above it)
        const p = Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2)));
        y.current = -p * amp.current * r.height;
      },
      write: () => {
        if (layer.current) layer.current.style.transform = `translate3d(0,${y.current.toFixed(1)}px,0) scale(${layerScale})`;
      },
    },
    { enabled: para },
  );

  return (
    <div
      ref={ref}
      className={cn("rw-img-reveal", className)}
      data-img-reveal={from}
      data-priority={priority ? "" : undefined}
      data-state="idle"
      data-cursor={cursor}
      data-cursor-label={cursorLabel}
      style={{ aspectRatio: aspect, "--reveal-scale": scaleFrom, "--reveal-delay": `${Math.round(delay * 1000)}ms` } as React.CSSProperties}
    >
      <div ref={layer} data-img-layer="" style={parallax ? { transform: `scale(${layerScale})` } : undefined}>
        {children ??
          (src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              srcSet={srcSet}
              sizes={sizes}
              alt={alt}
              width={width}
              height={height}
              loading={priority ? "eager" : "lazy"}
              decoding={priority ? "sync" : "async"}
              fetchPriority={priority ? "high" : undefined}
              className={imgClassName}
            />
          ) : null)}
      </div>
    </div>
  );
}
