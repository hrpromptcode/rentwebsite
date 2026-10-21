import Link from "next/link";
import { Magnetic, RollText } from "@rentweb/ui/motion";
import { Mono } from "./ui";

/**
 * Branded 404 — "เปิดไฟหน้าร้าน" gone wrong: the 404 is a neon shop sign that flickers but never fully lights.
 * Keeps the existing texts ("ไม่พบหน้าที่คุณต้องการ", "กลับหน้าแรก").
 */
export function NotFoundView({ chrome = true }: { chrome?: boolean }) {
  return (
    <section className={`relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-[var(--gutter)] text-center ${chrome ? "pt-[var(--header-h)]" : ""}`} aria-labelledby="nf-title">
      <div className="pf-hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40%_40%_at_50%_45%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_70%)]" aria-hidden="true" />
      <Mono className="text-muted-foreground">ERROR 404 — SIGN OFFLINE</Mono>
      <p className="mt-6 flex select-none font-accent text-[clamp(7rem,2rem+26vw,24rem)] font-semibold leading-[0.82] tracking-[-0.06em]" aria-hidden="true">
        <span className="pf-neon" data-flicker="" style={{ ["--d" as string]: "0s" }}>
          4
        </span>
        <span className="pf-neon">0</span>
        <span className="pf-neon" data-flicker="" style={{ ["--d" as string]: "-2.2s" }}>
          4
        </span>
      </p>
      <h1 id="nf-title" className="display-thai mt-8 text-step-4 font-semibold">
        ไม่พบหน้าที่คุณต้องการ
      </h1>
      <p className="mt-4 max-w-md text-step-1 leading-[1.7] text-muted-foreground">ไฟหน้าร้านนี้ยังไม่เปิด ลองกลับไปหน้าแรก หรือเลือกดูเทมเพลตที่เปิดไฟพร้อมรับลูกค้าแล้ว</p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Magnetic className="inline-flex">
          <Link href="/" className="pf-btn group" data-variant="primary" data-size="lg">
            <span data-magnetic-inner="">
              <RollText>กลับหน้าแรก</RollText>
            </span>
          </Link>
        </Magnetic>
        <Link href="/templates" className="pf-btn group" data-variant="ghost" data-size="lg">
          <RollText>ดูเทมเพลต</RollText>
        </Link>
      </div>
    </section>
  );
}
