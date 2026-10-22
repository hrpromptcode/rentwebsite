"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGroup, motion } from "motion/react";
import { cn } from "@rentweb/ui/lib/utils";
import { CommerceStyles } from "./commerce-styles";

export type ChipItem = { key: string; href: string; label: string; count?: number; current?: boolean };

/**
 * Filter chips with a sliding active pill (§5.0 module pages). Clicking a chip moves the pill at once (optimistic),
 * then the route renders with the same chip active, so the slide reads as one gesture across the navigation.
 * `aria-current="page"` stays on the server's active chip; the chip text is the visible name (+ mono count).
 */
export function CategoryChips({ items, className, ariaLabel, id = "rwc-chips" }: { items: ChipItem[]; className?: string; ariaLabel?: string; id?: string }) {
  const serverActive = items.find((i) => i.current)?.key ?? null;
  const [active, setActive] = React.useState(serverActive);
  React.useEffect(() => setActive(serverActive), [serverActive]);
  const rowRef = React.useRef<HTMLDivElement>(null);

  // keep the active chip in view on narrow screens (no page scroll)
  React.useEffect(() => {
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>("[data-active]");
    if (!row || !el || row.scrollWidth <= row.clientWidth) return;
    const target = el.offsetLeft - row.clientWidth / 2 + el.clientWidth / 2;
    row.scrollTo({ left: Math.max(0, target) });
  }, [serverActive]);

  return (
    <nav aria-label={ariaLabel} className={className}>
      <CommerceStyles />
      <LayoutGroup id={id}>
        <div ref={rowRef} className="rwc-chips -mx-[clamp(1rem,4vw,2.5rem)] px-[clamp(1rem,4vw,2.5rem)] lg:mx-0 lg:px-0">
          {items.map((c) => {
            const on = active === c.key;
            return (
              <Link
                key={c.key}
                href={c.href}
                onClick={() => setActive(c.key)}
                className="rwc-chip"
                data-active={on ? "" : undefined}
                aria-current={c.current ? "page" : undefined}
              >
                {on && <motion.span layoutId="pill" className="rwc-chip-pill" transition={{ type: "spring", stiffness: 380, damping: 32 }} aria-hidden />}
                <span>{c.label}</span>
                {typeof c.count === "number" && <span className={cn("rwc-chip-count")}>{c.count}</span>}
              </Link>
            );
          })}
        </div>
      </LayoutGroup>
    </nav>
  );
}
