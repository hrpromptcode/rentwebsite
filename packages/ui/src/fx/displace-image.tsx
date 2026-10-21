"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface DisplaceImageProps {
  /** your own <img>/<Image>; or pass src + alt */
  children?: React.ReactNode;
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  sizes?: string;
  loading?: "lazy" | "eager";
  className?: string;
  imgClassName?: string;
  /** max displacement in px (0 → strength on hover) */
  strength?: number;
}

/**
 * Liquid hover distortion (§2.5): SVG feTurbulence + feDisplacementMap ramps 0 → `strength` while hovered. The filter is
 * attached only during the hover (SVG filters are expensive), fine pointers + motion allowed only.
 */
export function DisplaceImage({ children, src, alt = "", width, height, sizes, loading = "lazy", className, imgClassName, strength = 18 }: DisplaceImageProps) {
  const rawId = React.useId();
  const id = `rw-displace-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const wrap = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<SVGFEDisplacementMapElement>(null);
  const turbRef = React.useRef<SVGFETurbulenceElement>(null);

  React.useEffect(() => {
    const el = wrap.current;
    const map = mapRef.current;
    const turb = turbRef.current;
    if (!el || !map || !turb) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let v = 0;
    let target = 0;
    let t0 = 0;
    const loop = (t: number) => {
      if (!t0) t0 = t;
      v += (target - v) * 0.09;
      map.setAttribute("scale", v.toFixed(2));
      const f = 0.012 + Math.sin((t - t0) / 900) * 0.003;
      turb.setAttribute("baseFrequency", `${f.toFixed(4)} ${(f * 1.6).toFixed(4)}`);
      if (Math.abs(target - v) < 0.05 && target === 0) {
        el.style.filter = "";
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const enter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      target = strength;
      el.style.filter = `url(#${id})`;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const leave = () => {
      target = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.style.filter = "";
    };
  }, [id, strength]);

  return (
    <div ref={wrap} className={cn("rw-displace relative overflow-hidden", className)} data-displace="">
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }} focusable="false">
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence ref={turbRef} type="fractalNoise" baseFrequency="0.012 0.019" numOctaves="2" seed="3" result="noise" />
          <feDisplacementMap ref={mapRef} in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {children ??
        (src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} width={width} height={height} sizes={sizes} loading={loading} decoding="async" className={cn("size-full object-cover", imgClassName)} />
        ) : null)}
    </div>
  );
}
