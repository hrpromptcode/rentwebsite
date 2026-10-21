"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import type { Script, SplitToken } from "./split";
import { useEnterOnce, whenPreloaded } from "./prefs";

export function LetterDropClient({
  text,
  tokens,
  script,
  as = "h2",
  bounce = 0.5,
  trigger = "inView",
  className,
}: {
  text: string;
  tokens: SplitToken[];
  script: Script;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  bounce?: number;
  trigger?: "inView" | "mount";
  className?: string;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const Tag = as as React.ElementType;
  const go = React.useCallback(() => {
    const el = ref.current;
    if (el) requestAnimationFrame(() => requestAnimationFrame(() => (el.dataset.state = "in")));
  }, []);
  useEnterOnce(ref, go, { enabled: trigger === "inView" });
  React.useEffect(() => {
    if (trigger !== "mount") return;
    let live = true;
    whenPreloaded().then(() => live && go());
    return () => {
      live = false;
    };
  }, [trigger, go]);
  let i = 0;
  return (
    <Tag
      ref={ref}
      className={cn("rw-drop", className)}
      data-drop=""
      data-state="idle"
      data-script={script}
      aria-label={/^h[1-6]$/.test(as) ? text : undefined}
      style={{ "--bounce": bounce } as React.CSSProperties}
    >
      {tokens.map((t, k) =>
        t.ws ? (
          t.t
        ) : (
          <span key={k} data-drop-word="">
            {(t.c ?? [t.t]).map((c, j) => (
              <span key={j} data-drop-unit="" style={{ "--i": i++ } as React.CSSProperties}>
                {c}
              </span>
            ))}
          </span>
        ),
      )}
    </Tag>
  );
}
