import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, BadgeCheck, CalendarCheck, CalendarDays, Check, Circle, ExternalLink, Receipt, ShoppingBag, UserPlus, UtensilsCrossed, Wallet, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtDate, fmtNumber, fmtRelative, thb } from "@/lib/format";
import { getTenantCtx } from "@/lib/tenant";
import { getDashboardData } from "./queries";

export const metadata: Metadata = { title: "ภาพรวม" };

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const data = await getDashboardData(ctx);
  const { kpis } = data;
  const base = `/t/${slug}`;
  const hasModuleKpis = kpis.ordersToday !== null || kpis.restOrdersToday !== null || kpis.bookingsToday !== null || kpis.topupsToday !== null;
  const kpiCount = [kpis.ordersToday, kpis.restOrdersToday, kpis.revenueToday, kpis.reservationsToday, kpis.bookingsToday, kpis.topupsToday, kpis.pendingSlips].filter((v) => v !== null).length + 1 + (hasModuleKpis ? 0 : 1);
  const trialDaysLeft = ctx.tenant.trialEndsAt ? Math.max(0, Math.ceil((ctx.tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={fmtDate(new Date(), { style: "long" })}
        title={`สวัสดี, ${ctx.tenant.name}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={ctx.tenant.status} />
            {ctx.tenant.status === "trialing" && trialDaysLeft !== null && <span>ทดลองใช้เหลืออีก {trialDaysLeft} วัน</span>}
            <span className="text-muted-foreground">·</span>
            <a href={ctx.storefrontUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              {ctx.hostname} <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </span>
        }
        actions={
          ctx.tenant.status === "trialing" ? (
            <Button asChild>
              <Link href={`/t/${slug}/settings/billing`}>เลือกแพ็กเกจ</Link>
            </Button>
          ) : null
        }
      />

      <section aria-label="ตัวเลขวันนี้" className={`grid gap-4 sm:grid-cols-2 ${kpiCount === 5 ? "xl:grid-cols-5" : kpiCount === 6 ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
        {kpis.ordersToday !== null && <KpiCard label="ออเดอร์วันนี้" value={fmtNumber(kpis.ordersToday)} icon={ShoppingBag} tone="primary" href={`${base}/orders`} />}
        {kpis.restOrdersToday !== null && <KpiCard label={kpis.ordersToday !== null ? "ออเดอร์ร้านอาหารวันนี้" : "ออเดอร์วันนี้"} value={fmtNumber(kpis.restOrdersToday)} hint={kpis.openTables ? `${fmtNumber(kpis.openTables)} โต๊ะกำลังใช้งาน` : "ไม่มีโต๊ะที่เปิดอยู่"} icon={UtensilsCrossed} tone="primary" href={`${base}/restaurant/orders`} />}
        {kpis.revenueToday !== null && <KpiCard label="ยอดขายวันนี้" value={thb(kpis.revenueToday)} hint="เฉพาะที่ชำระแล้ว" icon={Wallet} tone="success" />}
        {kpis.reservationsToday !== null && <KpiCard label="จองโต๊ะวันนี้" value={fmtNumber(kpis.reservationsToday)} icon={CalendarCheck} tone="accent" href={`${base}/restaurant/reservations`} />}
        {kpis.bookingsToday !== null && <KpiCard label="นัดหมายวันนี้" value={fmtNumber(kpis.bookingsToday)} icon={CalendarDays} tone="accent" href={`${base}/bookings`} />}
        {kpis.topupsToday !== null && <KpiCard label="รายการเติมวันนี้" value={fmtNumber(kpis.topupsToday)} hint={kpis.topupQueue ? `${kpis.topupQueue} รายการรอเติม` : "คิวว่าง"} icon={Zap} tone="accent" />}
        {kpis.pendingSlips !== null && <KpiCard label="สลิปรอตรวจ" value={fmtNumber(kpis.pendingSlips)} hint={kpis.pendingSlips ? "รวมทุกโมดูล · กดเพื่อตรวจสลิป" : "ไม่มีสลิปค้างตรวจ"} icon={BadgeCheck} tone={kpis.pendingSlips ? "accent" : "default"} href={`${base}/payments`} />}
        <KpiCard label="ลูกค้าใหม่ 7 วัน" value={fmtNumber(kpis.newCustomers7d)} icon={UserPlus} href={`${base}/customers`} />
        {!hasModuleKpis && <KpiCard label="ยอดขายวันนี้" value="—" hint="เปิดโมดูลร้านค้า ร้านอาหาร จองคิว หรือเติมเกมเพื่อดูยอด" icon={Receipt} />}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>เช็กลิสต์เริ่มต้นใช้งาน</CardTitle>
                <CardDescription>ทำครบแล้วเว็บของคุณพร้อมรับลูกค้าจริง</CardDescription>
              </div>
              <span className="font-heading text-2xl font-semibold tabular-nums text-primary">{data.progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={data.progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-theme" style={{ width: `${data.progress}%` }} />
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.checklist.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="group -mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted">
                    <span className={item.done ? "grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white" : "grid size-6 shrink-0 place-items-center rounded-full border-2 border-border text-transparent"}>
                      {item.done ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={item.done ? "block text-sm font-medium text-muted-foreground line-through" : "block text-sm font-medium"}>{item.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>กิจกรรมล่าสุด</CardTitle>
            <CardDescription>การเปลี่ยนแปลงและเหตุการณ์ในร้านของคุณ</CardDescription>
          </CardHeader>
          <CardContent>
            {data.activity.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <Activity className="size-6" aria-hidden />
                ยังไม่มีกิจกรรม เมื่อมีออเดอร์หรือการแก้ไข จะแสดงที่นี่
              </div>
            ) : (
              <ol className="relative space-y-4 border-l pl-5">
                {data.activity.map((a) => (
                  <li key={a.id} className="relative">
                    <span className={`absolute -left-[1.45rem] top-1.5 size-2.5 rounded-full ${a.kind === "event" ? "bg-accent" : "bg-primary"}`} aria-hidden />
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground" title={fmtDate(a.at, { withTime: true })}>
                      {fmtRelative(a.at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
