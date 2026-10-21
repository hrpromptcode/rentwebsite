import * as React from "react";
import { seeded } from "./random";
import { ScatterCardsClient, type ScatterCardLayout } from "./scatter-cards-client";

export interface ScatterCard {
  image: string;
  alt?: string;
  title?: string;
  tag?: string;
  /** small round avatar shown with the title (portfolio-card look) */
  avatar?: string;
}

export interface ScatterCardsProps {
  cards: ScatterCard[];
  /** layout seed: same seed → same composition on server and client */
  seed: string;
  density?: "airy" | "dense";
  /** idle float (CSS keyframes) */
  float?: boolean;
  /** none · in (cards fly in from outside on enter) · out (cards fly outward as the section scrolls away) */
  assemble?: "none" | "in" | "out";
  /** the centred headline */
  children: React.ReactNode;
  className?: string;
  /** min height of the stage (CSS length) */
  minHeight?: string;
}

// desktop anchor slots around a centred headline (x%, y%), sides first; the centre band (x 26–74, y 34–66) stays free
const SLOTS: [number, number][] = [
  [9, 24], [91, 22], [6, 56], [94, 55], [15, 84], [85, 83],
  [30, 15], [70, 16], [32, 88], [68, 88], [21, 42], [79, 62],
];
// phones: 2 cards above and 2 below the headline
const MOBILE_SLOTS: [number, number][] = [
  [20, 11], [76, 9], [24, 90], [78, 88],
];

/**
 * Floating portfolio cards scattered around a centred headline (fastwork-style, §3.2). SERVER component: positions,
 * tilts, depth layers and float timings come from a seeded PRNG here, so SSR and hydration agree. Three depth layers
 * get pointer parallax (4 / 10 / 18px), cards enter with a stagger and can fly outward on scroll-out.
 * Phones show 4 cards (2 top, 2 bottom). The headline always sits above the cards.
 */
export function ScatterCards({ cards, seed, density = "airy", float = true, assemble = "in", children, className, minHeight }: ScatterCardsProps) {
  const r = seeded(seed);
  const max = density === "dense" ? 12 : 8;
  const list = cards.slice(0, max);
  // shuffle slot order deterministically, keep the first 6 (sides) preferred
  const order = SLOTS.map((s, i) => ({ s, k: (i < 6 ? 0 : 1) + r() })).sort((a, b) => a.k - b.k).map((o) => o.s);
  const layouts: ScatterCardLayout[] = list.map((c, i) => {
    const [sx, sy] = order[i % order.length]!;
    const depth = (i + Math.floor(r() * 3)) % 3;
    const [mx, my] = MOBILE_SLOTS[i % MOBILE_SLOTS.length]!;
    const round = (n: number) => Math.round(n * 10) / 10;
    return {
      ...c,
      x: round(sx + (r() - 0.5) * 6),
      y: round(sy + (r() - 0.5) * 6),
      mx: round(mx + (r() - 0.5) * 6),
      my: round(my + (r() - 0.5) * 4),
      mobile: i < 4,
      rot: round((r() - 0.5) * 16),
      depth,
      floatDur: round(6 + r() * 5),
      floatDelay: round(-r() * 6),
    };
  });
  return (
    <ScatterCardsClient cards={layouts} float={float} assemble={assemble} className={className} minHeight={minHeight}>
      {children}
    </ScatterCardsClient>
  );
}
