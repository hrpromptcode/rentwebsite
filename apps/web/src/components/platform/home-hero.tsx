import { SplitReveal, Reveal } from "@rentweb/ui/motion";
import { HeroCycler, HeroMorph, HeroSync } from "./hero-sync";
import { Cta, Mono, tg } from "./ui";

/** Home §4.3 #2 — cinematic hero: Thai headline left, particle morph right (full-bleed above the copy on mobile). */
export function HomeHero({ signup, templates, systems }: { signup: string; templates: number; systems: number }) {
  return (
    <HeroSync>
      <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
        <div className="pf-hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <div className="pf-hero-glow pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

        {/* particle stage: top 48svh on mobile, right 58% on desktop */}
        <HeroMorph className="relative h-[48svh] min-h-[320px] w-full lg:absolute lg:bottom-[9%] lg:right-0 lg:top-[13%] lg:h-auto lg:w-[43%]" />

        <div className="relative z-10 -mt-10 flex flex-col px-[var(--gutter)] pb-10 lg:mt-0 lg:min-h-[100svh] lg:justify-between lg:pb-8 lg:pt-[calc(var(--header-h)+5vh)]">
          <div className="hidden items-center justify-between lg:flex">
            <Mono className="text-muted-foreground">RENTWEB ©2026</Mono>
            <Mono className="text-muted-foreground">(01) — เว็บไซต์สำเร็จรูประดับสตูดิโอ</Mono>
          </div>

          <div className="lg:max-w-[57%] lg:py-[6vh]">
            <Mono as="p" className="mb-5 flex items-center gap-2 text-primary">
              ● แพลตฟอร์มเว็บไซต์สำเร็จรูปสำหรับธุรกิจไทย
            </Mono>
            <SplitReveal
              id="hero-title"
              as="h1"
              mode="lines"
              from="mask"
              trigger="mount"
              text={tg("เปิดเว็บธุรกิจ{ของคุณ} ใน 5 นาที")}
              className="pf-hero-title display-thai text-[clamp(2.9rem,1.5rem+5.2vw,7.4rem)] font-semibold"
            />
            <Reveal delay={0.35}>
              <p className="display-thai mt-4 text-[clamp(1.6rem,1.1rem+1.9vw,3.1rem)] font-medium text-muted-foreground">
                เว็บสำหรับ <HeroCycler className="font-semibold text-foreground" />
              </p>
            </Reveal>
            <Reveal delay={0.5}>
              <p className="mt-6 max-w-[36rem] text-step-1 leading-[1.7] text-muted-foreground">
                {tg("เลือก{เทมเพลต} ปรับ{โลโก้} สี {ฟอนต์} แล้วเปิดรับลูกค้าได้เลย รองรับ PromptPay สลิป และ LINE")}
              </p>
            </Reveal>
            <Reveal delay={0.62} className="mt-9 flex flex-wrap items-center gap-3">
              <Cta href={signup} size="lg">
                เริ่มทดลองฟรี 14 วัน
              </Cta>
              <Cta href="#templates" variant="ghost" size="lg" arrow={false}>
                ดูเดโมสด
              </Cta>
            </Reveal>
          </div>

          <div className="mt-14 flex items-end justify-between gap-6 text-muted-foreground lg:mt-0">
            <a href="#tools" className="group inline-flex min-h-11 items-center gap-3">
              <Mono>SCROLL</Mono>
              <span className="relative inline-flex h-8 w-5 justify-center overflow-hidden rounded-full border border-current/40" aria-hidden="true">
                <span className="pf-cue mt-1.5 block h-2 w-0.5 rounded bg-primary" />
              </span>
              <span className="sr-only">เลื่อนลงไปดูต่อ</span>
            </a>
            <Mono className="hidden sm:inline">{`${templates} TEMPLATES · ${systems} BUSINESS SYSTEMS`}</Mono>
          </div>
        </div>
      </section>
    </HeroSync>
  );
}
