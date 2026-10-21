"use client";

import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";

export interface SwitchQuote {
  quote: string;
  name: string;
  role?: string;
  avatar?: string;
  rating: number;
}

/**
 * Spotlight testimonial: one giant quote at a time + an avatar switcher (tabs). Every quote is in the SSR HTML (the
 * inactive ones `hidden`), so crawlers and no-JS readers get all of them; auto-advances every 7s while visible and
 * not hovered / focused (never under reduced motion).
 */
export function QuoteSwitcher({ items, children, className }: { items: SwitchQuote[]; children: React.ReactNode[]; className?: string }) {
  const [active, setActive] = React.useState(0);
  const root = React.useRef<HTMLDivElement>(null);
  const paused = React.useRef(false);
  const n = items.length;
  const baseId = React.useId();

  React.useEffect(() => {
    if (n < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    const io = new IntersectionObserver((es) => (visible = es.some((e) => e.isIntersecting)));
    if (root.current) io.observe(root.current);
    const t = window.setInterval(() => {
      if (visible && !paused.current && !document.hidden) setActive((a) => (a + 1) % n);
    }, 7000);
    return () => {
      window.clearInterval(t);
      io.disconnect();
    };
  }, [n]);

  return (
    <div
      ref={root}
      className={className}
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      onFocusCapture={() => (paused.current = true)}
      onBlurCapture={() => (paused.current = false)}
    >
      {children.map((c, i) => (
        <div key={i} id={`${baseId}-p${i}`} role={n > 1 ? "tabpanel" : undefined} aria-labelledby={n > 1 ? `${baseId}-t${i}` : undefined} hidden={i !== active} className={cn(i === active && "rw-fade")}>
          {c}
        </div>
      ))}
      {n > 1 && (
        <div role="tablist" aria-label="เลือกรีวิว" className="mt-10 flex flex-wrap items-center gap-3 md:mt-14">
          {items.map((it, i) => (
            <button
              key={i}
              id={`${baseId}-t${i}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls={`${baseId}-p${i}`}
              onClick={() => setActive(i)}
              className={cn(
                "group relative flex min-h-11 items-center gap-3 rounded-full border py-1.5 pr-4 pl-1.5 text-left text-sm transition-colors duration-300",
                i === active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50",
              )}
            >
              {it.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.avatar} alt="" className="size-9 rounded-full object-cover" loading="lazy" />
              ) : (
                <span aria-hidden className={cn("flex size-9 items-center justify-center rounded-full font-heading", i === active ? "bg-background/15" : "bg-primary-soft text-primary")}>
                  {it.name.slice(0, 1)}
                </span>
              )}
              <span className="max-w-[10rem] truncate font-medium">{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
