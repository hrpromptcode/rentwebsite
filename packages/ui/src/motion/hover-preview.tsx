"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface HoverPreviewProps {
  children: React.ReactNode;
  className?: string;
  /** preview width (px); height follows `ratio` */
  width?: number;
  /** width / height (default 16:10) */
  ratio?: number;
  as?: "div" | "ul" | "ol" | "section";
}

/**
 * Floating preview image for list rows (§2.5 projects / events / rooms): any descendant with `data-preview-src`
 * (+ optional `data-preview-alt`) shows that image in a 16:10 frame that follows the pointer with lerp and tilts with
 * its velocity. Fine pointers + motion allowed only; on touch / reduced motion nothing renders. Decorative
 * (aria-hidden) — the rows keep their own text and links.
 */
export function HoverPreview({ children, className, width = 320, ratio = 1.6, as = "div" }: HoverPreviewProps) {
  const rootRef = React.useRef<HTMLElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [enabled, setEnabled] = React.useState(false);
  const Tag = as as React.ElementType;

  React.useEffect(() => {
    setEnabled(window.matchMedia("(hover: hover) and (pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    const box = boxRef.current;
    const img = imgRef.current;
    if (!enabled || !root || !box || !img) return;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let vx = 0;
    let shown = false;
    let raf = 0;
    const h = width / ratio;
    const loop = () => {
      const nx = x + (tx - x) * 0.16;
      const ny = y + (ty - y) * 0.16;
      vx = vx * 0.8 + (nx - x) * 0.2;
      x = nx;
      y = ny;
      const rot = Math.max(-8, Math.min(8, vx * 0.6));
      box.style.transform = `translate3d(${(x - width / 2).toFixed(1)}px,${(y - h / 2).toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg)`;
      if (shown || Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      const row = (e.target as Element | null)?.closest?.("[data-preview-src]") as HTMLElement | null;
      if (row && root.contains(row)) {
        const src = row.dataset.previewSrc!;
        if (img.getAttribute("src") !== src) {
          img.src = src;
          img.alt = "";
        }
        if (!shown) {
          shown = true;
          x = tx;
          y = ty;
          box.dataset.state = "in";
        }
      } else if (shown) {
        shown = false;
        box.dataset.state = "out";
      }
      kick();
    };
    const onLeave = () => {
      shown = false;
      box.dataset.state = "out";
    };
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    // warm the cache
    root.querySelectorAll<HTMLElement>("[data-preview-src]").forEach((r, i) => {
      if (i < 12) {
        const im = new Image();
        im.decoding = "async";
        im.src = r.dataset.previewSrc!;
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled, width, ratio]);

  return (
    <Tag ref={rootRef} className={cn("rw-hover-preview", className)} data-hover-preview-root="">
      {children}
      {enabled ? (
        <div ref={boxRef} data-hover-preview="" data-state="out" aria-hidden="true" style={{ width, height: Math.round(width / ratio) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} alt="" decoding="async" />
        </div>
      ) : null}
    </Tag>
  );
}
