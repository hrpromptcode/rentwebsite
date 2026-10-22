import { Check } from "lucide-react";
import { Reveal } from "@rentweb/ui/motion";
import { HeroCycler, HeroStage, HeroSync, HeroTitle, type HeroShot } from "./hero-sync";
import { Cta, Mono, tg } from "./ui";

/**
 * Home hero (PromptCode light): big Thai headline with a shimmering "5 นาที", the business word cycler with a morphing
 * brand-gradient underline, magnetic gradient CTA + glass ghost; on the right a live 3D browser + phone stack that follows the
 * pointer and switches to the template of the current word, with glass notification chips popping in around it.
 * Mobile: copy first, the device stack below (simplified, three chips).
 */
const DOODLES: { x: string; y: string; s: number; tone: "warm" | "cool" }[] = [
  { x: "47%", y: "17%", s: 22, tone: "warm" },
  { x: "93%", y: "15%", s: 14, tone: "cool" },
  { x: "51%", y: "82%", s: 18, tone: "cool" },
  { x: "4%", y: "86%", s: 12, tone: "warm" },
  { x: "88%", y: "86%", s: 24, tone: "warm" },
  { x: "38%", y: "9%", s: 10, tone: "cool" },
];

export function HomeHero({ signup, templates, systems, shots }: { signup: string; templates: number; systems: number; shots: HeroShot[] }) {
  return (
    <HeroSync>
      <section data-hue="lilac" className="pf-hero relative isolate overflow-x-clip" aria-labelledby="hero-title">
        <div className="pf-hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <div className="pf-hero-light pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        {/* faint giant outlined wordmark + floating sparkle doodles (PromptCode site motifs) */}
        <p className="pf-hero-ghost pointer-events-none absolute inset-x-0 bottom-[-0.1em] -z-10 select-none text-center" aria-hidden="true" data-script="latin">
          RENTWEB
        </p>
        {DOODLES.map((d, i) => (
          <span key={i} className="pf-doodle pointer-events-none absolute -z-10" data-tone={d.tone} style={{ left: d.x, top: d.y, ["--s" as string]: `${d.s}px`, ["--d" as string]: `${i * -1.7}s` }} aria-hidden="true" />
        ))}

        <div className="relative flex flex-col px-[var(--gutter)] pb-14 pt-[calc(var(--header-h)+4vh)] lg:min-h-[100svh] lg:justify-center lg:pb-24 lg:pt-[calc(var(--header-h)+3vh)]">
          <div className="relative z-10 lg:max-w-[54%]">
            <Reveal>
              <p className="pf-pill mb-7">
                <span className="pf-pill__tag">ใหม่</span>
                {tg("{แพลตฟอร์ม}{เว็บไซต์}{สำเร็จรูป}สำหรับธุรกิจไทย")}
              </p>
            </Reveal>
            <HeroTitle id="hero-title" className="display-thai text-[clamp(2.75rem,1.2rem+5.2vw,6.5rem)] font-semibold tracking-[-0.01em]" />
            <Reveal delay={0.35}>
              <p className="display-thai mt-5 text-[clamp(1.55rem,1.05rem+1.7vw,2.85rem)] font-medium text-muted-foreground">
                เว็บสำหรับ <HeroCycler className="font-semibold text-foreground" />
              </p>
            </Reveal>
            <Reveal delay={0.5}>
              <p className="mt-6 max-w-[34rem] text-step-1 leading-[1.7] text-muted-foreground">
                {tg("เลือก{เทมเพลต} ปรับ{โลโก้} สี {ฟอนต์} แล้วเปิดรับลูกค้าได้เลย รองรับ PromptPay สลิป และ LINE")}
              </p>
            </Reveal>
            <Reveal delay={0.62} className="mt-8 flex flex-wrap items-center gap-2.5 sm:mt-9 sm:gap-3">
              <Cta href={signup} size="lg" cursorLabel="เริ่มเลย">
                เริ่มทดลองฟรี 14 วัน
              </Cta>
              <Cta href="#templates" variant="ghost" size="lg" arrow={false}>
                ดูเดโมสด
              </Cta>
            </Reveal>
            <Reveal delay={0.75}>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.95rem] text-muted-foreground sm:mt-8" aria-label="ทดลองใช้ได้ทันที">
                {["ไม่ต้องใส่บัตร", "ยกเลิกได้ทุกเมื่อ", "ภาษาไทยเต็มรูปแบบ"].map((t, i) => (
                  <li key={t} className={`items-center gap-2 ${i === 2 ? "hidden sm:inline-flex" : "inline-flex"}`}>
                    <span className="pf-tick" aria-hidden="true">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* device stack: right half on desktop, below the copy on mobile */}
          <div className="relative mx-auto mt-10 aspect-[1/0.86] w-[min(100%,560px)] lg:absolute lg:bottom-[13%] lg:right-[calc(var(--gutter)+1%)] lg:top-[calc(var(--header-h)+8vh)] lg:mt-0 lg:aspect-auto lg:w-[44%] lg:max-w-none">
            <HeroStage shots={shots} className="lg:absolute lg:inset-0" />
          </div>

          <div className="mt-12 hidden items-end justify-between gap-6 text-muted-foreground lg:absolute lg:inset-x-[var(--gutter)] lg:bottom-7 lg:mt-0 lg:flex">
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
