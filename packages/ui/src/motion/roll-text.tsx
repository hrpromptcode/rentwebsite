import * as React from "react";
import { cn } from "../lib/utils";
import { graphemes, isThai } from "./split";

export interface RollTextProps {
  /** the label (a plain string) */
  children: string;
  className?: string;
  /** auto (default): Latin rolls per letter, Thai as one word · chars · word */
  mode?: "auto" | "chars" | "word";
  /** draw an underline left→right on hover / focus */
  underline?: boolean;
}

/**
 * Two-layer roll-over label (§2.5): on hover / keyboard focus of the nearest link, button, `.group` or
 * `[data-roll-group]`, the label rolls up and a copy rolls in (Latin per letter at 12ms stagger, Thai as a whole word —
 * never split into marks). Pure CSS, works in server and client components, no JS.
 *
 * Accessibility / testing: the real text exists ONCE in the DOM — a transparent overlay that is the accessible name,
 * the hit target and the getByText match. The visible glyphs are aria-hidden boxes whose text is CSS generated content
 * (`attr(data-pt)`), so textContent, accessible names and Playwright locators never see a doubled label.
 */
export function RollText({ children, className, mode = "auto", underline }: RollTextProps) {
  const text = String(children ?? "");
  const perChar = mode === "chars" || (mode === "auto" && !isThai(text));
  const units: string[] = [];
  if (perChar) {
    for (const g of graphemes(text)) units.push(g);
  } else {
    units.push(text);
  }
  let i = 0;
  return (
    <span className={cn("rw-roll", className)} data-roll={perChar ? "chars" : "word"} data-roll-underline={underline ? "" : undefined}>
      <span data-roll-text="">{text}</span>
      <span data-roll-vis="" aria-hidden="true">
        {units.map((u, k) =>
          /^\s+$/.test(u) ? (
            <span key={k} data-roll-space="" />
          ) : (
            <span key={k} data-roll-u="" data-pt={u} style={{ "--i": i++ } as React.CSSProperties} />
          ),
        )}
      </span>
    </span>
  );
}
