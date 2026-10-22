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
export function PricingPlans({ plans, popular = "pro" }: { plans: PlanCard[]; popular?: string }) {
  const [yearly, setYearly] = React.useState(false);
  const [toggled, setToggled] = React.useState(false);
  return (
    <div>
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="รอบการชำระเงิน" className="pf-toggle relative inline-grid grid-cols-2 rounded-full p-1">
          <span
            aria-hidden="true"
            className="pf-toggle__pill absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
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
              className={`relative z-10 min-h-11 rounded-full px-6 text-sm font-semibold transition-colors duration-300 ${yearly === o.v ? "text-white" : "text-foreground"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-[#d11a63]">จ่ายรายปีประหยัดกว่า 2 เดือน</span> · ยกเลิกได้ทุกเมื่อ
        </p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const hot = p.key === popular;
          const body = (
            <div className="flex h-full flex-col p-7 md:p-9">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-accent text-step-2 font-semibold tracking-[-0.02em]">{p.name}</h3>
                {hot ? <span className="pf-badge">★ แนะนำ</span> : null}
              </div>
              {p.description ? <p className="mt-2 text-sm text-muted-foreground">{p.description}</p> : null}
              <div className="mt-8 flex items-end gap-2">
                <span className={`font-accent text-[clamp(3rem,2.2rem+2.6vw,4.5rem)] font-semibold leading-none tracking-[-0.04em] ${hot ? "pf-odo-grad" : ""}`}>
                  <OdometerClient key={yearly ? "y" : "m"} formatted={yearly ? p.yearly : p.monthly} prefix="฿" duration={1.1} trigger={toggled ? "mount" : "inView"} />
                </span>
                <span className="pb-1.5 text-muted-foreground">{yearly ? "/ปี" : "/เดือน"}</span>
              </div>
              <p className="mt-2 min-h-5 text-sm text-muted-foreground">{yearly ? `เฉลี่ย ฿${p.yearlyPerMonth}/เดือน` : `หรือ ฿${p.yearly}/ปี`}</p>
              <ul className="mt-8 flex-1 space-y-3 border-t border-border pt-6 text-[0.95rem]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="pf-check mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
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
                เลือกแพ็กเกจนี้
              </a>
            </div>
          );
          return (
            <TiltCard key={p.key} max={6} glare={false} className={`h-full ${hot ? "lg:-translate-y-3" : ""}`}>
              {hot ? <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[40px] bg-[linear-gradient(120deg,#ff9f5a,#fb8464_30%,#ff5470_65%,#ff2e7e)] opacity-30 blur-2xl" aria-hidden="true" /> : null}
              {hot ? (
                <GradientBorder
                  className="pf-plan h-full"
                  data-hot="true"
                  width={2}
                  speed={5}
                  colors={["#ff9f5a", "#fb8464", "#ff5470", "#ff2e7e", "#ff5470", "#0ec0dc"]}
                >
                  {body}
                </GradientBorder>
              ) : (
                <GlowCard className="pf-plan h-full">{body}</GlowCard>
              )}
            </TiltCard>
          );
        })}
      </div>
    </div>
  );
}
