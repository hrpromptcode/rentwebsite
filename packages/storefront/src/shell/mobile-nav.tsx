"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Mail, Phone } from "lucide-react";
import type { NavItem } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@rentweb/ui/components/sheet";
import { LiveClock } from "@rentweb/ui/motion/live-clock";
import { RollText } from "@rentweb/ui/motion/roll-text";
import { cn } from "@rentweb/ui/lib/utils";
import { navTarget } from "./nav-href";
import { isActiveHref, useTenantPath } from "./nav-links";
import { LineIcon, SocialIcon, type ShellContact } from "./social";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Menu (§6.3). Keeps the Radix Sheet (focus trap, Esc, the "เปิดเมนู" trigger name) but opens as a full-screen
 * panel in `--foreground` (or `--primary` on playful presets) that grows out of the trigger as a circle
 * (`clip-path: circle()`, 600ms --ease-in-out-circ). Links at --step-4 rise out of masks with a 50ms stagger and a
 * mono index; the bottom holds the CTA, contact lines, social links and a live clock. The trigger is phone-only unless
 * `desktop` is set (header variants that inline only part of the nav).
 */
export function MobileNav({
  items,
  title,
  cta,
  extra,
  contact,
  clock = true,
  desktop = false,
}: {
  items: NavItem[];
  title: string;
  cta?: { label: string; href: string } | null;
  extra?: React.ReactNode;
  contact?: ShellContact;
  clock?: boolean;
  desktop?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const path = useTenantPath();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  const onOpenChange = (next: boolean) => {
    // the circle reveal grows out of the trigger
    const r = triggerRef.current?.getBoundingClientRect();
    if (next && r) {
      const s = document.documentElement.style;
      s.setProperty("--rw-menu-x", `${Math.round(r.left + r.width / 2)}px`);
      s.setProperty("--rw-menu-y", `${Math.round(r.top + r.height / 2)}px`);
    }
    setOpen(next);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button ref={triggerRef} variant="ghost" size="icon" aria-label="เปิดเมนู" className={cn("rw-menu-trigger text-current", !desktop && "md:hidden")} data-open={open ? "true" : "false"}>
          <span className="rw-burger" aria-hidden>
            <span />
            <span />
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="rw-menu w-full max-w-none gap-0 border-0 p-0 shadow-none sm:max-w-none" aria-describedby={undefined} data-lenis-prevent="">
        <div className="rw-menu-scroll" data-lenis-prevent="">
          <div className="rw-menu-top">
            <span className="mono-label rw-menu-kicker" data-script="latin" aria-hidden>
              Menu
            </span>
            <SheetTitle className="rw-menu-title">{title}</SheetTitle>
          </div>

          <div className="rw-menu-body">
            <nav aria-label="เมนูหลัก" className="rw-menu-nav">
              <ol>
                {items.map((it, i) => {
                  const active = isActiveHref(it.href, path);
                  const isOpen = expanded === it.label;
                  return (
                    <li key={`${it.href}-${i}`} className="rw-menu-item" style={{ "--i": i } as React.CSSProperties}>
                      <span className="mono-label rw-menu-index" data-script="latin" aria-hidden>
                        {pad(i + 1)}
                      </span>
                      {it.children?.length ? (
                        <div className="min-w-0 flex-1">
                          <button type="button" className="rw-menu-link" onClick={() => setExpanded(isOpen ? null : it.label)} aria-expanded={isOpen}>
                            <span className="rw-menu-mask">
                              <span className="rw-menu-rise">{it.label}</span>
                            </span>
                            <ChevronDown className={cn("rw-menu-chev size-6 shrink-0", isOpen && "rotate-180")} aria-hidden />
                          </button>
                          {isOpen && (
                            <div className="rw-menu-sub">
                              {it.children.map((c, j) => (
                                <Link
                                  key={`${c.href}-${j}`}
                                  href={c.href}
                                  {...navTarget(c)}
                                  onClick={close}
                                  aria-current={isActiveHref(c.href, path) ? "page" : undefined}
                                  className="rw-menu-sublink"
                                  style={{ "--j": j } as React.CSSProperties}
                                >
                                  <RollText>{c.label}</RollText>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Link href={it.href} {...navTarget(it)} onClick={close} aria-current={active ? "page" : undefined} className="rw-menu-link">
                          <span className="rw-menu-mask">
                            <span className="rw-menu-rise">
                              <RollText>{it.label}</RollText>
                            </span>
                          </span>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            <div className="rw-menu-foot">
              {extra}
              {cta && (
                <Button asChild size="lg" className="rw-menu-cta w-full">
                  <Link href={cta.href} onClick={close}>
                    {cta.label}
                  </Link>
                </Button>
              )}
              {contact && (contact.phone || contact.email || contact.line) ? (
                <ul className="rw-menu-contact">
                  {contact.phone && (
                    <li>
                      <a href={`tel:${contact.phone}`}>
                        <Phone className="size-4 shrink-0" aria-hidden />
                        <span>{contact.phone}</span>
                      </a>
                    </li>
                  )}
                  {contact.email && (
                    <li>
                      <a href={`mailto:${contact.email}`}>
                        <Mail className="size-4 shrink-0" aria-hidden />
                        <span className="break-all">{contact.email}</span>
                      </a>
                    </li>
                  )}
                  {contact.line && (
                    <li>
                      <a href={contact.line.href} target="_blank" rel="noreferrer">
                        <LineIcon className="size-4 shrink-0" />
                        <span>LINE {contact.line.display}</span>
                      </a>
                    </li>
                  )}
                </ul>
              ) : null}
              <div className="rw-menu-meta">
                {contact?.social.length ? (
                  <div className="flex flex-wrap gap-2">
                    {contact.social
                      .filter((s) => s.kind !== "line")
                      .map((s) => (
                        <a key={s.kind} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} className="rw-menu-social">
                          <SocialIcon kind={s.kind} className="size-4" />
                        </a>
                      ))}
                  </div>
                ) : (
                  <span />
                )}
                {clock ? <LiveClock label="GMT+7" className="rw-menu-clock" /> : null}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
