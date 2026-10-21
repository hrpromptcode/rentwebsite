import { CurvedGallery, WormholeTunnel } from "@rentweb/ui/three";
import { Odometer, ScrubText, SplitReveal, StickyStory, VelocityMarquee } from "@rentweb/ui/motion";
import { DevicePair } from "./devices";
import { MODULE_LABEL, type TemplateView } from "./platform-data";
import { ScrollScale } from "./scroll-scale";
import { Cta, Mono, SectionIndex, tg } from "./ui";

/* ------------------------------------------------------------------------------------------------ #3 tools strip */

const TOOLS = ["รองรับ PromptPay", "ตรวจสลิปอัตโนมัติ", "LINE แจ้งเตือน", "LINE Login", "บัตรเครดิต", "โดเมนของคุณเอง", "ภาษาไทยเต็มรูปแบบ"];

export function ToolsStrip() {
  return (
    <section id="tools" aria-label="เครื่องมือที่รองรับ" className="relative scroll-mt-[var(--header-h)] border-y border-border py-8 md:py-12">
      <VelocityMarquee
        items={TOOLS}
        size="lg"
        outline="alternate"
        speed={46}
        separator={<span className="mx-5 inline-block size-2.5 rounded-full bg-primary align-middle md:mx-9" aria-hidden="true" />}
        label={TOOLS.join(" · ")}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ #4 template cylinder */

export function TemplateCylinder({ templates }: { templates: TemplateView[] }) {
  return (
    <section id="templates" className="relative scroll-mt-[var(--header-h)] overflow-hidden pt-[var(--section-y)]" aria-labelledby="templates-title">
      <div className="pointer-events-none relative z-10 px-[var(--gutter)]">
        <SectionIndex n="02" label="Templates — 10 ธุรกิจ 10 บุคลิก" />
        <ScrollScale className="mt-6" origin="0% 100%">
          <h2 id="templates-title" className="pf-giant text-[clamp(2.6rem,11.2vw,14.5rem)]">
            <span aria-hidden="true">
              Templates<span className="pf-sup">©{templates.length}</span>
            </span>
            <span className="sr-only">เทมเพลต {templates.length} แบบ</span>
          </h2>
        </ScrollScale>
        <div className="mt-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <p className="max-w-xl text-step-1 leading-[1.7] text-muted-foreground">
            {tg(`${templates.length} ธุรกิจ ${templates.length} {บุคลิก} ลากเพื่อหมุนดู แล้วคลิก{การ์ด}ที่ชอบ เพื่อเปิดดู{เทมเพลต}และ{เดโม}สด`)}
          </p>
          <div className="pointer-events-auto">
            <Cta href="/templates" internal variant="ghost" arrow="up-right">
              ดูเทมเพลตทั้งหมด
            </Cta>
          </div>
        </div>
      </div>
      <CurvedGallery
        items={templates.map((t) => ({
          image: t.shot.desktop,
          title: t.business.brand,
          subtitle: [t.business.label, ...t.modules.map((m) => MODULE_LABEL[m] ?? m)].join(" · "),
          tag: `${String(t.index + 1).padStart(2, "0")} — ${t.business.en.toUpperCase()}`,
          href: `/templates/${t.key}`,
        }))}
        cardAspect={1.6}
        floor="grid"
        height="screen"
        autoplay={0.06}
        cursorLabel="ลาก"
        openLabel="เปิดดู"
        ariaLabel="เทมเพลตทั้งหมด"
        className="-mt-[16vh] md:-mt-[22vh]"
      />
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ #5 sticky story (paper) */

export function BusinessStory({ templates }: { templates: TemplateView[] }) {
  const css = templates
    .map(
      (t, i) =>
        `.pf-story [data-story-item][data-index="${i}"][data-active="true"] [data-story-title-text],.pf-story [data-story-item][data-index="${i}"] [data-story-title]:hover [data-story-title-text]{color:${t.inkPaper}}`,
    )
    .join("");
  return (
    <section data-tone="paper" className="pf-story relative py-[var(--section-y)]" aria-labelledby="story-title">
      <style>{css}</style>
      <div className="px-[var(--gutter)]">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <SectionIndex n="03" label="One platform — ten storefronts" />
            <SplitReveal id="story-title" as="h2" text={tg("ธุรกิจไหน ก็มี{หน้าร้าน}ที่ใช่")} className="display-thai mt-6 text-step-5 font-semibold" />
          </div>
          <p className="max-w-md text-step-1 leading-[1.7] text-muted-foreground md:col-span-5 md:justify-self-end">
            {tg("ทุก{เทมเพลต}มาพร้อมระบบ{หลังร้าน}ของธุรกิจนั้นจริง ๆ ไม่ใช่แค่หน้าตา เลื่อนดู{ทีละ}ธุรกิจได้เลย")}
          </p>
        </div>
        <StickyStory
          className="mt-10 md:mt-0"
          mediaMode="crossfade"
          idPrefix="business"
          items={templates.map((t) => ({
            key: t.key,
            title: t.business.label,
            kicker: `${t.business.brand} · ธีม${t.preset.name}`,
            body: t.business.body,
            chips: [...t.business.chips],
            media: <DevicePair desktop={t.shot.desktop} mobile={t.shot.mobile} alt={`ตัวอย่างเว็บ ${t.business.brand}`} glow={t.preset.primary} />,
          }))}
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ #7 wormhole */

export function LaunchTunnel({ templates }: { templates: TemplateView[] }) {
  const shot = (k: string) => templates.find((t) => t.key === k)?.shot.desktop;
  return (
    <section className="relative" aria-labelledby="tunnel-title">
      <div className="px-[var(--gutter)] pt-[var(--section-y)]">
        <SectionIndex n="05" label="From idea to open — 5 steps" />
        <SplitReveal id="tunnel-title" as="h2" text={tg("จาก{ไอเดีย} ถึง{เปิดร้าน} ใน 5 นาที")} className="display-thai mt-6 max-w-[14em] text-step-5 font-semibold" />
      </div>
      <WormholeTunnel
        length="normal"
        tint="primary"
        ariaLabel="ขั้นตอนเปิดร้าน"
        steps={[
          { kicker: "Template", title: "เลือกเทมเพลต", body: "เริ่มจากหน้าตาที่ใกล้ร้านคุณที่สุด จาก 10 ธุรกิจ", image: shot("shop") },
          { kicker: "Brand", title: "ใส่โลโก้ สี ฟอนต์", body: "ปรับธีมเองได้ทั้งหมด พร้อมฟอนต์ไทยให้เลือกเพียบ", image: shot("cafe") },
          { kicker: "Catalogue", title: "เพิ่มสินค้า/บริการ", body: "ใส่รูป ราคา และรายละเอียดจากหลังบ้านที่ใช้ง่าย", image: shot("clinic") },
          { kicker: "Payments", title: "เชื่อม PromptPay + LINE", body: "เงินเข้าบัญชีคุณโดยตรง ออเดอร์ใหม่แจ้งเตือนทาง LINE", image: shot("restaurant") },
          { kicker: "Launch", title: "เปิดเว็บ รับลูกค้าได้เลย", body: "แชร์ลิงก์ร้าน แล้วเริ่มรับออเดอร์ได้ทันที", image: shot("hotel") },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ #8 real numbers */

export function RealNumbers({ stats }: { stats: { templates: number; systems: number; presets: number; thaiFonts: number } }) {
  const items = [
    { v: stats.templates, l: "เทมเพลต", en: "Templates" },
    { v: stats.systems, l: "ระบบธุรกิจ", en: "Business systems" },
    { v: stats.presets, l: "ธีมดีไซน์", en: "Design themes" },
    { v: stats.thaiFonts, l: "ฟอนต์ไทย", en: "Thai fonts" },
  ];
  return (
    <section className="relative px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="numbers-title">
      <div className="grid gap-8 md:grid-cols-12 md:items-end">
        <div className="md:col-span-6">
          <SectionIndex n="06" label="Real numbers" />
          <h2 id="numbers-title" className="display-thai mt-6 text-step-4 font-semibold">
            ตัวเลขจริง จากระบบจริง
          </h2>
        </div>
        <ScrubText
          as="p"
          className="text-step-2 font-medium leading-[1.6] md:col-span-6"
          text={tg("ทุกร้านใช้ระบบเดียวกันที่ผ่านการ{ทดสอบ}มาแล้ว ร้านคุณจึงได้ทั้ง{ความสวย}และ{ความเสถียร} โดยไม่ต้อง{จ้างทีม}เอง")}
        />
      </div>
      <dl className="mt-16 grid grid-cols-2 border-t border-border md:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={it.en}
            className={`flex flex-col justify-between gap-10 border-b border-border py-8 md:border-b-0 md:py-10 ${i % 2 === 1 ? "border-l pl-4" : "pr-4"} ${i > 0 ? "md:border-l md:pl-8" : ""}`}
          >
            <dt className="flex items-center justify-between gap-3">
              <span className="text-step-0 font-semibold">{it.l}</span>
              <Mono className="hidden text-muted-foreground lg:inline">{`0${i + 1}`}</Mono>
            </dt>
            <dd>
              <span className="block font-accent text-[clamp(4.2rem,2rem+9vw,10.5rem)] font-semibold leading-[0.85] tracking-[-0.05em]">
                <Odometer value={it.v} duration={1.8} />
              </span>
              <Mono as="span" className="mt-4 block text-muted-foreground">
                {it.en}
              </Mono>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
