import * as React from "react";
import { SplitReveal } from "./split-reveal";

export { segmentText, glueMaiYamok } from "./split";

/**
 * Word-by-word (Thai-aware) mask reveal for headlines. Kept for back-compat: a thin alias of SplitReveal
 * (`mode="words"`, or `"chars"` for granularity="chars"), which segments on the server and animates on the client.
 */
export interface TextRevealProps {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  /** seconds */
  delay?: number;
  /** seconds between words */
  stagger?: number;
  /** "words" (default) or "chars" */
  granularity?: "words" | "chars";
  /** kept for API compatibility: reveals always play once */
  once?: boolean;
}

export function TextReveal({ text, granularity = "words", as = "h2", className, delay, stagger }: TextRevealProps) {
  return <SplitReveal text={text} as={as} className={className} delay={delay} stagger={stagger} mode={granularity === "chars" ? "chars" : "words"} trigger="inView" />;
}
