import { Globe } from "lucide-react";
import { platformLinks } from "@/components/platform/platform-data";
import { Logo, Mono } from "@/components/platform/ui";

export default async function NoSitePage({ searchParams }: { searchParams: Promise<{ host?: string }> }) {
  const { host } = await searchParams;
  const { origin } = platformLinks();
  return (
    <main className="pf-root relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-background px-6 text-foreground">
      <div className="pf-hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(45%_45%_at_50%_40%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]" aria-hidden="true" />
      <div className="max-w-lg text-center">
        <div className="relative mx-auto mb-8 grid size-20 place-items-center rounded-full border border-primary/40 text-primary">
          <span className="absolute inset-0 animate-ping rounded-full border border-primary/30 motion-reduce:animate-none" aria-hidden="true" />
          <Globe className="size-8" aria-hidden="true" />
        </div>
        <Mono as="p" className="text-muted-foreground">DNS · NO SITE YET</Mono>
        <h1 className="display-thai mt-4 text-step-3 font-semibold">ไม่พบเว็บไซต์ที่ {host ?? "โดเมนนี้"}</h1>
        <p className="mt-4 leading-[1.7] text-muted-foreground">
          ยังไม่มีร้านค้าที่ใช้โดเมนนี้ หรือการตั้งค่า DNS ยังไม่เสร็จสมบูรณ์ (อาจใช้เวลาสูงสุด 24 ชั่วโมง)
        </p>
        <a href={origin} className="pf-btn mt-10" data-variant="primary">
          ไปที่ RentWeb
        </a>
        <div className="mt-14 text-xl text-muted-foreground">
          <Logo />
        </div>
      </div>
    </main>
  );
}
