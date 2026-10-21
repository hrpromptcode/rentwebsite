"use client";

import * as React from "react";
import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { NavItem } from "@rentweb/db";
import { RollText } from "@rentweb/ui/motion/roll-text";
import { cn } from "@rentweb/ui/lib/utils";
import { navTarget } from "./nav-href";

/**
 * Current tenant path ("/", "/products/abc") from the tenant layout's selected segments — the same router tree on the
 * server and the client (usePathname would differ: /rw/<id>/… on the server, /… in the browser).
 */
export function useTenantPath(): string {
  const segs = useSelectedLayoutSegments().filter((s) => s && !s.startsWith("("));
  return "/" + segs.join("/");
}

/** true when `href` is the current page (exact for "/", prefix match for sections such as /products/…). */
export function isActiveHref(href: string, path: string): boolean {
  if (!href.startsWith("/")) return false;
  const clean = href.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (clean === "/") return path === "/";
  return path === clean || path.startsWith(clean + "/");
}

/**
 * Desktop nav (§6.3): RollText labels with a draw-in underline, an active-page dot that slides between links
 * (`layoutId`), dropdown panels that mask-reveal with a 40ms item stagger (CSS, keyboard via :focus-within).
 */
export function NavLinks({ items, className, itemClass, group = "main" }: { items: NavItem[]; className?: string; itemClass?: string; group?: string }) {
  const path = useTenantPath();
  return (
    <nav className={cn("hidden items-center gap-0.5 md:flex", className)} data-site-nav="">
      {items.map((it, i) => {
        const active = isActiveHref(it.href, path) || !!it.children?.some((c) => isActiveHref(c.href, path));
        const hasChildren = !!it.children?.length;
        return (
          <div key={`${it.href}-${i}`} className="rw-nav-item relative" data-has-children={hasChildren ? "" : undefined}>
            <Link
              href={it.href}
              {...navTarget(it)}
              aria-current={isActiveHref(it.href, path) ? "page" : undefined}
              data-active={active ? "" : undefined}
              className={cn("rw-nav-link", itemClass)}
            >
              <RollText underline>{it.label}</RollText>
              {hasChildren ? <ChevronDown className="rw-nav-chev size-3.5" aria-hidden /> : null}
              {active ? (
                <motion.span
                  layoutId={`rw-nav-dot-${group}`}
                  className="rw-nav-dot"
                  aria-hidden
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
            </Link>
            {hasChildren ? (
              <div className="rw-dropdown">
                <div className="rw-dropdown-panel">
                  {it.children!.map((c, j) => (
                    <Link
                      key={`${c.href}-${j}`}
                      href={c.href}
                      {...navTarget(c)}
                      aria-current={isActiveHref(c.href, path) ? "page" : undefined}
                      className="rw-dropdown-link"
                      style={{ "--i": j } as React.CSSProperties}
                    >
                      <RollText>{c.label}</RollText>
                      <span className="rw-dropdown-arrow" aria-hidden />

                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
