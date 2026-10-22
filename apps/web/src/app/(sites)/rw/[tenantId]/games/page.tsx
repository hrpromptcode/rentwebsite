import type * as React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck, Zap } from "lucide-react";
import { Reveal } from "@rentweb/ui/motion";
import { Eyebrow, RevealHeading } from "@rentweb/storefront";
import { listGames } from "@rentweb/module-topup/services";
import { GameGridClient, TopupStyles } from "@rentweb/module-topup/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback } from "@/lib/cms-fallback";

export const metadata: Metadata = { title: "เติมเกม" };

/**
 * /games (marketing-light listing, GameHub §5.2): HUD intro with a decorative 3D cover fan (CSS, no links: every
 * `/games/<slug>` link on this page is a grid tile) + the searchable, tabbed holographic grid.
 */
export default async function GamesPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { tenantId } = await params;
  const { q = "", cat } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("topup")) return cmsFallback(runtime, "games");
  const games = await tenantTx(tenantId, (tx) => listGames(tx, tenantId, { limit: 200 }));
  const tab = cat === "mobile" || cat === "pc" || cat === "voucher" ? cat : "all";
  const fan = games.filter((g) => g.image).slice(0, 5);
  const autoGames = games.filter((g) => g.packageCount > 0).length;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <TopupStyles />
      <section className="relative isolate overflow-clip">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_78%_30%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%),radial-gradient(40%_50%_at_10%_90%,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_70%)]" />
          <div className="tp-floor" />
        </div>
        <div className="container-x grid gap-8 pt-4 pb-8 md:pt-8 md:pb-10 lg:grid-cols-12 lg:items-center lg:gap-10">
          <div className="lg:col-span-7">
            <div className="tp-hud mb-6 flex items-center gap-4 text-muted-foreground" data-script="latin">
              <span className="text-primary">[ GAME SELECT ]</span>
              <span aria-hidden className="h-px w-10 bg-border" />
              <span>{String(games.length).padStart(2, "0")} TITLES</span>
            </div>
            {games.length > 0 && <Eyebrow text={`${games.length} เกมที่รองรับ`} className="mb-4" />}
            <RevealHeading as="h1" text="เลือกเกมที่จะเติม" trigger="mount" className="font-heading text-step-5 font-semibold text-balance" />
            <Reveal delay={0.2}>
              <p className="mt-5 max-w-xl text-step-1 leading-relaxed text-muted-foreground">กดเลือกเกม กรอก ID เลือกแพ็กเกจ แล้วชำระเงิน ระบบเติมให้อัตโนมัติภายในไม่กี่วินาที</p>
              <div className="mt-6 flex flex-wrap gap-2 text-sm">
                <span className="inline-flex h-10 items-center gap-2 rounded-full border border-border/70 bg-card/50 px-4 backdrop-blur">
                  <Zap className="size-4 text-primary" /> เติมอัตโนมัติ 24 ชม.
                </span>
                <span className="inline-flex h-10 items-center gap-2 rounded-full border border-border/70 bg-card/50 px-4 backdrop-blur">
                  <ShieldCheck className="size-4 text-emerald-500" /> ไม่ต้องให้รหัสผ่าน
                </span>
                {autoGames > 0 && (
                  <span className="tp-hud inline-flex h-10 items-center gap-2 rounded-full border border-primary/40 bg-primary-soft px-4 text-primary" data-script="latin">
                    <span aria-hidden className="tp-live size-1.5 rounded-full bg-primary" /> {autoGames} READY
                  </span>
                )}
              </div>
            </Reveal>
          </div>
          {fan.length >= 3 && (
            <div aria-hidden className="hidden lg:col-span-5 lg:block">
              <CoverFan images={fan.map((g) => g.image!)} />
            </div>
          )}
        </div>
      </section>
      <section className="container-x pt-2 pb-16 md:pb-24">
        <GameGridClient games={games} showSearch variant="tiles" initialQuery={q} initialTab={tab} priorityImages={4} />
      </section>
    </PageBody>
  );
}

/** Decorative fan of game covers in CSS 3D around a slowly turning portal ring (no links, aria-hidden by the parent). */
function CoverFan({ images }: { images: string[] }) {
  const mid = (images.length - 1) / 2;
  return (
    <div className="tp-fan mx-auto aspect-[16/10] w-full max-w-[36rem]">
      <div className="tp-fan-ring" />
      {images.map((src, n) => {
        const i = n - mid;
        return (
          <div key={src} className="tp-fan-card" style={{ "--i": i, "--z": Math.abs(i), "--n": n, zIndex: 10 - Math.round(Math.abs(i) * 2) } as React.CSSProperties}>
            <img src={src} alt="" loading="eager" decoding="async" />
          </div>
        );
      })}
    </div>
  );
}
