import * as React from "react";
import { estimateEm, isThai, scriptOf, splitGraphemes } from "./split";
import { GiantWordmarkClient } from "./giant-wordmark-client";

export interface GiantWordmarkProps {
  text: string;
  /** rise (graphemes rise out of a mask on enter) · parallax · spotlight (pointer-lit, dark presets) · marquee · none */
  effect?: "rise" | "parallax" | "spotlight" | "marquee" | "none";
  /** outlined (text-stroke) letters */
  outline?: boolean;
  /** image clipped into the letters (background-clip: text; not with "rise") */
  image?: string;
  as?: "p" | "div" | "span" | "h2";
  /** purely decorative (the brand name is already elsewhere on the page) → aria-hidden */
  decorative?: boolean;
  /** max font size (CSS); default --step-8 for Latin, 14vw for Thai */
  cap?: string;
  className?: string;
}

/**
 * Full-width brand wordmark (§3.2). Fits its container width with no layout shift: the server sets
 * `font-size: min(cap, 100cqw / estimatedEm)` (container query units; the wrapper is an inline-size container), and the
 * client refines it once after fonts load (≤ 3% → scaleX). Thai never uses negative tracking and caps at 14vw.
 */
export function GiantWordmark({ text, effect = "rise", outline, image, as = "p", decorative = false, cap, className }: GiantWordmarkProps) {
  const thai = isThai(text);
  return (
    <GiantWordmarkClient
      text={text}
      parts={effect === "rise" ? splitGraphemes(text, 14) : []}
      script={scriptOf(text)}
      em={Number((estimateEm(text) * (thai ? 1 : 0.94)).toFixed(3))}
      cap={cap ?? (thai ? "14vw" : "var(--step-8)")}
      effect={image && effect === "rise" ? "none" : effect}
      outline={outline}
      image={image}
      as={as}
      decorative={decorative}
      className={className}
    />
  );
}
