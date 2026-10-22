"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Client shell of the platform header: transparent over the hero, white glass after 24px, hides while scrolling down past
 * the first screen and returns on scroll-up; owns the full-screen mobile menu (focus, Escape, scroll lock).
 * All visible content (links, CTA, menu) is server-rendered and passed in as nodes.
 */
export function HeaderShell({ bar, menu, menuLabel = "เมนู", closeLabel = "ปิดเมนู" }: { bar: React.ReactNode; menu: React.ReactNode; menuLabel?: string; closeLabel?: string }) {
  const ref = React.useRef<HTMLElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastY = window.scrollY;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      el.dataset.scrolled = y > 24 ? "true" : "false";
      const down = y > lastY + 4;
      const up = y < lastY - 4;
      if (down && y > window.innerHeight * 0.9) el.dataset.hidden = "true";
      else if (up || y < 80) el.dataset.hidden = "false";
      if (down || up) lastY = y;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // close on navigation; mark the current section's links (aria-current) — links are server-rendered nodes
  React.useEffect(() => {
    setOpen(false);
    const scope = [ref.current, menuRef.current];
    for (const root of scope) {
      root?.querySelectorAll<HTMLAnchorElement>("nav a[href^='/']").forEach((a) => {
        const href = a.getAttribute("href") ?? "";
        const on = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        if (on) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    }
  }, [pathname]);

  React.useEffect(() => {
    const body = document.body;
    if (open) {
      body.setAttribute("data-scroll-locked", "");
      body.style.overflow = "hidden";
      ref.current?.setAttribute("data-hidden", "false");
      const first = menuRef.current?.querySelector<HTMLElement>("a, button");
      requestAnimationFrame(() => first?.focus());
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setOpen(false);
          btnRef.current?.focus();
        }
        if (e.key === "Tab" && menuRef.current) {
          const items = Array.from(menuRef.current.querySelectorAll<HTMLElement>("a, button")).concat(btnRef.current ? [btnRef.current] : []);
          const firstEl = items[0];
          const lastEl = items[items.length - 1];
          if (!firstEl || !lastEl) return;
          if (e.shiftKey && document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          } else if (!e.shiftKey && document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      };
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("keydown", onKey);
        body.removeAttribute("data-scroll-locked");
        body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <>
    <header ref={ref} className="pf-header fixed inset-x-0 top-0 z-50" data-scrolled="false" data-hidden="false">
      <div className="relative z-10 flex h-[var(--header-h)] items-center justify-between gap-4 px-[var(--gutter)]">
        {bar}
        <button
          ref={btnRef}
          type="button"
          className="pf-menu-btn group relative inline-flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-full px-4 text-sm font-semibold md:hidden"
          aria-expanded={open}
          aria-controls="pf-mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          <span>{open ? closeLabel : menuLabel}</span>
          <span className="relative block h-3 w-5" aria-hidden="true">
            <span className={`absolute left-0 top-0.5 h-0.5 w-5 rounded bg-current transition-transform duration-500 ${open ? "translate-y-1 rotate-45" : ""}`} />
            <span className={`absolute bottom-0.5 left-0 h-0.5 w-5 rounded bg-current transition-transform duration-500 ${open ? "-translate-y-1 -rotate-45" : ""}`} />
          </span>
        </button>
      </div>
    </header>
      {/* outside <header>: its backdrop-filter / transform would become the containing block of a fixed overlay */}
      <div
        ref={menuRef}
        id="pf-mobile-menu"
        className="pf-menu fixed inset-0 z-40 flex flex-col overflow-y-auto pt-[var(--header-h)] md:hidden"
        data-lenis-prevent=""
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
        inert={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        {menu}
      </div>
    </>
  );
}
