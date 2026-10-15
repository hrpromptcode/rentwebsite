import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gamepad2, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Reveal } from "@rentweb/ui/motion";
import { listGames } from "@rentweb/module-topup/services";
import { GameGridClient } from "@rentweb/module-topup/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "เติมเกม" };

export default async function GamesPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { tenantId } = await params;
  const { q = "", cat } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) notFound();
  const games = await tenantTx(tenantId, (tx) => listGames(tx, tenantId, { limit: 200 }));
  const tab = cat === "mobile" || cat === "pc" || cat === "voucher" ? cat : "all";

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <Reveal className="mb-10 max-w-3xl">
          <Badge variant="soft" className="mb-4 gap-1.5 px-3 py-1 text-sm">
            <Gamepad2 /> {games.length} เกมที่รองรับ
          </Badge>
          <h1 className="heading-display text-4xl font-semibold md:text-6xl">เลือกเกมที่จะเติม</h1>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">กดเลือกเกม กรอก ID เลือกแพ็กเกจ แล้วชำระเงิน ระบบเติมให้อัตโนมัติภายในไม่กี่วินาที</p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5">
              <Zap className="size-4 text-primary" /> เติมอัตโนมัติ 24 ชม.
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5">
              <ShieldCheck className="size-4 text-emerald-500" /> ไม่ต้องให้รหัสผ่าน
            </span>
          </div>
        </Reveal>
        <GameGridClient games={games} showSearch variant="tiles" initialQuery={q} initialTab={tab} />
      </section>
    </PageBody>
  );
}
