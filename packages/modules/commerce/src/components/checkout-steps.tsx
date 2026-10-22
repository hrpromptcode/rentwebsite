import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";
import { CommerceStyles } from "./commerce-styles";

/** Calm progress stepper for the purchase flow (§6.4): cart → details & payment → confirmed; the line fills on mount. */
export function CheckoutSteps({ current, className }: { current: 0 | 1 | 2; className?: string }) {
  const steps = [
    { label: L.stepCart, href: "/cart" },
    { label: L.stepCheckout, href: null },
    { label: L.stepDoneShort, href: null },
  ];
  return (
    <nav aria-label={L.checkoutSteps} className={cn("rwc-steps relative w-full max-w-xl", className)} style={{ "--rwc-fill": current / (steps.length - 1) } as React.CSSProperties}>
      <CommerceStyles />
      <div aria-hidden className="rwc-steps-track !top-4 !right-[16.66%] !left-[16.66%]">
        <div className="rwc-steps-fill" />
      </div>
      <ol className="relative grid grid-cols-3">
        {steps.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          const body = (
            <>
              <span className="rwc-step-dot">{state === "done" ? <Check className="size-4" aria-hidden /> : String(i + 1).padStart(2, "0")}</span>
              <span className={cn("text-center text-xs leading-snug md:text-sm", state === "todo" ? "text-muted-foreground" : "font-medium text-foreground")}>{s.label}</span>
            </>
          );
          return (
            <li key={s.label} className="rwc-step flex flex-col items-center" data-state={state} aria-current={state === "current" ? "step" : undefined}>
              {s.href && state === "done" ? (
                <Link href={s.href} className="flex min-h-11 min-w-11 flex-col items-center gap-2 rounded-md px-2">
                  {body}
                </Link>
              ) : (
                <span className="flex flex-col items-center gap-2">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
