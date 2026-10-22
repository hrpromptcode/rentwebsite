import { Magnetic, RollText, SplitReveal } from "@rentweb/ui/motion";
import { Mono, tg } from "./ui";

/** floating glass shapes + warm blobs inside the panel (decorative, CSS-only drift, still under reduced motion) */
const FLOATS: { k?: "blob"; style: React.CSSProperties }[] = [
  { k: "blob", style: { left: "-6%", top: "-18%", width: "38%", aspectRatio: "1", ["--c" as string]: "#0ec0dc", ["--t" as string]: "14s" } },
  { k: "blob", style: { right: "-8%", bottom: "-30%", width: "44%", aspectRatio: "1", ["--c" as string]: "#ff5470", ["--t" as string]: "16s", ["--d" as string]: "-5s" } },
  { k: "blob", style: { right: "18%", top: "-24%", width: "26%", aspectRatio: "1", ["--c" as string]: "#ff9f5a", ["--t" as string]: "12s", ["--d" as string]: "-3s" } },
  { style: { left: "7%", top: "16%", width: "clamp(64px,8vw,120px)", aspectRatio: "1", ["--rot" as string]: "-12deg", ["--t" as string]: "9s" } },
  { style: { left: "12%", bottom: "12%", width: "clamp(90px,12vw,190px)", aspectRatio: "1", ["--r" as string]: "32%", ["--rot" as string]: "18deg", ["--t" as string]: "11s", ["--d" as string]: "-4s" } },
  { style: { right: "8%", top: "12%", width: "clamp(110px,14vw,220px)", aspectRatio: "1", ["--r" as string]: "50%", ["--t" as string]: "10s", ["--d" as string]: "-2s", ["--fy" as string]: "22px" } },
  { style: { right: "14%", bottom: "14%", width: "clamp(56px,6vw,96px)", aspectRatio: "1", ["--r" as string]: "28%", ["--rot" as string]: "34deg", ["--t" as string]: "8s", ["--d" as string]: "-6s" } },
  { style: { left: "38%", top: "6%", width: "clamp(28px,3vw,46px)", aspectRatio: "1", ["--t" as string]: "7s", ["--d" as string]: "-1s" } },
];

/**
 * The closing statement (§4.3 #12, PromptCode colours): a vivid deep-blue→cyan panel with sunrise accents, floating glass shapes and warm
 * blobs, giant white headline, and a magnetic white disc CTA that fills with the gradient on hover. A soft violet
 * scrim behind the copy keeps the white text AA on every gradient stop.
 */
export function FinalCta({ href, title = "พร้อมเปิดร้านแล้วหรือยัง?", sub = "สร้างเว็บจาก{เทมเพลต}แล้วปรับเป็นของคุณได้ในวันนี้ เริ่มต้น{เพียง} 999 บาท{ต่อเดือน} {ยกเลิก}ได้ทุกเมื่อ" }: { href: string; title?: string; sub?: string }) {
  return (
    <section data-hue="dawn" className="relative px-[max(10px,calc(var(--gutter)*0.6))] py-[calc(var(--section-y)*0.6)]" aria-labelledby="final-cta-title">
      <div className="pf-cta-panel">
        {FLOATS.map((f, i) => (
          <span key={i} className="pf-float" data-k={f.k} style={f.style} aria-hidden="true" />
        ))}
        <div className="relative flex min-h-[78svh] flex-col items-center justify-center px-[var(--gutter)] py-[calc(var(--section-y)*0.9)] text-center">
          <Mono className="rounded-full bg-white/15 px-4 py-1.5 text-white ring-1 ring-white/35 backdrop-blur">(∞) — Let&apos;s open your shop</Mono>
          <SplitReveal id="final-cta-title" as="h2" text={tg(title)} className="display-thai mt-8 max-w-[9.5em] text-[clamp(2.6rem,1.3rem+4.6vw,6rem)] font-semibold leading-[1.15] text-white [text-shadow:0_6px_40px_rgb(12_40_96/0.35)]" />
          <p className="mt-6 max-w-xl text-step-1 leading-[1.7] text-white [text-shadow:0_2px_18px_rgb(12_40_96/0.45)]">{tg(sub)}</p>
          <Magnetic strength={0.45} max={18} className="mt-12 inline-flex">
            <a href={href} className="pf-orb-btn group" data-cursor="link" data-cursor-label="เริ่มเลย">
              <span data-magnetic-inner="">
                <RollText>เริ่มสร้างเว็บ</RollText>
              </span>
            </a>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}
