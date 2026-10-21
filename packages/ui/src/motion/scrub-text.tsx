import * as React from "react";
import { scriptOf, splitWords } from "./split";
import { ScrubTextClient } from "./scrub-text-client";

export interface ScrubTextProps {
  text: string;
  as?: "p" | "h2" | "h3" | "blockquote" | "div";
  className?: string;
  /** viewport fraction where the scrub starts (block top) — default 0.85 */
  start?: number;
  /** viewport fraction where it ends (block bottom) — default 0.3 */
  end?: number;
}

/**
 * Statement paragraph whose words go from 20% to 100% opacity as you scroll (scrub, §3.2). Words are plain inline
 * spans (native Thai line breaking, no masks), segmented on the server. Reduced motion / no JS: fully opaque.
 */
export function ScrubText({ text, ...rest }: ScrubTextProps) {
  return <ScrubTextClient parts={splitWords(text)} script={scriptOf(text)} {...rest} />;
}
