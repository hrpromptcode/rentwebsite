"use client";

import * as React from "react";

/** Soft radial glow following the mouse (desktop with fine pointer only). */
export function CursorGlow({ size = 520, opacity = 0.18 }: { size?: number; opacity?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let tx = -9999;
    let ty = -9999;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          el.style.transform = `translate3d(${tx - size / 2}px, ${ty - size / 2}px, 0)`;
          raf = 0;
        });
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [size]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[1] hidden rounded-full [pointer:fine]:block"
      style={{
        width: size,
        height: size,
        opacity,
        transform: "translate3d(-9999px,-9999px,0)",
        background: "radial-gradient(circle, var(--glow) 0%, transparent 60%)",
        filter: "blur(30px)",
        transition: "opacity 300ms",
        willChange: "transform",
      }}
    />
  );
}
