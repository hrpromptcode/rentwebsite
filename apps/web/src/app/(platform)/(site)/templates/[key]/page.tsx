import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FONTS } from "@rentweb/core/theme";
import { listTemplates } from "@rentweb/templates";
import { HoverPreview, Reveal, RollText, SplitReveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { ShaderBackdrop } from "@rentweb/ui/three";
import { fontClassNames } from "@/fonts";
import { DevicePair } from "@/components/platform/devices";
import { templateFeatureGroups } from "@/components/platform/module-features";
import { getTemplateView, getTemplates, platformLinks } from "@/components/platform/platform-data";
import { PaletteTiles, PresetButtons, PresetName, PresetScope } from "@/components/platform/preset-scope";
import { Cta, Mono, SectionIndex, tg } from "@/components/platform/ui";

export const dynamicParams = false;

export function generateStaticParams() {
  return listTemplates().map((t) => ({ key: t.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const t = getTemplateView(key);
  if (!t) return {};
  return {
    title: `เทมเพลต${t.business.label} — ${t.business.brand}`,
    description: `${t.name}: ${t.description}`,
    alternates: { canonical: `/templates/${t.key}` },
    openGraph: { title: `เทมเพลต${t.business.label} — ${t.business.brand} · RentWeb`, description: t.description, images: [{ url: t.shot.desktop, width: 1440, height: 900, alt: `ตัวอย่างเว็บ ${t.business.brand}` }] },
  };
}

function fontLabel(key: string | undefined) {
  return key ? (FONTS[key]?.family ?? key) : undefined;
}

export default async function TemplatePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const all = getTemplates();
  const t = all.find((x) => x.key === key);
  if (!t) notFound();
  const links = platformLinks();
  const next = all[(t.index + 1) % all.length]!;
  const groups = templateFeatureGroups(t.modules);
  let n = 0;
  const heading = t.preset.fonts.heading;
  const body = t.preset.fonts.body;
  const display = t.preset.fonts.display ?? heading;

  return (
    <>
      {/* 1 — hero over a mesh shader tinted with this template's preset */}
      <section className="relative isolate flex min-h-[86svh] flex-col justify-end overflow-hidden px-[var(--gutter)] pb-14 pt-[calc(var(--header-h)+10vh)]" aria-labelledby="tpl-title">
        <ShaderBackdrop
          variant="mesh"
          colors={[`color-mix(in oklab, ${t.preset.primary} 55%, white)`, `color-mix(in oklab, ${t.preset.accent} 50%, white)`, `color-mix(in oklab, ${t.preset.glow} 45%, white)`, "#f6f8fc"]}
          intensity={0.75}
          className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
        />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(246_248_252/0.5),rgb(246_248_252/0.28)_40%,rgb(246_248_252/0.55)_78%,transparent)]" aria-hidden="true" />
        <p className="pf-outline pointer-events-none absolute inset-x-[var(--gutter)] top-[calc(var(--header-h)+4vh)] select-none whitespace-nowrap font-accent font-semibold leading-[1.1] tracking-[-0.05em]"
          style={{ fontSize: `min(13rem, calc((100vw - 2 * var(--gutter)) / ${(Math.max(6, t.business.brand.length) * 0.74).toFixed(2)}))` }}
          aria-hidden="true"
        >
          {t.business.brand}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionIndex n={`${String(t.index + 1).padStart(2, "0")}/${String(all.length).padStart(2, "0")}`} label={`${t.business.en} — ${t.business.brand}`} className="text-foreground/80" />
          <Link href="/templates" className="group inline-flex min-h-11 items-center gap-2 text-sm text-foreground/80">
            <span aria-hidden="true">←</span>
            <RollText underline>เทมเพลตทั้งหมด</RollText>
          </Link>
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="pf-pill mb-5 pl-3.5">
              <span className="flex -space-x-1" aria-hidden="true">
                {[t.preset.primary, t.preset.accent].map((c) => (
                  <span key={c} className="size-3.5 rounded-full ring-2 ring-background/60" style={{ background: c }} />
                ))}
              </span>
              ธีม{t.preset.name}
            </p>
            <SplitReveal id="tpl-title" as="h1" mode="lines" trigger="mount" text={tg(t.name)} className="pf-hero-title display-thai text-[clamp(2.6rem,1.4rem+4.6vw,6.6rem)] font-semibold" />
          </div>
          <div className="lg:col-span-4">
            <Reveal delay={0.3}>
              <p className="text-step-1 leading-[1.7] text-foreground/85">{tg(t.description)}</p>
            </Reveal>
            <Reveal delay={0.45} className="mt-8 flex flex-wrap gap-3">
              <Cta href={t.demoUrl} external arrow="up-right">
                ดูเดโมสด
              </Cta>
              <Cta href={links.templateSignup(t.key)} variant="ghost">
                ใช้เทมเพลตนี้
              </Cta>
            </Reveal>
          </div>
        </div>
      </section>

      <PresetScope presets={t.recommended}>
        {/* 2 — device showcase: laptop auto-scrolls the full page, phone drifts faster */}
        <section className="relative overflow-hidden px-[var(--gutter)] py-[var(--section-y)]" aria-label={`ตัวอย่างหน้าจอ ${t.business.brand}`}>
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_55%,color-mix(in_oklab,var(--dev-glow)_22%,transparent),transparent_70%)] transition-[background] duration-700" aria-hidden="true" />
          <div className="mx-auto aspect-[16/11] w-full max-w-[1200px]">
            <DevicePair desktop={t.shot.long} mobile={t.shot.mobile} alt={`หน้าเว็บตัวอย่าง ${t.business.brand} ทั้งหน้า`} autoscroll="loop" parallax eager className="size-full" />
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-muted-foreground">
            <Mono>DESKTOP 1440 · MOBILE 390</Mono>
            <span className="text-sm">
              {tg("ภาพจริงจาก{เดโม}สด — ใช้ได้ทั้ง{คอมพิวเตอร์}และ{มือถือ}")}
            </span>
          </div>
        </section>

        {/* 3 — what's inside */}
        <section className="px-[var(--gutter)] pb-[var(--section-y)]" aria-labelledby="inside-title">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-[calc(var(--header-h)+8vh)]">
                <SectionIndex n="02" label="Inside this template" />
                <SplitReveal id="inside-title" as="h2" text={tg("มีอะไรใน{เทมเพลต}นี้")} className="display-thai mt-6 text-step-4 font-semibold" />
                <p className="mt-6 max-w-sm text-muted-foreground">{tg("ทุกอย่างพร้อมใช้ตั้งแต่วันแรก พร้อม{ข้อมูล}ตัวอย่างให้ลองแก้ได้ทันที")}</p>
              </div>
            </div>
            <div className="grid gap-14 lg:col-span-8">
              {groups.map((g) => (
                <div key={g.key}>
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <h3 className="text-step-2 font-semibold">{g.title}</h3>
                    <Mono className="text-muted-foreground">{g.key.toUpperCase()}</Mono>
                  </div>
                  <Stagger role="list" className="mt-2">
                    {g.features.map((f) => {
                      n += 1;
                      return (
                        <StaggerItem role="listitem" key={f} className="grid grid-cols-[3.5rem_1fr] items-baseline gap-4 border-b border-border/60 py-5 md:grid-cols-[5rem_1fr]">
                          <span className="font-mono text-sm text-primary">{String(n).padStart(2, "0")}</span>
                          <span className="text-step-1 leading-[1.6]">{f}</span>
                        </StaggerItem>
                      );
                    })}
                  </Stagger>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4 — design system strip */}
        <section data-tone="paper" className={`px-[var(--gutter)] py-[var(--section-y)] ${fontClassNames}`} aria-labelledby="ds-title">
          <div className="grid gap-8 md:grid-cols-12 md:items-end">
            <div className="md:col-span-7">
              <SectionIndex n="03" label="Design system" />
              <SplitReveal id="ds-title" as="h2" text={tg("ฟอนต์ สี และ{บุคลิก}ของร้าน")} className="display-thai mt-6 text-step-5 font-semibold" />
            </div>
            <p className="max-w-md text-step-1 leading-[1.7] text-muted-foreground md:col-span-5 md:justify-self-end">
              {tg("ค่าเริ่มต้นของ{เทมเพลต}นี้ ปรับเปลี่ยนได้ทั้งหมดในหลังบ้าน ลองกดชุดสีที่แนะนำด้านล่างดู")}
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.75rem] bg-card p-7 ring-1 ring-border md:p-9">
              <Mono className="text-muted-foreground">{`HEADING · ${fontLabel(display) ?? ""}`}</Mono>
              <p className="mt-6 text-[clamp(3rem,2rem+3.6vw,5.5rem)] leading-[1.3]" style={{ fontFamily: `var(--font-${display}), var(--font-display)` }}>
                สวัสดี Aa
              </p>
              <p className="mt-2 text-step-2" style={{ fontFamily: `var(--font-${heading}), var(--font-display)` }}>
                {t.business.brand} — {fontLabel(heading)}
              </p>
            </div>
            <div className="rounded-[1.75rem] bg-card p-7 ring-1 ring-border md:p-9">
              <Mono className="text-muted-foreground">{`BODY · ${fontLabel(body) ?? ""}`}</Mono>
              <p className="mt-6 text-step-1 leading-[1.75]" style={{ fontFamily: `var(--font-${body}), var(--font-body)` }}>
                {t.business.body}
              </p>
              <p className="mt-6 text-sm text-muted-foreground" style={{ fontFamily: `var(--font-${body}), var(--font-body)` }}>
                กขค ABC 0123456789 ฿1,290
              </p>
            </div>
          </div>

          <div className="mt-10">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-step-2 font-semibold">
                ชุดสี <PresetName />
              </h3>
              <Mono className="text-muted-foreground">PALETTE</Mono>
            </div>
            <PaletteTiles />
          </div>
          <div className="mt-10">
            <p className="mb-4 text-sm font-semibold text-muted-foreground">ชุดสีที่แนะนำ — กดเพื่อเปลี่ยนสีหน้าจอตัวอย่าง</p>
            <PresetButtons />
          </div>
        </section>
      </PresetScope>

      {/* 5 — next template */}
      <section className="px-[var(--gutter)] py-[var(--section-y)]" aria-label="เทมเพลตถัดไป">
        <HoverPreview width={360}>
          <Link
            href={`/templates/${next.key}`}
            data-preview-src={next.shot.desktop}
            data-preview-alt={`ตัวอย่างเว็บ ${next.business.brand}`}
            data-cursor="view"
            data-cursor-label="ถัดไป"
            className="group block border-y border-border py-12 md:py-16"
          >
            <Mono className="text-muted-foreground">{`NEXT — ${String(next.index + 1).padStart(2, "0")}/${String(all.length).padStart(2, "0")}`}</Mono>
            <span className="mt-4 flex items-baseline justify-between gap-6">
              <span className="display-thai text-step-6 font-semibold transition-colors duration-500 group-hover:text-primary">
                ถัดไป → {next.business.label}
              </span>
              <span className="hidden font-accent text-step-2 text-muted-foreground md:inline">{next.business.brand}</span>
            </span>
          </Link>
        </HoverPreview>
        <div className="mt-14 flex flex-wrap items-center justify-between gap-6">
          <p className="max-w-xl text-step-1 leading-[1.7] text-muted-foreground">{tg(`ชอบ{เทมเพลต}${t.business.label}นี้แล้ว? เริ่มจากหน้าตานี้ แล้วปรับเป็นร้านของคุณได้เลย`)}</p>
          <Cta href={links.templateSignup(t.key)} size="lg">
            ใช้เทมเพลตนี้
          </Cta>
        </div>
      </section>
    </>
  );
}
