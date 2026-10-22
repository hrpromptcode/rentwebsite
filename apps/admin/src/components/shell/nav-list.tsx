"use client";

import * as React from "react";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rentweb/ui/components/tooltip";
import { cn } from "@rentweb/ui/lib/utils";
import { NavIcon } from "@/lib/icons";
import type { NavGroup } from "@/lib/nav";

/**
 * Sidebar menu with a sliding active indicator: one absolutely positioned pill (coral bar + soft fill) that glides to
 * the `aria-current="page"` link on every route change, plus a faint hover pill that follows the pointer. Both are
 * aria-hidden decoration; until the first measurement the active link paints its own fill (SSR / no JS), and under
 * prefers-reduced-motion the pill jumps instead of gliding (CSS).
 */
export function NavList({ nav, compact, isActive, onNavigate }: { nav: NavGroup[]; compact: boolean; isActive: (href: string) => boolean; onNavigate?: () => void }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const indRef = React.useRef<HTMLSpanElement>(null);
  const hovRef = React.useRef<HTMLSpanElement>(null);
  const activeKey = nav.flatMap((g) => g.items).find((i) => isActive(i.href))?.key ?? "";

  const place = React.useCallback((el: HTMLElement | null, target: HTMLElement | null) => {
    const root = rootRef.current;
    if (!el || !root) return false;
    if (!target) {
      el.dataset.on = "0";
      return false;
    }
    const r = root.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    el.style.setProperty("--x", `${b.left - r.left}px`);
    el.style.setProperty("--y", `${b.top - r.top}px`);
    el.style.setProperty("--w", `${b.width}px`);
    el.style.setProperty("--h", `${b.height}px`);
    el.dataset.on = "1";
    return true;
  }, []);

  const measure = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const on = place(indRef.current, root.querySelector<HTMLElement>('a[aria-current="page"]'));
    root.dataset.ind = on ? "on" : "off";
  }, [place]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure, activeKey, compact]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // the first placement must not glide in from 0,0 — enable transitions one frame later
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset.anim = "1")));
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [measure]);

  const onPointerOver = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const a = (e.target as HTMLElement).closest<HTMLElement>("a[data-nav-item]");
    if (a) place(hovRef.current, a);
  };
  const onPointerLeave = () => {
    if (hovRef.current) hovRef.current.dataset.on = "0";
  };

  return (
    <nav aria-label="เมนูหลัก" className="scroll-thin flex flex-1 flex-col overflow-y-auto px-3 py-4">
      <div ref={rootRef} className="adm-nav relative flex flex-col gap-5" data-ind="off" onPointerOver={onPointerOver} onPointerLeave={onPointerLeave}>
        <span ref={hovRef} className="adm-nav-hover" data-on="0" aria-hidden="true" />
        <span ref={indRef} className="adm-nav-ind" data-on="0" aria-hidden="true" />
        {nav.map((group) => (
          <div key={group.key}>
            {group.label && !compact && <p className="adm-nav-group">{group.label}</p>}
            {group.label && compact && <div className="mx-3 mb-2 h-px bg-border" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const link = (
                  <Link
                    href={item.href}
                    data-nav-item=""
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn("adm-nav-link group", compact && "justify-center px-0")}
                  >
                    <NavIcon name={item.icon} className="adm-nav-icon size-[18px] shrink-0" />
                    {!compact && <span className="truncate">{item.label}</span>}
                    {!compact && item.badge ? <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{item.badge}</span> : null}
                  </Link>
                );
                return (
                  <li key={item.key}>
                    {compact ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
