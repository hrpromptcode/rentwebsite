"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { RollText } from "./roll-text";
import { scrollToTarget } from "./lenis-store";
import { pageProgress } from "./scroll-progress";
import { useScrollEffect } from "./scroll-loop";

export interface BackToTopProps {
  /** "กลับขึ้นด้านบน" (Thai rolls as a word) or e.g. "BACK TO TOP" (letters roll) */
  label?: string;
  /** circular page-progress ring around the arrow */
  ring?: boolean;
  className?: string;
}

/**
 * Back-to-top control (§3.2): RollText label, arrow inside a page-progress ring, scrolls to the top through Lenis
 * (or native smooth / instant under reduced motion) and moves focus to the top of the document for keyboard users.
 */
export function BackToTop({ label = "กลับขึ้นด้านบน", ring = true, className }: BackToTopProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const p = React.useRef(0);
  useScrollEffect(
    ref,
    {
      read: () => {
        p.current = pageProgress();
      },
      write: () => ref.current?.style.setProperty("--sp", p.current.toFixed(4)),
    },
    { enabled: ring },
  );
  const r = 45;
  const c = 2 * Math.PI * r;
  return (
    <button
      ref={ref}
      type="button"
      className={cn("rw-btt group", className)}
      data-back-to-top=""
      onClick={() => {
        scrollToTarget(0, { duration: 1.4 });
        const target = document.querySelector<HTMLElement>("[data-site-header] a, header a, a[href]");
        target?.focus({ preventScroll: true });
      }}
    >
      <RollText>{label}</RollText>
      <span data-btt-icon="" aria-hidden="true" style={{ "--c": c.toFixed(2) } as React.CSSProperties}>
        {ring ? (
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} data-track="" />
            <circle cx="50" cy="50" r={r} data-bar="" strokeDasharray={c.toFixed(2)} />
          </svg>
        ) : null}
        <svg data-btt-arrow="" viewBox="0 0 24 24" width="16" height="16">
          <path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
