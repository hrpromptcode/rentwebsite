import { CreditCard, Globe, Languages, LogIn, QrCode, ReceiptText } from "lucide-react";
import { CurvedGallery } from "@rentweb/ui/three";
import { Odometer, Reveal, ScrubText, SplitReveal, StickyStory, TiltCard, VelocityMarquee } from "@rentweb/ui/motion";
import { DevicePair } from "./devices";
import { LaunchJourney } from "./launch-journey";
import { MODULE_LABEL, type TemplateView } from "./platform-data";
import { ScrollScale } from "./scroll-scale";
import { Cta, Mono, SectionIndex, tg } from "./ui";

/* ------------------------------------------------------------------------------------------------ #3 tools strip */

const TOOLS: { label: string; icon: React.ReactNode; bg: string; line?: boolean }[] = [
  { label: "รองรับ PromptPay", icon: <QrCode strokeWidth={2.2} />, bg: "linear-gradient(135deg,#0ec0dc,#1561b7)" },
  { label: "ตรวจสลิปอัตโนมัติ", icon: <ReceiptText strokeWidth={2.2} />, bg: "linear-gradient(135deg,#34d399,#0ea5a4)" },
  { label: "LINE แจ้งเตือน", icon: "LINE", bg: "#06c755", line: true },
  { label: "LINE Login", icon: <LogIn strokeWidth={2.2} />, bg: "#06c755" },
  { label: "บัตรเครดิต", icon: <CreditCard strokeWidth={2.2} />, bg: "linear-gradient(135deg,#ff9f5a,#ff2e7e)" },
  { label: "โดเมนของคุณเอง", icon: <Globe strokeWidth={2.2} />, bg: "linear-gradient(135deg,#1561b7,#1e8fd8)" },
  { label: "ภาษาไทยเต็มรูปแบบ", icon: <Languages strokeWidth={2.2} />, bg: "linear-gradient(135deg,#fb8464,#e8632e)" },
];

export function ToolsStrip() {
  return (
    <section id="tools" aria-label="เครื่องมือที่รองรับ" className="relative scroll-mt-[var(--header-h)] py-10 md:py-14">
      <p className="mb-7 flex items-center justify-center gap-3 px-[var(--gutter)] text-center text-sm font-medium text-muted-foreground">
        <span className="h-px w-10 bg-gradient-to-r from-transparent to-primary/40" aria-hidden="true" />
        {tg("ทุกอย่างที่ร้านไทยใช้จริง {เชื่อมต่อ}ให้พร้อมแล้ว")}
        <span className="h-px w-10 bg-gradient-to-l from-transparent to-primary/40" aria-hidden="true" />
      </p>
      <VelocityMarquee
        items={TOOLS.map((t) => (
          <span key={t.label} className="pf-tool">
            <span className="pf-tool__icon" data-line={t.line ? "" : undefined} style={{ ["--tool-bg" as string]: t.bg }} aria-hidden="true">
              {t.icon}
            </span>
            {t.label}
          </span>
        ))}
        size="sm"
        speed={42}
        skew={false}
        separator={<span className="pf-spark" aria-hidden="true" />}
        label={TOOLS.map((t) => t.label).join(" · ")}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ #4 template cylinder */

export function TemplateCylinder({ templates }: { templates: TemplateView[] }) {
  return (
    <section id="templates" data-hue="sky" className="relative isolate scroll-mt-[var(--header-h)] overflow-hidden pt-[var(--section-y)]" aria-labelledby="templates-title">
      <div className="pf-gallery-stage pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[78%]" aria-hidden="true" />
      <div className="pointer-events-none relative z-10 px-[var(--gutter)]">
        <SectionIndex n="02" label="Templates — 10 ธุรกิจ 10 บุคลิก" />
        <ScrollScale className="mt-6" origin="0% 100%">
          <h2 id="templates-title" className="pf-giant pf-grad-text pf-grad-ocean pf-shimmer w-fit text-[clamp(2.6rem,11.2vw,14.5rem)]">
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
      {/* scoped tokens tint the WebGL stage: violet grid lines, pink pool, white fog */}
      <div className="pf-gallery" style={{ ["--foreground" as string]: "#1e8fd8", ["--primary" as string]: "#ff9fb8", ["--accent" as string]: "#fb8464", ["--background" as string]: "#f6f8fc", ["--surface" as string]: "#e6eef9" }}>
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
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ #5 sticky story (paper) */

export function BusinessStory({ templates }: { templates: TemplateView[] }) {
  const css = templates
    .map(
      (t, i) =>
        `.pf-story [data-story-item][data-index="${i}"][data-active="true"] [data-story-title-text],.pf-story [data-story-item][data-index="${i}"] [data-story-title]:hover [data-story-title-text]{color:${t.inkPaper}}` +
        `.pf-story:has([data-story-item][data-index="${i}"][data-active="true"]) .pf-washes>i[data-i="${i}"]{opacity:1}`,
    )
    .join("") + `.pf-story:has([data-story-item][data-active="true"]:not([data-index="0"])) .pf-washes>i[data-i="0"]{opacity:0}`;
  return (
    <section data-tone="paper" data-hue="peach" className="pf-story relative isolate py-[var(--section-y)]" aria-labelledby="story-title">
      <style>{css}</style>
      <div className="pf-washes" aria-hidden="true">
        {templates.map((t, i) => (
          <i key={t.key} data-i={i} style={{ ["--c1" as string]: t.preset.primary, ["--c2" as string]: t.preset.accent }} />
        ))}
      </div>
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

/* ------------------------------------------------------------------------------------------------ #7 launch journey */

export function LaunchTunnel({ templates }: { templates: TemplateView[] }) {
  const shot = (k: string) => templates.find((t) => t.key === k)?.shot.desktop ?? "";
  return (
    <section data-hue="violet" className="relative" aria-labelledby="tunnel-title">
      <div className="px-[var(--gutter)] pt-[var(--section-y)]">
        <SectionIndex n="05" label="From idea to open — 5 steps" />
        <SplitReveal id="tunnel-title" as="h2" text={tg("จาก{ไอเดีย} ถึง{เปิดร้าน} ใน 5 นาที")} className="display-thai mt-6 max-w-[14em] text-step-5 font-semibold" />
      </div>
      <LaunchJourney
        ariaLabel="ขั้นตอนเปิดร้าน"
        steps={[
          { kicker: "Template", title: "เลือกเทมเพลต", body: "เริ่มจากหน้าตาที่ใกล้ร้านคุณที่สุด จาก 10 ธุรกิจ", shots: [shot("shop"), shot("topup")] },
          { kicker: "Brand", title: "ใส่โลโก้ สี ฟอนต์", body: "ปรับธีมเองได้ทั้งหมด พร้อมฟอนต์ไทยให้เลือกเพียบ", shots: [shot("cafe"), shot("salon")] },
          { kicker: "Catalogue", title: "เพิ่มสินค้า/บริการ", body: "ใส่รูป ราคา และรายละเอียดจากหลังบ้านที่ใช้ง่าย", shots: [shot("clinic"), shot("course")] },
          { kicker: "Payments", title: "เชื่อม PromptPay + LINE", body: "เงินเข้าบัญชีคุณโดยตรง ออเดอร์ใหม่แจ้งเตือนทาง LINE", shots: [shot("restaurant"), shot("events")] },
          { kicker: "Launch", title: "เปิดเว็บ รับลูกค้าได้เลย", body: "แชร์ลิงก์ร้าน แล้วเริ่มรับออเดอร์ได้ทันที", shots: [shot("hotel"), shot("corporate")] },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ #8 real numbers */

export function RealNumbers({ stats }: { stats: { templates: number; systems: number; presets: number; thaiFonts: number } }) {
  const items = [
    { v: stats.templates, l: "เทมเพลต", en: "Templates", c: "#0ec0dc" },
    { v: stats.systems, l: "ระบบธุรกิจ", en: "Business systems", c: "#1561b7" },
    { v: stats.presets, l: "ธีมดีไซน์", en: "Design themes", c: "#fb8464" },
    { v: stats.thaiFonts, l: "ฟอนต์ไทย", en: "Thai fonts", c: "#ff2e7e" },
  ];
  return (
    <section data-hue="violet" className="relative px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="numbers-title">
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
      <dl className="mt-14 grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
        {items.map((it, i) => (
          <Reveal key={it.en} delay={i * 0.09} distance={40} className="h-full">
          <TiltCard max={7} className="h-full rounded-[28px]">
            <div className="pf-num-tile flex h-full flex-col justify-between gap-8 p-5 md:gap-12 md:p-8" style={{ ["--tc" as string]: it.c }}>
              <dt className="flex items-center justify-between gap-3">
                <span className="text-step-0 font-semibold">{it.l}</span>
                <span className="size-2.5 rounded-full" style={{ background: it.c, boxShadow: `0 0 14px ${it.c}` }} aria-hidden="true" />
              </dt>
              <dd>
                <span className="pf-odo-grad block font-accent text-[clamp(3.6rem,1.6rem+7vw,8.5rem)] font-semibold leading-[0.85] tracking-[-0.05em]">
                  <Odometer value={it.v} duration={1.8} />
                </span>
                <Mono as="span" className="mt-4 flex items-center justify-between text-muted-foreground">
                  {`${it.en} · 0${i + 1}`}
                </Mono>
              </dd>
            </div>
          </TiltCard>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
