import type { Metadata } from "next";
import { Odometer, SplitReveal } from "@rentweb/ui/motion";
import { CompareTable, type CompareRow } from "@/components/platform/compare-table";
import { FaqList } from "@/components/platform/faq-list";
import { FinalCta } from "@/components/platform/final-cta";
import { FAQ, bahtNumber, getPlans, platformLinks } from "@/components/platform/platform-data";
import { PricingSection } from "@/components/platform/pricing-section";
import { Mono, SectionIndex, tg } from "@/components/platform/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ราคา",
  description: "แพ็กเกจเว็บไซต์สำเร็จรูปเริ่มต้นหลักร้อยต่อเดือน ทดลองฟรี 14 วัน ไม่ต้องใส่บัตร จ่ายรายปีประหยัดกว่า 2 เดือน ยกเลิกได้ทุกเมื่อ",
  alternates: { canonical: "/pricing" },
};

const LIMIT_ROWS: { key: string; label: string; fmt?: (n: number) => string }[] = [
  { key: "products", label: "สินค้า" },
  { key: "pages", label: "หน้าเว็บ" },
  { key: "staff", label: "พนักงาน" },
  { key: "storageMb", label: "พื้นที่", fmt: (n) => (n >= 1024 ? `${Math.round(n / 1024)} GB` : `${n} MB`) },
  { key: "users", label: "ผู้ใช้หลังบ้าน" },
  { key: "ordersPerMonth", label: "ออเดอร์/เดือน" },
  { key: "slipVerifyPerMonth", label: "ตรวจสลิป/เดือน" },
  { key: "branches", label: "สาขา" },
];

export default async function PricingPage() {
  const { paid, enterprise, trial } = await getPlans();
  const links = platformLinks();
  const cheapest = paid[0];
  const rows: CompareRow[] = LIMIT_ROWS.map((r) => ({
    label: r.label,
    values: paid.map((p) => {
      const v = p.limits[r.key];
      if (v === undefined) return "—";
      if (v >= 100000) return "∞";
      return r.fmt ? r.fmt(v) : new Intl.NumberFormat("th-TH").format(v);
    }),
  }));
  const pro = paid.find((p) => p.key === "pro") ?? paid[1] ?? paid[0];
  const billingFaq = [
    { q: "ทดลองใช้ฟรีได้นานแค่ไหน?", a: `ทดลองฟรี 14 วัน ไม่ต้องใส่บัตร${trial?.features.some((f) => f.includes("Pro")) ? " ระหว่างทดลองใช้ได้ทุกฟีเจอร์ของแพ็กเกจ Pro" : ""} ยกเลิกได้ทุกเมื่อ` },
    ...(pro ? [{ q: "จ่ายรายปีคุ้มกว่าแค่ไหน?", a: `จ่ายรายปีประหยัดกว่า 2 เดือน เช่น ${pro.name} ฿${bahtNumber(pro.monthly)}/เดือน หรือ ฿${bahtNumber(pro.yearly)}/ปี` }] : []),
    { q: "เปลี่ยนแพ็กเกจได้ไหม?", a: "ได้ อัปเกรดเพื่อปลดล็อกโมดูลและขีดจำกัดที่มากขึ้นได้จากหน้าตั้งค่าการชำระเงินในหลังบ้าน การเปลี่ยนแพ็กเกจมีผลทันที" },
    FAQ[4]!,
    FAQ[1]!,
  ];

  return (
    <>
      <section data-hue="mint" className="relative overflow-hidden px-[var(--gutter)] pb-20 pt-[calc(var(--header-h)+10vh)]" aria-labelledby="pricing-h1">
        <div className="pf-hero-glow pointer-events-none absolute inset-0 -z-10 opacity-70" aria-hidden="true" />
        <SectionIndex n="01" label="Pricing" />
        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:items-end">
          <SplitReveal id="pricing-h1" as="h1" mode="lines" trigger="mount" text={tg("ราคาที่{ร้านเล็ก}{จ่ายไหว} สวยเท่า{แบรนด์ใหญ่}")} className="pf-hero-title display-thai text-[clamp(2.8rem,1.4rem+4.8vw,6.6rem)] font-semibold lg:col-span-9" />
          {cheapest ? (
            <div className="lg:col-span-3 lg:justify-self-end">
              <Mono className="text-muted-foreground">STARTS AT / MONTH</Mono>
              <p className="pf-odo-grad mt-3 font-accent text-[clamp(4rem,2.4rem+6vw,8.5rem)] font-semibold leading-[0.9] tracking-[-0.05em]">
                <Odometer value={bahtNumber(cheapest.monthly)} prefix="฿" trigger="mount" duration={1.6} />
              </p>
              <p className="mt-3 text-muted-foreground">{tg("ทดลองฟรี 14 วัน {ไม่ต้อง}ใส่บัตร ยกเลิกได้ทุกเมื่อ")}</p>
            </div>
          ) : null}
        </div>
      </section>

      <PricingSection index="02" id="plans" />

      {paid.length > 0 ? (
        <section className="px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="compare-title">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <SectionIndex n="03" label="Compare plans" />
              <h2 id="compare-title" className="display-thai mt-6 text-step-4 font-semibold">
                เทียบทุกแพ็กเกจ
              </h2>
              <p className="mt-5 max-w-sm text-muted-foreground">
                {enterprise ? `ต้องการมากกว่านี้? ${enterprise.name} มี${enterprise.features.join(" · ")}` : "ทุกแพ็กเกจรับเงินผ่าน PromptPay และสลิปได้"}
              </p>
            </div>
            <div className="lg:col-span-8">
              <CompareTable caption="เปรียบเทียบขีดจำกัดของแต่ละแพ็กเกจ" plans={paid.map((p) => ({ key: p.key, name: p.name, hot: p.key === "pro" }))} rows={rows} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-[var(--gutter)] pb-[var(--section-y)]" aria-labelledby="billing-faq-title">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionIndex n="04" label="Billing FAQ" />
            <h2 id="billing-faq-title" className="display-thai mt-6 text-step-4 font-semibold">
              {tg("คำถามเรื่อง{การชำระเงิน}")}
            </h2>
          </div>
          <div className="lg:col-span-8">
            <FaqList items={billingFaq} idPrefix="billing" />
          </div>
        </div>
      </section>

      <FinalCta href={links.signup} />
    </>
  );
}
