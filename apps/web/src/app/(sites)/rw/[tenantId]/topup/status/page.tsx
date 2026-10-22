import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Search, SearchX } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Reveal } from "@rentweb/ui/motion";
import { thb } from "@rentweb/core/money";
import { getOrderByNumber } from "@rentweb/module-topup/services";
import { parseTopupOrderNumber } from "@rentweb/module-topup/labels";
import { Brackets, StatusBadge, TopupStyles, dateTimeTh } from "@rentweb/module-topup/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "ตรวจสอบสถานะ" };

export default async function TopupStatusPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ number?: string | string[] }> }) {
  const { tenantId } = await params;
  const { number } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) notFound();
  // echo back a display-safe copy (no control characters); only a well-formed TP-<digits> number is looked up
  const raw = (Array.isArray(number) ? number[0] : number) ?? "";
  const q = raw.replace(/\p{Cc}/gu, "").trim().slice(0, 40);
  const wanted = parseTopupOrderNumber(raw);
  const order = wanted ? await tenantTx(tenantId, (tx) => getOrderByNumber(tx, tenantId, wanted)) : null;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <TopupStyles />
      <section className="relative isolate container-x pb-16 md:pb-24">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 mx-auto h-72 max-w-3xl bg-[radial-gradient(50%_60%_at_50%_30%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)]" />
        <div className="mx-auto max-w-xl">
          <Reveal>
            <p className="tp-hud mb-4 text-primary" data-script="latin">
              [ Order lookup ]
            </p>
            <h1 className="heading-display text-step-4 font-semibold">ตรวจสอบสถานะ</h1>
            <p className="mt-3 text-muted-foreground">กรอกเลขที่รายการ (เช่น TP-1001) เพื่อดูสถานะการเติม ไม่ต้องเข้าสู่ระบบ</p>
          </Reveal>
          <Reveal delay={0.05} className="relative mt-7 overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card/80 p-5 backdrop-blur-xl md:p-6">
            <Brackets size={12} />
            <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="number">เลขที่รายการ</Label>
                <Input id="number" name="number" defaultValue={q} placeholder="TP-1001" required className="tp-search h-12 bg-background/70 font-mono tracking-wider uppercase" autoComplete="off" />
              </div>
              <Button type="submit" size="lg" className="h-12 shadow-[0_0_28px_-8px_var(--glow)]">
                <Search /> ค้นหา
              </Button>
            </form>
          </Reveal>

          {q && !order && (
            <Reveal delay={0.1} className="mt-5 flex items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-border/80 bg-card/50 p-5 text-sm text-muted-foreground">
              <SearchX className="size-5 shrink-0" /> ไม่พบรายการ <span className="font-mono text-foreground">{q.toUpperCase()}</span> ตรวจสอบเลขที่อีกครั้ง หรือติดต่อแอดมิน
            </Reveal>
          )}

          {order && (
            <Reveal delay={0.1} className="relative mt-5 overflow-hidden rounded-[var(--radius-xl)] border border-primary/40 bg-card/80 shadow-[0_30px_80px_-40px_var(--glow)] backdrop-blur-xl">
              <div className="flex flex-wrap items-start justify-between gap-3 p-5 md:p-6">
                <div>
                  <p className="text-sm text-muted-foreground">เลขที่รายการ</p>
                  <p className="tp-num mt-1 text-3xl font-semibold tracking-wide">{order.number}</p>
                </div>
                <StatusBadge status={order.status} size="md" />
              </div>
              {/* ticket perforation */}
              <div aria-hidden className="relative h-px border-t border-dashed border-border/80">
                <span className="absolute -top-3 -left-3 size-6 rounded-full bg-background" />
                <span className="absolute -top-3 -right-3 size-6 rounded-full bg-background" />
              </div>
              <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2 md:p-6">
                <div>
                  <dt className="text-muted-foreground">เกม / แพ็กเกจ</dt>
                  <dd className="font-medium">
                    {order.gameName} · {order.packageName}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ผู้เล่น</dt>
                  <dd className="font-mono font-medium tracking-wide">{order.player}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ยอดชำระ</dt>
                  <dd className="tp-num font-medium">{thb(order.price)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">สั่งซื้อเมื่อ</dt>
                  <dd className="font-medium">{dateTimeTh(order.placedAt)}</dd>
                </div>
              </dl>
              <div className="px-5 pb-5 md:px-6 md:pb-6">
                <Button asChild variant="outline" className="h-12 w-full sm:w-auto">
                  <Link href={`/topup/${order.number}`}>
                    ดูไทม์ไลน์รายการ <ArrowRight />
                  </Link>
                </Button>
              </div>
            </Reveal>
          )}
        </div>
      </section>
    </PageBody>
  );
}
