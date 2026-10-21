import * as React from "react";
import { scriptOf, tokenize } from "./split";
import { LetterDropClient } from "./letter-drop-client";

export interface LetterDropProps {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  /** 0 (plain drop) … 1 (big bounce + squash) */
  bounce?: number;
  trigger?: "inView" | "mount";
  className?: string;
}

/**
 * Playful bouncing title (fastwork "pe-o-ple", §3.2): graphemes drop in with a spring and squash on landing. Latin
 * per letter; Thai per grapheme cluster only for ≤ 12 graphemes (longer Thai drops word by word). Segmented on the
 * server; the final text is visible without JS and under reduced motion.
 */
export function LetterDrop({ text, ...rest }: LetterDropProps) {
  return <LetterDropClient text={text} tokens={tokenize(text, { chars: true })} script={scriptOf(text)} {...rest} />;
}
