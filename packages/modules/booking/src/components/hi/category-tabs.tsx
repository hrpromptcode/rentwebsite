"use client";

import * as React from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * In-place category tabs for home-page lists (service cards): a sliding pill marks the active tab and the list below
 * (`[data-cat]` items inside the element with `targetId`) is filtered with a short fade — no navigation. Server-rendered
 * list stays complete without JS (all items visible).
 */
export function CategoryTabs({ tabs, targetId, allLabel = "ทั้งหมด", className }: { tabs: Array<{ slug: string; name: string }>; targetId: string; allLabel?: string; className?: string }) {
  const reduce = useReducedMotion();
  const [active, setActive] = React.useState<string>("");
  const items = [{ slug: "", name: allLabel }, ...tabs];

  const pick = (slug: string) => {
    setActive(slug);
    const root = document.getElementById(targetId);
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-cat]").forEach((item) => {
      const show = !slug || item.dataset.cat === slug;
      // grid items wrapped by a stagger cell hide the cell itself (no empty grid slot)
      const el = item.dataset.catHide === "parent" && item.parentElement ? item.parentElement : item;
      if (show && el.hidden) {
        el.hidden = false;
        if (!reduce) el.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 480, easing: "cubic-bezier(.16,1,.3,1)" });
      } else if (!show) el.hidden = true;
    });
  };

  return (
    <LayoutGroup id={`tabs-${targetId}`}>
      <div className={cn("bk-pills -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0", className)}>
        <div role="toolbar" aria-label="หมวดหมู่" aria-controls={targetId} className="mx-auto flex w-max gap-1.5">
          {items.map((t) => {
            const on = t.slug === active;
            return (
              <button
                key={t.slug || "_all"}
                type="button"
                aria-pressed={on}
                onClick={() => pick(t.slug)}
                className={cn("relative inline-flex h-11 shrink-0 items-center rounded-full px-5 text-sm font-medium transition-colors duration-300", on ? "text-primary-foreground" : "text-foreground/75 hover:text-foreground")}
              >
                {on && <motion.span layoutId="cat" aria-hidden className="absolute inset-0 rounded-full bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }} />}
                {!on && <span aria-hidden className="absolute inset-0 rounded-full border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)]" />}
                <span className="relative">{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </LayoutGroup>
  );
}
