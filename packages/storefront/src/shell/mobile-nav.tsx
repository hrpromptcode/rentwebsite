"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";
import type { NavItem } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@rentweb/ui/components/sheet";
import { cn } from "@rentweb/ui/lib/utils";

/** Menu sheet. The trigger is phone-only unless `desktop` is set (header variants that inline only part of the nav). */
export function MobileNav({
  items,
  title,
  cta,
  extra,
  desktop = false,
}: {
  items: NavItem[];
  title: string;
  cta?: { label: string; href: string } | null;
  extra?: React.ReactNode;
  desktop?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="เปิดเมนู" className={cn("text-current", !desktop && "md:hidden")}>
          <Menu className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[88vw] max-w-sm">
        <SheetHeader className="border-b">
          <SheetTitle className="text-left">{title}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-2">
          {items.map((it, i) => (
            <div key={`${it.href}-${i}`} className="border-b border-border/60 last:border-0">
              {it.children?.length ? (
                <>
                  <button
                    className="flex w-full items-center justify-between px-2 py-4 text-left font-heading text-lg"
                    onClick={() => setExpanded(expanded === it.label ? null : it.label)}
                    aria-expanded={expanded === it.label}
                  >
                    {it.label}
                    <ChevronDown className={cn("size-5 transition", expanded === it.label && "rotate-180")} />
                  </button>
                  {expanded === it.label && (
                    <div className="mb-3 ml-3 flex flex-col border-l pl-3">
                      {it.children.map((c, j) => (
                        <Link key={`${c.href}-${j}`} href={c.href} onClick={() => setOpen(false)} className="py-2.5 text-base text-muted-foreground">
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Link href={it.href} onClick={() => setOpen(false)} className="block px-2 py-4 font-heading text-lg">
                  {it.label}
                </Link>
              )}
            </div>
          ))}
        </nav>
        <div className="space-y-3 border-t p-5">
          {extra}
          {cta && (
            <Button asChild size="lg" className="w-full">
              <Link href={cta.href} onClick={() => setOpen(false)}>
                {cta.label}
              </Link>
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
