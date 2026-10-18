import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, Mail, MapPin, MessageSquareText, Phone, Receipt, Ticket, UserRound } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { cn } from "@rentweb/ui/lib/utils";
import { getOrderAdmin, listTicketDetailsForOrder, ticketQrDataUrl } from "@rentweb/module-events/admin";
import { ORDER_STATUS, PAYMENT_METHOD_LABEL, SOURCE_LABEL } from "@rentweb/module-events/admin/labels";
import { StatusPill, formatThaiDateTime, formatThaiSession } from "@rentweb/module-events/admin/ui";
import { assetUrl, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { eventsBase, eventsModuleConfig, ticketPageUrl } from "../../_lib";
import { NotesCard, OrderActions, PaymentCard, TicketsCard, type TicketVM } from "./order-panels";

export const metadata: Metadata = { title: "รายละเอียดคำสั่งซื้อบัตร" };

const TONE_DOT: Record<string, string> = { default: "bg-primary", success: "bg-emerald-500", warning: "bg-amber-500", destructive: "bg-rose-500", muted: "bg-muted-foreground/40" };

export default async function TicketOrderDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("events")) notFound();
  const [data, cfg] = await Promise.all([
    tenantTx(ctx.tenant.id, async (tx) => {
      const d = await getOrderAdmin(tx, ctx.tenant.id, id);
      if (!d) return null;
      return { ...d, ticketDetails: await listTicketDetailsForOrder(tx, ctx.tenant.id, id) };
    }),
    eventsModuleConfig(ctx),
  ]);
  if (!data) notFound();
  const { order: o, event: e, session: s, payments, ticketDetails } = data;
  const canManage = hasRole(ctx, "manager");
  const canStaff = hasRole(ctx, "staff");
  const base = `${eventsBase(slug)}/orders`;
  const guestUrl = ticketPageUrl(ctx, o.id, o.accessKey);
  const meta = (o.metadata ?? {}) as { paymentMethod?: string | null; holders?: unknown };
  const tickets: TicketVM[] = await Promise.all(
    ticketDetails.map(async (t) => ({
      id: t.ticket.id,
      code: t.ticket.code,
      holderName: t.ticket.holderName,
      holderEmail: t.ticket.holderEmail,
      seatLabel: t.ticket.seatLabel,
      typeName: t.typeName,
      sessionLabel: t.session ? `${t.session.name ? `${t.session.name} · ` : ""}${formatThaiSession(t.session.startsAt, t.session.endsAt)}` : null,
      price: t.ticket.price,
      status: t.ticket.status,
      checkedInAt: t.ticket.checkedInAt?.toISOString() ?? null,
      voidReason: t.ticket.voidReason,
      qr: t.ticket.status === "valid" || t.ticket.status === "checked_in" ? await ticketQrDataUrl(t.qrPayload, { width: 240 }) : null,
    })),
  );
  const live = tickets.filter((t) => t.status === "valid" || t.status === "checked_in");

  const timeline: Array<{ label: string; at: Date; tone: string }> = [{ label: "สร้างคำสั่งซื้อ", at: o.createdAt, tone: "default" }];
  if (o.paidAt) timeline.push({ label: `ชำระเงินแล้ว · ออกบัตร ${o.quantity} ใบ`, at: o.paidAt, tone: "success" });
  for (const p of payments) {
    if (p.status === "failed" && p.failureReason) timeline.push({ label: `สลิปถูกปฏิเสธ: ${p.failureReason}`, at: p.updatedAt, tone: "destructive" });
    if (p.status === "partially_refunded" || p.status === "refunded") timeline.push({ label: `คืนเงิน ${thb(p.refundedAmount)}`, at: p.updatedAt, tone: "muted" });
  }
  if (o.cancelledAt) timeline.push({ label: `${o.status === "expired" ? "หมดเวลาชำระ" : "ยกเลิก"}${o.cancelReason ? ` · ${o.cancelReason}` : ""}`, at: o.cancelledAt, tone: "destructive" });
  for (const t of tickets) if (t.checkedInAt) timeline.push({ label: `เช็กอิน ${t.holderName} (${t.code})`, at: new Date(t.checkedInAt), tone: "default" });
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการคำสั่งซื้อ">
            <Link href={base}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="order-number">
                {o.number}
              </h1>
              <span data-testid="order-status">
                <StatusPill map={ORDER_STATUS} status={o.status} />
              </span>
              <Badge variant="outline">{SOURCE_LABEL[o.source] ?? o.source}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {e.title} · {o.quantity} ใบ · {o.total ? thb(o.total) : "ฟรี"} · สั่งซื้อ {formatThaiDateTime(o.createdAt)}
            </p>
          </div>
        </div>
        <OrderActions slug={slug} orderId={o.id} status={o.status} canManage={canManage} canStaff={canStaff} liveTickets={live.length} hasContact={!!(o.contactEmail || o.contactPhone)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>รายการบัตร</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                <Item icon={Ticket} label="งาน">
                  <Link href={`${eventsBase(slug)}/${e.id}`} className="hover:text-primary">
                    {e.title}
                  </Link>
                </Item>
                <Item icon={CalendarDays} label="รอบ">{s ? `${s.name ? `${s.name} · ` : ""}${formatThaiSession(s.startsAt, s.endsAt)}` : "ทุกรอบ / ไม่ระบุ"}</Item>
                {e.venueName && (
                  <Item icon={MapPin} label="สถานที่">
                    {e.venueName}
                  </Item>
                )}
                <Item icon={Receipt} label="วิธีชำระ">{PAYMENT_METHOD_LABEL[meta.paymentMethod ?? (o.total === 0 ? "free" : "")] ?? (o.total === 0 ? "บัตรฟรี" : "—")}</Item>
                {o.note && (
                  <div className="flex gap-3 sm:col-span-2">
                    <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">หมายเหตุจากลูกค้า</dt>
                      <dd className="whitespace-pre-line font-medium">{o.note}</dd>
                    </div>
                  </div>
                )}
              </dl>
              <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
                {o.lines.map((l) => (
                  <Row key={l.ticketTypeId} label={`${l.name} × ${l.qty}`} value={l.total ? thb(l.total) : "ฟรี"} />
                ))}
                {o.discount > 0 && <Row label={`ส่วนลด${o.promoCode ? ` (${o.promoCode})` : ""}`} value={`−${thb(o.discount)}`} />}
                <div className="flex items-baseline justify-between border-t pt-3">
                  <dt className="font-medium">ยอดชำระ</dt>
                  <dd className="text-xl font-semibold tabular-nums" data-testid="order-total">
                    {o.total ? thb(o.total) : "ฟรี"}
                  </dd>
                </div>
                {o.refundedAmount > 0 && <Row label="คืนเงินแล้ว" value={thb(o.refundedAmount)} />}
              </dl>
            </CardContent>
          </Card>

          <PaymentCard
            slug={slug}
            orderId={o.id}
            orderStatus={o.status}
            total={o.total}
            paidAmount={o.paidAmount}
            refundedAmount={o.refundedAmount}
            canManage={canManage}
            tickets={tickets}
            refundReleasesSeats={cfg.refundReleasesSeats}
            payments={payments.map((p) => ({ id: p.id, status: p.status, method: p.method, amount: p.amount, refundedAmount: p.refundedAmount, slipUrl: p.slipUrl ? assetUrl(p.slipUrl) : null, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null, failureReason: p.failureReason, current: p.id === o.paymentId }))}
          />

          <TicketsCard slug={slug} orderId={o.id} orderStatus={o.status} tickets={tickets} canManage={canManage} canStaff={canStaff} />

          <Card>
            <CardHeader>
              <CardTitle>ไทม์ไลน์</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", TONE_DOT[t.tone])} aria-hidden />
                    <div>
                      <p className="font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{formatThaiDateTime(t.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>ผู้ซื้อ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <UserRound className="size-4 text-muted-foreground" aria-hidden /> {o.contactName}
              </p>
              {o.contactPhone && (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" aria-hidden />
                  <a href={`tel:${o.contactPhone}`} className="hover:text-primary">
                    {o.contactPhone}
                  </a>
                </p>
              )}
              {o.contactEmail && (
                <p className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" aria-hidden />
                  <a href={`mailto:${o.contactEmail}`} className="truncate hover:text-primary">
                    {o.contactEmail}
                  </a>
                </p>
              )}
              {o.customerId && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/t/${slug}/customers/${o.customerId}`}>ดูประวัติลูกค้า</Link>
                </Button>
              )}
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                ลิงก์หน้าบัตรของลูกค้า (ส่งให้ลูกค้าเปิดดู QR ได้)
                <a href={guestUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 truncate text-primary hover:underline" data-testid="guest-link">
                  <ExternalLink className="size-3 shrink-0" aria-hidden /> {guestUrl}
                </a>
              </div>
            </CardContent>
          </Card>

          <NotesCard slug={slug} orderId={o.id} internalNote={o.internalNote} canWrite={canStaff} />
        </div>
      </div>
    </div>
  );
}

function Item({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
