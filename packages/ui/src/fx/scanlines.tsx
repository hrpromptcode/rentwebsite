import * as React from "react";

/** CRT-style scanline overlay (neon preset). */
export function Scanlines() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[55] opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 2px, rgba(255,255,255,0.6) 2px 3px)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[56] h-24 opacity-[0.08] animate-scanline"
        style={{ background: "linear-gradient(to bottom, transparent, var(--accent), transparent)" }}
      />
    </>
  );
}
