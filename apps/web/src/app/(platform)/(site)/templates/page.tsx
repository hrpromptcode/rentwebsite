import type { Metadata } from "next";
import { SplitReveal } from "@rentweb/ui/motion";
import { FinalCta } from "@/components/platform/final-cta";
import { FILTERS, MODULE_LABEL, getTemplates, platformLinks } from "@/components/platform/platform-data";
import { TemplateGrid, type GridCard } from "@/components/platform/template-grid";
import { Mono, SectionIndex, tg } from "@/components/platform/ui";

export const metadata: Metadata = {
  title: "เทมเพลตเว็บไซต์ 10 ธุรกิจ",
  description: "รวมเทมเพลตเว็บไซต์สำเร็จรูปสำหรับร้านค้า เติมเกม คลินิก ร้านอาหาร สปา เอเจนซี คาเฟ่ สตูดิโอโยคะ โรงแรม และอีเวนต์ ดูเดโมสดได้ทุกแบบ",
  alternates: { canonical: "/templates" },
};

export default function TemplatesPage() {
  const templates = getTemplates();
  const links = platformLinks();
  const cards: GridCard[] = templates.map((t) => ({
    key: t.key,
    index: t.index,
    brand: t.business.brand,
    name: t.name,
    label: t.business.en.toUpperCase(),
    modules: t.modules.map((m) => MODULE_LABEL[m] ?? m),
    groups: t.business.groups,
    presetName: t.preset.name,
    swatches: [t.preset.background, t.preset.primary, t.preset.accent, t.preset.foreground],
    long: t.shot.long,
    demoUrl: t.demoUrl,
  }));
  const filters = FILTERS.map((f) => ({ ...f, count: f.key === "all" ? templates.length : templates.filter((t) => t.business.groups.includes(f.key)).length })).filter((f) => f.count > 0);

  return (
    <>
      <section className="relative overflow-hidden px-[var(--gutter)] pb-16 pt-[calc(var(--header-h)+8vh)]" aria-labelledby="templates-h1">
        <div className="pf-hero-glow pointer-events-none absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <SectionIndex n="01" label="Templates — ทุกธุรกิจ ทุกบุคลิก" />
          <Mono className="hidden text-muted-foreground md:inline">{`${templates.length} LIVE DEMOS`}</Mono>
        </div>
        <h1 id="templates-h1" className="pf-giant mt-8 text-[clamp(2.6rem,11.2vw,14.5rem)]">
          <span aria-hidden="true">
            Templates<span className="pf-sup">©{templates.length}</span>
          </span>
          <span className="sr-only">เทมเพลตเว็บไซต์ {templates.length} ธุรกิจ</span>
        </h1>
        <div className="mt-10 grid gap-8 md:grid-cols-12 md:items-end">
          <SplitReveal
            as="p"
            text={tg("เลือก{หน้าร้าน}ที่ใกล้ธุรกิจคุณที่สุด แล้วปรับให้เป็นแบรนด์คุณเอง")}
            className="pf-hero-title display-thai text-step-3 font-semibold md:col-span-7"
            trigger="mount"
          />
          <p className="text-step-1 leading-[1.7] text-muted-foreground md:col-span-5">
            {tg("ทุก{เทมเพลต}มี{ข้อมูล}ตัวอย่างครบ คลิกการ์ดเพื่อดู{รายละเอียด} หรือกด “ดูเดโมสด” เพื่อลองใช้เว็บจริง")}
          </p>
        </div>
      </section>

      <section className="px-[var(--gutter)] pb-[var(--section-y)]" aria-label="รายการเทมเพลต">
        <TemplateGrid cards={cards} filters={filters} />
      </section>

      <FinalCta href={links.signup} title="เจอเทมเพลตที่ใช่แล้วหรือยัง?" />
    </>
  );
}
