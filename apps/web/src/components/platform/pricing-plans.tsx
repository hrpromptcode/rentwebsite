"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { OdometerClient } from "@rentweb/ui/motion/odometer-client";
import { TiltCard } from "@rentweb/ui/motion";
import { GlowCard, GradientBorder } from "@rentweb/ui/fx";

export interface PlanCard {
  key: string;
  name: string;
  description: string | null;
  /** whole-baht strings, server-formatted (th-TH) */
  monthly: string;
  yearly: string;
  /** yearly ÷ 12, server-formatted */
  yearlyPerMonth: string;
  features: string[];
  href: string;
}

/**
 * Plans with a monthly / yearly switch (§4.3 #10, §4.7). Prices roll (odometer) when the period changes; the
 * visible price text is the sr-only value of each odometer, so screen readers and text search read "฿390" once.
 */
export function PricingPlans({ plans, popular = "pro", trialDays = 14 }: { plans: PlanCard[]; popular?: string; trialDays?: number }) {
  const [yearly, setYearly] = React.useState(false);
  const [toggled, setToggled] = React.useState(false);
  return (
    <div>
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="รอบการชำระเงิน" className="relative inline-grid grid-cols-2 rounded-full border border-border bg-card p-1">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-foreground transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: yearly ? "translateX(100%)" : "none" }}
          />
          {[
            { v: false, l: "รายเดือน" },
            { v: true, l: "รายปี" },
          ].map((o) => (
            <button
              key={o.l}
              type="button"
              role="radio"
              aria-checked={yearly === o.v}
              onClick={() => {
                setYearly(o.v);
                setToggled(true);
              }}
              className={`relative z-10 min-h-11 rounded-full px-6 text-sm font-semibold transition-colors duration-300 ${yearly === o.v ? "text-background" : "text-foreground"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-primary">จ่ายรายปีประหยัดกว่า 2 เดือน</span> · ทดลองฟรี {trialDays} วัน ไม่ต้องใส่บัตร
        </p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const hot = p.key === popular;
          const body = (
            <div className="flex h-full flex-col p-7 md:p-9">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-accent text-step-2 font-semibold tracking-[-0.02em]">{p.name}</h3>
                {hot ? <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">ยอดนิยม</span> : null}
              </div>
              {p.description ? <p className="mt-2 text-sm text-muted-foreground">{p.description}</p> : null}
              <div className="mt-8 flex items-end gap-2">
                <span className="font-accent text-[clamp(3rem,2.2rem+2.6vw,4.5rem)] font-semibold leading-none tracking-[-0.04em]">
                  <OdometerClient key={yearly ? "y" : "m"} formatted={yearly ? p.yearly : p.monthly} prefix="฿" duration={1.1} trigger={toggled ? "mount" : "inView"} />
                </span>
                <span className="pb-1.5 text-muted-foreground">{yearly ? "/ปี" : "/เดือน"}</span>
              </div>
              <p className="mt-2 min-h-5 text-sm text-muted-foreground">{yearly ? `เฉลี่ย ฿${p.yearlyPerMonth}/เดือน` : `หรือ ฿${p.yearly}/ปี`}</p>
              <ul className="mt-8 flex-1 space-y-3 border-t border-border pt-6 text-[0.95rem]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={p.href}
                className="pf-btn group mt-9 w-full"
                data-variant={hot ? "primary" : "ghost"}
                data-size="lg"
              >
                เริ่มทดลองฟรี
              </a>
            </div>
          );
          return (
            <TiltCard key={p.key} max={4} glare={false} className="h-full">
              {hot ? (
                <GradientBorder className="h-full rounded-[1.75rem] bg-card shadow-[0_40px_80px_-40px_rgb(194_65_12/0.45)]" width={2}>
                  {body}
                </GradientBorder>
              ) : (
                <GlowCard className="h-full rounded-[1.75rem] border border-border bg-card">{body}</GlowCard>
              )}
            </TiltCard>
          );
        })}
      </div>
    </div>
  );
}
