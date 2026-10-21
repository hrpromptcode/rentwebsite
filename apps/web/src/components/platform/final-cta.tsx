import { Magnetic, RollText, SplitReveal } from "@rentweb/ui/motion";
import { ShaderBackdrop } from "@rentweb/ui/three";
import { Mono, tg } from "./ui";

/** Home §4.3 #12 — the closing statement over an ember shader (this viewport's only canvas) + a big round magnetic CTA. */
export function FinalCta({ href, title = "พร้อมเปิดร้านแล้วหรือยัง?", sub = "สร้างเว็บจาก{เทมเพลต}แล้วปรับเป็นของคุณได้ในวันนี้ {ทดลองฟรี} 14 วัน {ไม่ต้อง}ใส่บัตร" }: { href: string; title?: string; sub?: string }) {
  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="final-cta-title">
      <ShaderBackdrop variant="ember" colors={["#FF6B3D", "#8E7DFF", "#FFB38A", "#07080B"]} intensity={0.9} className="absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_45%,transparent,rgb(7_8_11/0.7))]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[35%] bg-gradient-to-b from-transparent to-background" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[25%] bg-gradient-to-t from-transparent to-background" aria-hidden="true" />
      <div className="flex min-h-[88svh] flex-col items-center justify-center px-[var(--gutter)] py-[var(--section-y)] text-center">
        <Mono className="text-foreground/80">(∞) — Let&apos;s open your shop</Mono>
        <SplitReveal id="final-cta-title" as="h2" text={tg(title)} className="display-thai mt-8 max-w-[12em] text-step-6 font-semibold" />
        <p className="mt-6 max-w-xl text-step-1 leading-[1.7] text-foreground [text-shadow:0_2px_24px_rgb(7_8_11/0.8)]">{tg(sub)}</p>
        <Magnetic strength={0.45} max={18} className="mt-12 inline-flex">
          <a href={href} className="pf-orb-btn group" data-cursor="link" data-cursor-label="เริ่มเลย">
            <span data-magnetic-inner="">
              <RollText>เริ่มฟรี 14 วัน</RollText>
            </span>
          </a>
        </Magnetic>
      </div>
    </section>
  );
}
