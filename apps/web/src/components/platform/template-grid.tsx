"use client";

import * as React from "react";
import Link from "next/link";
import { RollText } from "@rentweb/ui/motion";
import { Flip, gsap, registerGsap } from "@rentweb/ui/motion/gsap";

export interface GridCard {
  key: string;
  index: number;
  brand: string;
  name: string;
  label: string;
  modules: string[];
  groups: string[];
  presetName: string;
  swatches: string[];
  long: string;
  demoUrl: string;
}

/**
 * /templates grid (§4.4): filter chips reflow the cards with GSAP Flip; two staggered columns (the right column sits
 * 12% lower); each card's long screenshot auto-scrolls inside its 16:10 window on hover / focus. Cards are hooked by
 * `data-tpl-card` (not `data-card`, which the theme's card styles own).
 */
export function TemplateGrid({ cards, filters }: { cards: GridCard[]; filters: { key: string; label: string; count: number }[] }) {
  const [filter, setFilter] = React.useState("all");
  const gridRef = React.useRef<HTMLUListElement>(null);
  const flipState = React.useRef<Flip.FlipState | null>(null);
  const visible = cards.filter((c) => filter === "all" || c.groups.includes(filter));
  const order = new Map(visible.map((c, i) => [c.key, i]));

  const choose = (k: string) => {
    if (k === filter) return;
    const grid = gridRef.current;
    if (grid && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      registerGsap();
      flipState.current = Flip.getState(grid.querySelectorAll("[data-tpl-card]"));
    }
    setFilter(k);
  };

  React.useLayoutEffect(() => {
    const state = flipState.current;
    const grid = gridRef.current;
    if (!state || !grid) return;
    flipState.current = null;
    Flip.from(state, {
      targets: grid.querySelectorAll("[data-tpl-card]"),
      duration: 0.75,
      ease: "expo.out",
      absolute: true,
      stagger: 0.03,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.92, y: 40 }, { opacity: 1, scale: 1, y: 0, duration: 0.7, ease: "expo.out" }),
      onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.92, duration: 0.35, ease: "power2.in" }),
    });
  }, [filter]);

  return (
    <div>
      <div role="toolbar" aria-label="กรองเทมเพลตตามประเภทธุรกิจ" className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => choose(f.key)}
            className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition-colors duration-300 hover:border-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            <RollText>{f.label}</RollText>
            <span className="font-mono text-[0.7rem] opacity-60">{String(f.count).padStart(2, "0")}</span>
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        แสดง {visible.length} เทมเพลต
      </p>

      <ul ref={gridRef} className="mt-14 grid gap-x-8 gap-y-16 md:grid-cols-2 md:pb-[12%]">
        {cards.map((c) => {
          const pos = order.get(c.key);
          const shown = pos !== undefined;
          return (
            <li key={c.key} data-tpl-card="" hidden={!shown} className={shown && pos! % 2 === 1 ? "md:translate-y-[12%]" : ""}>
              <article className="group relative">
                <div className="pf-autoscroll relative aspect-[16/10] overflow-hidden rounded-[1.5rem] bg-card ring-1 ring-border" data-cursor="view" data-cursor-label="ดูเทมเพลต">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.long} alt={`ตัวอย่างหน้าเว็บ ${c.brand}`} className="pf-card-media absolute inset-0 size-full" loading={c.index < 2 ? "eager" : "lazy"} decoding="async" />
                  <span className="mono-label absolute left-4 top-4 rounded-full bg-background/75 px-3 py-1 text-foreground backdrop-blur" data-script="latin">
                    {String(c.index + 1).padStart(2, "0")} — {c.label}
                  </span>
                </div>
                <div className="mt-6 flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <h2 className="text-step-3 font-semibold leading-[1.25]">
                      <Link href={`/templates/${c.key}`} className="after:absolute after:inset-0 after:z-0 after:rounded-[1.5rem] focus-visible:outline-none">
                        {c.brand}
                      </Link>
                    </h2>
                    <p className="mt-1 text-muted-foreground">{c.name}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="flex items-center -space-x-1.5" aria-label={`ชุดสี ${c.presetName}`} role="img">
                        {c.swatches.map((s, i) => (
                          <span key={i} className="size-5 rounded-full ring-2 ring-background" style={{ background: s }} />
                        ))}
                      </span>
                      {c.modules.map((m) => (
                        <span key={m} className="mono-label rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                  <a href={c.demoUrl} target="_blank" rel="noreferrer" className="group/demo relative z-10 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold transition-colors hover:border-foreground">
                    <RollText>ดูเดโมสด</RollText>
                    <span aria-hidden="true" className="transition-transform duration-300 group-hover/demo:-translate-y-0.5 group-hover/demo:translate-x-0.5">
                      ↗
                    </span>
                    <span className="sr-only">{c.brand} (เปิดแท็บใหม่)</span>
                  </a>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
