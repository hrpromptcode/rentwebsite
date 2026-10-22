"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { scrollToTarget } from "./lenis-store";

export interface StoryItem {
  key: string;
  title: string;
  kicker?: string;
  body?: string;
  chips?: string[];
  /** stage content for this step (photo, card, scene…); server-rendered */
  media: React.ReactNode;
  /** free-form tone token rendered as data-tone on the step (lets the page restyle the stage per active step) */
  tone?: string;
}

export interface StickyStoryProps {
  items: StoryItem[];
  /** side of the title list (the stage takes the other side) */
  side?: "left" | "right";
  /** how the stage changes between steps */
  mediaMode?: "crossfade" | "clip" | "stack";
  /** "01 / 05" counter on the stage */
  counter?: boolean;
  /** heading level of the step titles */
  titleAs?: "h2" | "h3" | "h4";
  className?: string;
  /** id prefix for the step anchors (default derived from the first key) */
  idPrefix?: string;
}

/**
 * Fastwork-style sticky story (§3.2): a tall list of step titles (inactive at 25%, the active one at 100% with its
 * kicker / body / chips expanding) beside a CSS-sticky stage whose media crossfades / clips / stacks per active step.
 * Active step = the title crossing the middle band of the viewport (IntersectionObserver, rootMargin −45%/−45%):
 * no scroll handlers, no React state on scroll. < 768px and under reduced motion it becomes plain stacked blocks
 * (title, text, media per step) via CSS. Titles are real buttons that scroll their step into the band.
 */
export function StickyStory({ items, side = "left", mediaMode = "crossfade", counter = true, titleAs = "h3", className, idPrefix }: StickyStoryProps) {
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLElement>(null);
  const prefix = idPrefix ?? `story-${(items[0]?.key ?? "s").replace(/[^a-z0-9_-]/gi, "")}`;
  const Title = titleAs;

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const titles = Array.from(root.querySelectorAll<HTMLElement>("[data-story-item]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(i)) setActive(i);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    titles.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [items.length]);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section ref={rootRef} className={cn("rw-story", className)} data-side={side} data-media-mode={mediaMode} style={{ "--story-n": items.length } as React.CSSProperties}>
      <div data-story-list="">
        {items.map((it, i) => (
          <article key={it.key} id={`${prefix}-${i + 1}`} data-story-item="" data-index={i} data-tone={it.tone || undefined} data-active={i === active ? "true" : "false"}>
            <Title data-story-heading="">
              <button
                type="button"
                data-story-title=""
                aria-current={i === active ? "step" : undefined}
                onClick={() => {
                  const el = document.getElementById(`${prefix}-${i + 1}`);
                  if (el) scrollToTarget(el, { offset: -window.innerHeight * 0.42 });
                  setActive(i);
                }}
              >
                <span data-story-index="" aria-hidden="true">
                  {pad(i + 1)}
                </span>
                <span data-story-title-text="">{it.title}</span>
              </button>
            </Title>
            <div data-story-detail="">
              <div data-story-detail-inner="">
                {it.kicker ? <p data-story-kicker="">{it.kicker}</p> : null}
                {it.body ? <p data-story-body="">{it.body}</p> : null}
                {it.chips?.length ? (
                  <ul data-story-chips="">
                    {it.chips.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
            <div data-story-media-inline="">{it.media}</div>
          </article>
        ))}
      </div>
      <div data-story-stage="">
        <div data-story-frame="">
          {items.map((it, i) => (
            <div key={it.key} data-story-layer="" data-state={i === active ? "in" : i < active ? "past" : "next"} aria-hidden={i === active ? undefined : true}>
              {it.media}
            </div>
          ))}
          {counter ? (
            <p data-story-counter="" aria-hidden="true">
              <span data-story-counter-now="">{pad(active + 1)}</span> / {pad(items.length)}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
