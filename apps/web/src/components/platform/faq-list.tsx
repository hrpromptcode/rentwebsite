"use client";

import * as React from "react";

/** Numbered FAQ rows (§4.3 #11): 01…, large questions, glass rows, gradient accent bar + filled gradient icon when open, plus → × rotate, springy height. One open at a time. */
export function FaqList({ items, idPrefix = "faq" }: { items: { q: string; a: string }[]; idPrefix?: string }) {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <ol className="pf-faq grid gap-3">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <li key={i} className="relative" data-open={isOpen ? "true" : "false"}>
            <h3 className="m-0">
              <button
                type="button"
                id={`${idPrefix}-q-${i}`}
                aria-expanded={isOpen}
                aria-controls={`${idPrefix}-a-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="group grid min-h-11 w-full grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-5 py-6 text-start md:grid-cols-[4rem_1fr_auto] md:gap-4 md:px-8 md:py-7"
              >
                <span className="mono-label text-primary" data-script="latin">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-step-2 font-semibold leading-[1.35] transition-colors duration-300 group-hover:text-primary">{f.q}</span>
                <span data-faq-btn="" className="grid size-11 place-items-center rounded-full text-primary group-hover:border-primary/50" aria-hidden="true">
                  <svg data-faq-icon="" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </button>
            </h3>
            <div id={`${idPrefix}-a-${i}`} role="region" aria-labelledby={`${idPrefix}-q-${i}`} data-faq-panel="" hidden={false} inert={!isOpen}>
              <div>
                <p className="max-w-3xl pb-7 pl-[4.25rem] pr-5 text-step-1 leading-[1.75] text-muted-foreground md:pb-9 md:pl-[7rem] md:pr-8">{f.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
