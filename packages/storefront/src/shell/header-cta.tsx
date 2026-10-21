import * as React from "react";
import Link from "next/link";
import { Button } from "@rentweb/ui/components/button";
import { Magnetic } from "@rentweb/ui/motion/magnetic";
import { RollText } from "@rentweb/ui/motion/roll-text";
import { cn } from "@rentweb/ui/lib/utils";

/** Arrow that slides out to the top-right while a twin slides in from the bottom-left (hover / focus). */
export function ArrowSwap({ className }: { className?: string }) {
  return (
    <span className={cn("rw-arrow-swap", className)} aria-hidden>
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path d="M4.5 11.5l7-7M5.5 4.5h6v6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path d="M4.5 11.5l7-7M5.5 4.5h6v6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Header call to action (§2.5 primary CTA): Magnetic pull, inner label parallax, RollText label, arrow swap. */
export function HeaderCta({ cta, className }: { cta: { label: string; href: string }; className?: string }) {
  return (
    // the visibility wrapper is separate: the Magnetic span sets its own display
    <span className={cn("ml-1 hidden md:inline-flex", className)}>
      <Magnetic max={8}>
        <Button asChild size="sm" className="rw-header-cta">
          <Link href={cta.href}>
            <span data-magnetic-inner="" className="inline-flex items-center gap-2">
              <RollText>{cta.label}</RollText>
              <ArrowSwap />
            </span>
          </Link>
        </Button>
      </Magnetic>
    </span>
  );
}
