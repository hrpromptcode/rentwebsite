import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, BadgeCheck, CalendarCheck, CalendarDays, Check, ExternalLink, Palette, PencilLine, Receipt, ShoppingBag, UserPlus, UtensilsCrossed, Wallet, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { LiveClock } from "@rentweb/ui/motion/live-clock";
import { ThaiWrap } from "@rentweb/ui/motion/thai-wrap";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { DayBars } from "@/components/ui/sparkline";
import { StatusBadge } from "@/components/ui/status-badge";
import { NavIcon } from "@/lib/icons";
import { buildTenantNav } from "@/lib/nav";
import { fmtDate, fmtNumber, fmtRelative, thb } from "@/lib/format";
import { getTenantCtx } from "@/lib/tenant";
import { getDashboardData } from "./queries";
import { getSitePreview, SitePreview } from "./site-preview";

export const metadata: Metadata = { title: "ภาพรวม" };

const TREND_CAPTION = "14 วันล่าสุด";

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const [data, preview] = await Promise.all([getDashboardData(ctx), getSitePreview(ctx)]);
  const { kpis, trends } = data;
  const base = `/t/${slug}`;
  const hasModuleKpis = kpis.ordersToday !== null || kpis.restOrdersToday !== null || kpis.bookingsToday !== null || kpis.topupsToday !== null;
  const kpiCount = [kpis.ordersToday, kpis.restOrdersToday, kpis.revenueToday, kpis.reservationsToday, kpis.bookingsToday, kpis.topupsToday, kpis.pendingSlips].filter((v) => v !== null).length + 1 + (hasModuleKpis ? 0 : 1);
  const trialDaysLeft = ctx.tenant.trialEndsAt ? Math.max(0, Math.ceil((ctx.tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null;
  const revenue14 = trends.revenue ? trends.revenue.reduce((a, b) => a + b, 0) : 0;
  const required = data.checklist.filter((c) => !c.optional);
  const doneCount = required.filter((c) => c.done).length;

  // quick links: content + design, then the first screen of every enabled module
  const nav = buildTenantNav(slug, ctx.modules);
  const quick = [
    { key: "pages", label: "แก้ไขหน้าเว็บ", href: `${base}/pages`, icon: <PencilLine className="size-4" aria-hidden /> },
    { key: "design", label: "ดีไซน์และธีม", href: `${base}/design`, icon: <Palette className="size-4" aria-hidden /> },
    ...nav
      .filter((g) => !["core", "cms", "settings"].includes(g.key))
      .map((g) => g.items[0])
      .filter((i): i is NonNullable<typeof i> => !!i)
      .map((i) => ({ key: i.key, label: i.label, href: i.href, icon: <NavIcon name={i.icon} className="size-4" /> })),
  ].slice(0, 5);

  return (
    <div className="space-y-8 lg:space-y-10">
      {/* Welcome band: greeting + live site window */}
      <div className="adm-welcome grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-center xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        <div className="min-w-0">
          <p className="adm-eyebrow adm-rise flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</span>
            <LiveClock label="" className="text-muted-foreground" />
          </p>
          <h1 className="adm-hello adm-rise mt-3 font-heading" style={{ "--d": "50ms" } as React.CSSProperties}>
            <ThaiWrap text={`สวัสดี, ${ctx.tenant.name}`} />
          </h1>
          <div className="adm-rise mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground" style={{ "--d": "100ms" } as React.CSSProperties}>
            <StatusBadge status={ctx.tenant.status} />
            {ctx.tenant.status === "trialing" && trialDaysLeft !== null && <span>ทดลองใช้เหลืออีก {trialDaysLeft} วัน</span>}
            <span aria-hidden>·</span>
            <a href={ctx.storefrontUrl} target="_blank" rel="noreferrer" className="adm-link adm-mono inline-flex items-center gap-1 text-[13px]">
              {ctx.hostname} <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          <div className="adm-rise adm-chips -mx-4 mt-5 flex items-center gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:mt-6 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0" style={{ "--d": "150ms" } as React.CSSProperties}>
            {ctx.tenant.status === "trialing" && (
              <Button asChild className="shrink-0 rounded-full">
                <Link href={`/t/${slug}/settings/billing`}>เลือกแพ็กเกจ</Link>
              </Button>
            )}
            {quick.map((q) => (
              <Link key={q.key} href={q.href} className="adm-chip shrink-0">
                {q.icon}
                {q.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="adm-rise min-w-0" style={{ "--d": "120ms" } as React.CSSProperties}>
          <SitePreview data={preview} slug={slug} />
        </div>
      </div>

      <section aria-label="ตัวเลขวันนี้" className={`adm-kpis grid grid-cols-2 gap-3 sm:gap-4 ${kpiCount === 5 ? "xl:grid-cols-5" : kpiCount === 6 ? "lg:grid-cols-3" : kpiCount <= 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {kpis.ordersToday !== null && <KpiCard label="ออเดอร์วันนี้" value={fmtNumber(kpis.ordersToday)} countTo={fmtNumber(kpis.ordersToday)} trend={trends.orders} trendLabel={TREND_CAPTION} icon={ShoppingBag} tone="primary" href={`${base}/orders`} />}
        {kpis.restOrdersToday !== null && (
          <KpiCard
            label={kpis.ordersToday !== null ? "ออเดอร์ร้านอาหารวันนี้" : "ออเดอร์วันนี้"}
            value={fmtNumber(kpis.restOrdersToday)}
            countTo={fmtNumber(kpis.restOrdersToday)}
            trend={trends.restOrders}
            trendLabel={TREND_CAPTION}
            hint={kpis.openTables ? `${fmtNumber(kpis.openTables)} โต๊ะกำลังใช้งาน` : "ไม่มีโต๊ะที่เปิดอยู่"}
            icon={UtensilsCrossed}
            tone="primary"
            href={`${base}/restaurant/orders`}
          />
        )}
        {kpis.revenueToday !== null && <KpiCard label="ยอดขายวันนี้" value={thb(kpis.revenueToday)} countTo={thb(kpis.revenueToday)} trend={trends.revenue} trendLabel={TREND_CAPTION} hint="เฉพาะที่ชำระแล้ว" icon={Wallet} tone="success" />}
        {kpis.reservationsToday !== null && <KpiCard label="จองโต๊ะวันนี้" value={fmtNumber(kpis.reservationsToday)} countTo={fmtNumber(kpis.reservationsToday)} icon={CalendarCheck} tone="accent" href={`${base}/restaurant/reservations`} />}
        {kpis.bookingsToday !== null && <KpiCard label="นัดหมายวันนี้" value={fmtNumber(kpis.bookingsToday)} countTo={fmtNumber(kpis.bookingsToday)} trend={trends.bookings} trendLabel={TREND_CAPTION} icon={CalendarDays} tone="accent" href={`${base}/bookings`} />}
        {kpis.topupsToday !== null && <KpiCard label="รายการเติมวันนี้" value={fmtNumber(kpis.topupsToday)} countTo={fmtNumber(kpis.topupsToday)} trend={trends.topups} trendLabel={TREND_CAPTION} hint={kpis.topupQueue ? `${kpis.topupQueue} รายการรอเติม` : "คิวว่าง"} icon={Zap} tone="accent" />}
        {kpis.pendingSlips !== null && (
          <KpiCard
            label="สลิปรอตรวจ"
            value={fmtNumber(kpis.pendingSlips)}
            countTo={fmtNumber(kpis.pendingSlips)}
            hint={kpis.pendingSlips ? "รวมทุกโมดูล · กดเพื่อตรวจสลิป" : "ไม่มีสลิปค้างตรวจ"}
            icon={BadgeCheck}
            tone={kpis.pendingSlips ? "accent" : "default"}
            href={`${base}/payments`}
          />
        )}
        <KpiCard label="ลูกค้าใหม่ 7 วัน" value={fmtNumber(kpis.newCustomers7d)} countTo={fmtNumber(kpis.newCustomers7d)} trend={trends.newCustomers} trendLabel={TREND_CAPTION} icon={UserPlus} href={`${base}/customers`} />
        {!hasModuleKpis && <KpiCard label="ยอดขายวันนี้" value="—" hint="เปิดโมดูลร้านค้า ร้านอาหาร จองคิว หรือเติมเกมเพื่อดูยอด" icon={Receipt} />}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          {trends.revenue && (
            <Card className="adm-panel">
              <CardHeader className="gap-1">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <div>
                    <CardTitle>ยอดขาย 14 วัน</CardTitle>
                    <CardDescription>รวมเฉพาะรายการที่ชำระแล้ว ทุกโมดูล</CardDescription>
                  </div>
                  <p className="font-heading text-2xl font-semibold tracking-tight tabular-nums">{thb(revenue14)}</p>
                </div>
              </CardHeader>
              <CardContent>
                <DayBars values={trends.revenue} labels={trends.labels} format={(v) => thb(v)} caption="ยอดขายรายวัน 14 วันล่าสุด" />
              </CardContent>
            </Card>
          )}

          <Card className="adm-panel">
            <CardHeader className="gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>เช็กลิสต์เริ่มต้นใช้งาน</CardTitle>
                  <CardDescription>ทำครบแล้วเว็บของคุณพร้อมรับลูกค้าจริง</CardDescription>
                </div>
                <p className="shrink-0 text-right">
                  <span className="font-heading text-3xl font-semibold tabular-nums tracking-tight text-primary">{data.progress}%</span>
                  <span className="block text-xs text-muted-foreground">
                    {doneCount}/{required.length} ขั้นตอน
                  </span>
                </p>
              </div>
              <div className="adm-progress" role="progressbar" aria-label="ความคืบหน้าการตั้งค่าร้าน" aria-valuenow={data.progress} aria-valuemin={0} aria-valuemax={100} style={{ "--p": `${data.progress}%` } as React.CSSProperties}>
                <span />
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {data.checklist.map((item, i) => (
                  <li key={item.key} data-checklist={item.key} data-done={item.done ? "true" : "false"}>
                    <Link href={item.href} className="adm-check group -mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 py-2.5">
                      <span className="adm-check-mark" data-done={item.done ? "" : undefined} style={{ "--i": i } as React.CSSProperties}>
                        {item.done ? <Check className="size-3.5" aria-hidden /> : <span className="adm-mono text-[11px]">{i + 1}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={item.done ? "block text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/40" : "block text-sm font-medium"}>{item.label}</span>
                        <span className={item.warning ? "block text-xs text-pretty text-amber-700" : "block text-xs text-pretty text-muted-foreground"}>{item.description}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="adm-panel min-w-0 self-start">
          <CardHeader>
            <CardTitle>กิจกรรมล่าสุด</CardTitle>
            <CardDescription>การเปลี่ยนแปลงและเหตุการณ์ในร้านของคุณ</CardDescription>
          </CardHeader>
          <CardContent>
            {data.activity.length === 0 ? (
              <EmptyState compact icon={Activity} title="ยังไม่มีกิจกรรม" description="เมื่อมีออเดอร์หรือการแก้ไข จะแสดงที่นี่" className="border-0" />
            ) : (
              <ol className="adm-timeline">
                {data.activity.map((a, i) => (
                  <li key={a.id} data-kind={a.kind} style={{ "--i": i } as React.CSSProperties}>
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
