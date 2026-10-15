import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, MessageCircle, Phone, ShoppingBag, Zap } from "lucide-react";
import { and, bookings, customers, desc, eq, orders, topupOrders } from "@rentweb/db";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtDate, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { CustomerForm } from "./customer-form";

export const metadata: Metadata = { title: "ข้อมูลลูกค้า" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const data = await tenantTx(ctx.tenant.id, async (tx) => {
    const [c] = await tx.select().from(customers).where(and(eq(customers.tenantId, ctx.tenant.id), eq(customers.id, id))).limit(1);
    if (!c) return null;
    const [o, b, t] = await Promise.all([
      ctx.modules.includes("commerce") ? tx.select({ id: orders.id, number: orders.number, status: orders.status, paymentStatus: orders.paymentStatus, total: orders.total, placedAt: orders.placedAt }).from(orders).where(and(eq(orders.tenantId, ctx.tenant.id), eq(orders.customerId, id))).orderBy(desc(orders.placedAt)).limit(10) : Promise.resolve([]),
      ctx.modules.includes("booking") ? tx.select({ id: bookings.id, number: bookings.number, status: bookings.status, startsAt: bookings.startsAt, price: bookings.price }).from(bookings).where(and(eq(bookings.tenantId, ctx.tenant.id), eq(bookings.customerId, id))).orderBy(desc(bookings.startsAt)).limit(10) : Promise.resolve([]),
      ctx.modules.includes("topup") ? tx.select({ id: topupOrders.id, number: topupOrders.number, status: topupOrders.status, gameName: topupOrders.gameName, packageName: topupOrders.packageName, price: topupOrders.price, placedAt: topupOrders.placedAt }).from(topupOrders).where(and(eq(topupOrders.tenantId, ctx.tenant.id), eq(topupOrders.customerId, id))).orderBy(desc(topupOrders.placedAt)).limit(10) : Promise.resolve([]),
    ]);
    return { c, orders: o, bookings: b, topups: t };
  });
  if (!data) notFound();
  const { c } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับ">
          <Link href={`/t/${slug}/customers`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-lg font-semibold text-primary">{(c.name ?? c.phone ?? "?").slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">{c.name ?? "ไม่ระบุชื่อ"}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="size-3.5" aria-hidden /> {c.phone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Mail className="size-3.5" aria-hidden /> {c.email}
                </a>
              )}
              {c.lineUserId && (
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="size-3.5" aria-hidden /> LINE
                </span>
              )}
              <span>สมัคร {fmtDate(c.createdAt)}</span>
            </p>
          </div>
          {c.blockedAt && <Badge variant="destructive">ถูกบล็อก</Badge>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="ยอดใช้จ่ายรวม" value={thb(c.totalSpent)} icon={ShoppingBag} tone="success" />
        <KpiCard label="จำนวนออเดอร์" value={fmtNumber(c.ordersCount)} icon={ShoppingBag} tone="primary" />
        <KpiCard label="เข้าชมล่าสุด" value={c.lastSeenAt ? fmtDate(c.lastSeenAt) : "—"} icon={CalendarDays} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <CustomerForm slug={slug} customerId={c.id} initial={{ notes: c.notes ?? "", tags: c.tags, tier: (c.tier as "member" | "vip" | "agent") ?? "member" }} blocked={!!c.blockedAt} canEdit={hasRole(ctx, "staff")} canBlock={hasRole(ctx, "manager")} marketingConsent={c.marketingConsent} />

        <div className="space-y-6">
          {ctx.modules.includes("commerce") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="size-4" aria-hidden /> ออเดอร์ล่าสุด
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มีออเดอร์</p>
                ) : (
                  <ul className="divide-y">
                    {data.orders.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span>
                          <span className="font-medium">{o.number}</span>
                          <span className="block text-xs text-muted-foreground">{fmtDate(o.placedAt, { withTime: true })}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <StatusBadge status={o.paymentStatus} label={o.paymentStatus === "paid" ? "ชำระแล้ว" : o.paymentStatus === "pending_verification" ? "รอตรวจสลิป" : "ยังไม่ชำระ"} />
                          <span className="font-medium tabular-nums">{thb(o.total)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {ctx.modules.includes("booking") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="size-4" aria-hidden /> การจองล่าสุด
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.bookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มีการจอง</p>
                ) : (
                  <ul className="divide-y">
                    {data.bookings.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span>
                          <span className="font-medium">{b.number}</span>
                          <span className="block text-xs text-muted-foreground">{fmtDate(b.startsAt, { withTime: true })}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge variant="outline">{b.status}</Badge>
                          <span className="font-medium tabular-nums">{thb(b.price)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {ctx.modules.includes("topup") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="size-4" aria-hidden /> รายการเติมล่าสุด
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มีรายการเติม</p>
                ) : (
                  <ul className="divide-y">
                    {data.topups.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {t.gameName} · {t.packageName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {t.number} · {fmtDate(t.placedAt, { withTime: true })}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge variant="outline">{t.status}</Badge>
                          <span className="font-medium tabular-nums">{thb(t.price)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
