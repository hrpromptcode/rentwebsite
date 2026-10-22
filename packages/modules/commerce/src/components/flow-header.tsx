import * as React from "react";
import { scriptOf } from "@rentweb/ui/motion/split";
import { cn } from "@rentweb/ui/lib/utils";
import { Breadcrumbs, type Crumb } from "./page-header";
import { CheckoutSteps } from "./checkout-steps";
import { CommerceStyles } from "./commerce-styles";

/**
 * Operational page intro (§6.4 "PageIntro compact"): crumbs, a plain h1 that fades in (no split reveal), an optional
 * mono count, and the purchase stepper on the right. Calm: no 3D, no scroll effects.
 */
export function FlowHeader({ title, count, step, crumbs, className }: { title: string; count?: string; step?: 0 | 1 | 2; crumbs?: Crumb[]; className?: string }) {
  return (
    <header className={cn("pt-6 pb-8 md:pt-10 md:pb-12", className)}>
      <CommerceStyles />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
        <div className="min-w-0">
          {crumbs && <Breadcrumbs items={crumbs} className="mb-3 md:mb-4" />}
          <div className="flex items-start gap-3">
            <h1 data-script={scriptOf(title)} className="rw-h rwc-rise font-heading text-step-5 leading-[1.2] font-semibold">
              {title}
            </h1>
            {count && (
              <span aria-hidden className="rwc-num mt-2 text-muted-foreground md:mt-4 md:text-sm">
                {count}
              </span>
            )}
          </div>
        </div>
        {step !== undefined && <CheckoutSteps current={step} className="lg:w-[28rem] lg:shrink-0" />}
      </div>
      <div aria-hidden className="mt-7 h-px w-full bg-foreground/15 md:mt-10" />
    </header>
  );
}
