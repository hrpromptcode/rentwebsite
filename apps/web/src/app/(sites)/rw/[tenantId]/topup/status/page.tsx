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
import { StatusBadge, dateTimeTh } from "@rentweb/module-topup/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "ตรวจสอบสถานะ" };

export default async function TopupStatusPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ number?: string }> }) {
  const { tenantId } = await params;
  const { number } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) notFound();
  const q = number?.trim() ?? "";
  const order = q ? await tenantTx(tenantId, (tx) => getOrderByNumber(tx, tenantId, q)) : null;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto max-w-xl">
          <Reveal>
            <h1 className="heading-display text-4xl font-semibold md:text-5xl">ตรวจสอบสถานะ</h1>
            <p className="mt-3 text-muted-foreground">กรอกเลขที่รายการ (เช่น TP-1001) เพื่อดูสถานะการเติม ไม่ต้องเข้าสู่ระบบ</p>
          </Reveal>
          <Reveal delay={0.05} className="card mt-6 p-5 md:p-6">
            <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="number">เลขที่รายการ</Label>
                <Input id="number" name="number" defaultValue={q} placeholder="TP-1001" required className="h-12 font-mono uppercase" autoComplete="off" />
              </div>
              <Button type="submit" size="lg" className="h-12">
                <Search /> ค้นหา
              </Button>
            </form>
          </Reveal>

          {q && !order && (
            <Reveal delay={0.1} className="card mt-5 flex items-center gap-3 p-5 text-sm text-muted-foreground">
              <SearchX className="size-5 shrink-0" /> ไม่พบรายการ <span className="font-mono text-foreground">{q.toUpperCase()}</span> ตรวจสอบเลขที่อีกครั้ง หรือติดต่อแอดมิน
            </Reveal>
          )}

          {order && (
            <Reveal delay={0.1} className="card mt-5 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">เลขที่รายการ</p>
                  <p className="font-heading text-2xl font-semibold">{order.number}</p>
                </div>
                <StatusBadge status={order.status} size="md" />
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">เกม / แพ็กเกจ</dt>
                  <dd className="font-medium">
                    {order.gameName} · {order.packageName}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ผู้เล่น</dt>
                  <dd className="font-mono font-medium">{order.player}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ยอดชำระ</dt>
                  <dd className="font-medium">{thb(order.price)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">สั่งซื้อเมื่อ</dt>
                  <dd className="font-medium">{dateTimeTh(order.placedAt)}</dd>
                </div>
              </dl>
              <Button asChild variant="outline" className="mt-5 w-full sm:w-auto">
                <Link href={`/topup/${order.number}`}>
                  ดูไทม์ไลน์รายการ <ArrowRight />
                </Link>
              </Button>
            </Reveal>
          )}
        </div>
      </section>
    </PageBody>
  );
}
