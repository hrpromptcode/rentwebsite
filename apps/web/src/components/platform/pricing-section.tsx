import { SplitReveal } from "@rentweb/ui/motion";
import { bahtNumber, getPlans, platformLinks, type PlanView } from "./platform-data";
import { PricingPlans, type PlanCard } from "./pricing-plans";
import { Cta, Mono, SectionIndex, tg } from "./ui";

export function toPlanCards(plans: PlanView[]): PlanCard[] {
  const links = platformLinks();
  return plans.map((p) => ({
    key: p.key,
    name: p.name,
    description: p.description,
    monthly: bahtNumber(p.monthly),
    yearly: bahtNumber(p.yearly),
    yearlyPerMonth: bahtNumber(Math.round(p.yearly / 12)),
    features: p.features,
    href: links.planSignup(p.key),
  }));
}

/** Pricing chapter (paper) — plans from the `plans` table (active, priceMonthly > 0) + the Enterprise row. */
export async function PricingSection({ index = "08", heading = "h2", id = "pricing" }: { index?: string; heading?: "h1" | "h2"; id?: string }) {
  const { paid, enterprise } = await getPlans();
  const links = platformLinks();
  if (paid.length === 0) return null;
  return (
    <section id={id} data-tone="paper" data-hue="mint" className="relative scroll-mt-[var(--header-h)] px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby={`${id}-title`}>
      <div className="grid gap-8 md:grid-cols-12 md:items-end">
        <div className="md:col-span-8">
          <SectionIndex n={index} label="Pricing — ราคาที่ร้านเล็กจ่ายไหว" />
          <SplitReveal id={`${id}-title`} as={heading} text={tg("เริ่มต้น{หลักร้อย}{ต่อเดือน}")} className="display-thai mt-6 text-step-5 font-semibold" />
        </div>
        <p className="max-w-md text-step-1 leading-[1.7] text-muted-foreground md:col-span-4 md:justify-self-end">
          ทดลองฟรี 14 วัน ไม่ต้องใส่บัตร จ่ายรายปีประหยัดกว่า 2 เดือน ยกเลิกได้ทุกเมื่อ
        </p>
      </div>
      <div className="mt-12">
        <PricingPlans plans={toPlanCards(paid)} />
      </div>
      {enterprise ? (
        <div className="pf-plan mt-5 grid items-center gap-6 p-7 md:grid-cols-12 md:p-9">
          <div className="md:col-span-3">
            <p className="font-accent text-step-2 font-semibold tracking-[-0.02em]">{enterprise.name}</p>
            <Mono className="mt-1 block text-muted-foreground">For chains &amp; brands</Mono>
          </div>
          <ul className="flex flex-wrap gap-2 md:col-span-6">
            {enterprise.features.map((f) => (
              <li key={f} className="rounded-full border border-border bg-white/70 px-3.5 py-1.5 text-sm">
                {f}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-4 md:col-span-3 md:justify-end">
            <span className="text-sm text-muted-foreground">ราคาตามขนาดธุรกิจ</span>
            <Cta href={links.planSignup(enterprise.key)} variant="ghost" size="sm" arrow="up-right">
              ติดต่อเรา
            </Cta>
          </div>
        </div>
      ) : null}
    </section>
  );
}
