import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Clock, ExternalLink, Mail, MessageSquareText, Phone, Sparkles, UserRound, Users } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { cn } from "@rentweb/ui/lib/utils";
import { bkkDateString, formatBkkTime, formatThaiDate, getBookingAdmin, listStaffForServiceAdmin } from "@rentweb/module-booking/admin";
import { BOOKING_STATUS, CANCELLABLE_STATUSES, PAY_AT_SHOP_LABEL, PAYMENT_STATUS, RESCHEDULABLE_STATUSES, SOURCE_LABEL, STATUS_ACTIONS } from "@rentweb/module-booking/admin/labels";
import { Avatar, StatusPill } from "@rentweb/module-booking/admin/ui";
import { assetUrl, fmtDate, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { DepositCard, InternalNote, RescheduleCard, StatusActions } from "./booking-panels";

export const metadata: Metadata = { title: "รายละเอียดการจอง" };

const TIER_TH: Record<string, string> = { member: "สมาชิก", vip: "VIP", agent: "ตัวแทน" };

const TONE_DOT: Record<string, string> = { default: "bg-primary", success: "bg-emerald-500", warning: "bg-amber-500", destructive: "bg-rose-500", muted: "bg-muted-foreground/40" };

export default async function BookingDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const data = await tenantTx(ctx.tenant.id, async (tx) => {
    const d = await getBookingAdmin(tx, ctx.tenant.id, id);
    if (!d) return null;
    const staff = await listStaffForServiceAdmin(tx, ctx.tenant.id, d.booking.serviceId);
    return { ...d, eligible: staff };
  });
  if (!data) notFound();
  const { booking: b, service, staff, extraStaff, customer, payment, rescheduledFrom, rescheduledTo, timeline, customerHistory, eligible, payAtShop } = data;
  const canWrite = hasRole(ctx, "staff");
  const canApprove = hasRole(ctx, "manager");
  const actions = STATUS_ACTIONS[b.status] ?? [];
  const canCancel = (CANCELLABLE_STATUSES as readonly string[]).includes(b.status);
  const canReschedule = canWrite && (RESCHEDULABLE_STATUSES as readonly string[]).includes(b.status);
  const day = bkkDateString(b.startsAt);
  const today = bkkDateString(new Date());
  // creation first, then chronological (confirmedAt can be a few ms earlier than the DB default createdAt)
  const events = [...timeline.filter((t) => t.label.startsWith("สร้างการจอง")), ...timeline.filter((t) => !t.label.startsWith("สร้างการจอง"))];
  const durationMin = Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปปฏิทิน">
            <Link href={`/t/${slug}/bookings${day !== today ? `?date=${day}` : ""}`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="booking-number">
                {b.number}
              </h1>
              <span data-testid="booking-status">
                <StatusPill map={BOOKING_STATUS} status={b.status} />
              </span>
              <Badge variant="outline">{SOURCE_LABEL[b.source] ?? b.source}</Badge>
              {payAtShop && (
                <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100" data-testid="pay-at-shop-badge">
                  {PAY_AT_SHOP_LABEL}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {service?.name ?? "บริการ"} · {formatThaiDate(b.startsAt, { weekday: true })} · {formatBkkTime(b.startsAt)}–{formatBkkTime(b.endsAt)}
            </p>
          </div>
        </div>
        <StatusActions slug={slug} id={b.id} actions={actions} canCancel={canCancel} canWrite={canWrite} />
      </div>

      {(rescheduledFrom || rescheduledTo) && (
        <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-6">
          {rescheduledFrom && (
            <Link href={`/t/${slug}/bookings/${rescheduledFrom.id}`} className="inline-flex items-center gap-1.5 hover:text-primary">
              <ArrowLeft className="size-4" aria-hidden /> เลื่อนมาจาก {rescheduledFrom.number} ({formatThaiDate(rescheduledFrom.startsAt, { short: true, time: true })})
            </Link>
          )}
          {rescheduledTo && (
            <Link href={`/t/${slug}/bookings/${rescheduledTo.id}`} className="inline-flex items-center gap-1.5 font-medium text-primary">
              เลื่อนไปเป็น {rescheduledTo.number} ({formatThaiDate(rescheduledTo.startsAt, { short: true, time: true })}) <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>รายละเอียดนัด</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                <div className="flex gap-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">บริการ</dt>
                    <dd className="font-medium">{service ? <Link href={`/t/${slug}/services/${service.id}`} className="hover:text-primary">{service.name}</Link> : "—"}</dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">ผู้ให้บริการ</dt>
                    <dd className="flex flex-wrap items-center gap-2 font-medium">
                      {staff ? (
                        <>
                          <Avatar src={staff.avatar ? assetUrl(staff.avatar) : null} name={staff.name} color={staff.color} size="sm" className="size-6" />
                          <Link href={`/t/${slug}/staff/${staff.id}`} className="hover:text-primary">
                            {staff.name}
                          </Link>
                          {extraStaff.map((x) => (
                            <Link key={x.id} href={`/t/${slug}/staff/${x.id}`} className="hover:text-primary">
                              + {x.name}
                            </Link>
                          ))}
                        </>
                      ) : (
                        "ไม่ระบุ"
                      )}
                    </dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <dt className="text-xs text-muted-foreground">วันที่</dt>
                    <dd className="font-medium">
                      <Link href={`/t/${slug}/bookings${day !== today ? `?date=${day}` : ""}`} className="hover:text-primary">
                        {formatThaiDate(b.startsAt, { weekday: true })}
                      </Link>
                    </dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <dt className="text-xs text-muted-foreground">เวลา</dt>
                    <dd className="font-medium tabular-nums">
                      {formatBkkTime(b.startsAt)}–{formatBkkTime(b.endsAt)} <span className="font-normal text-muted-foreground">({durationMin} นาที)</span>
                    </dd>
                  </div>
                </div>
                {b.partySize > 1 && (
                  <div className="flex gap-3">
                    <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <dt className="text-xs text-muted-foreground">จำนวนคน</dt>
                      <dd className="font-medium">{b.partySize} คน</dd>
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center text-xs font-semibold text-muted-foreground">฿</span>
                  <div>
                    <dt className="text-xs text-muted-foreground">ราคา</dt>
                    <dd className="font-medium tabular-nums">
                      {b.price ? thb(b.price) : "ฟรี"} <span className="font-normal text-muted-foreground">· {PAYMENT_STATUS[b.paymentStatus] ?? b.paymentStatus}{payAtShop && b.paymentStatus === "unpaid" ? ` (${PAY_AT_SHOP_LABEL})` : ""}</span>
                    </dd>
                  </div>
                </div>
              </dl>
              {b.note && (
                <div className="mt-5 flex gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                  <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-xs text-muted-foreground">หมายเหตุจากลูกค้า</p>
                    <p className="whitespace-pre-wrap">{b.note}</p>
                  </div>
                </div>
              )}
              {b.cancelReason && (b.status === "cancelled" || b.status === "no_show") && (
                <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-500/10 dark:text-rose-100">
                  {b.status === "no_show" ? "ลูกค้าไม่มาตามนัด" : `ยกเลิกโดย ${b.cancelledBy === "customer" ? "ลูกค้า" : b.cancelledBy === "admin" ? "ร้าน" : (b.cancelledBy ?? "-")}: ${b.cancelReason === "rescheduled" ? "เลื่อนนัด" : b.cancelReason}`}
                </p>
              )}
            </CardContent>
          </Card>

          {canReschedule && (
            <RescheduleCard
              slug={slug}
              bookingId={b.id}
              serviceId={b.serviceId}
              currentStart={b.startsAt.toISOString()}
              currentStaffId={b.staffId}
              today={today}
              staff={eligible.map((s) => ({ id: s.id, name: s.name, color: s.color, avatar: null }))}
            />
          )}

          <DepositCard
            slug={slug}
            bookingId={b.id}
            depositAmount={b.depositAmount}
            bookingPaymentStatus={b.paymentStatus}
            bookingStatus={b.status}
            payAtShop={payAtShop}
            canApprove={canApprove}
            canWrite={canWrite}
            payment={
              payment
                ? {
                    id: payment.id,
                    status: payment.status,
                    method: payment.method,
                    amount: payment.amount,
                    slipUrl: payment.slipUrl ? assetUrl(payment.slipUrl) : null,
                    createdAt: payment.createdAt.toISOString(),
                    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
                    failureReason: payment.failureReason,
                  }
                : null
            }
          />
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>ลูกค้า</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={b.customerName} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.customerName}</p>
                  {customer && (
                    <p className="text-xs text-muted-foreground">
                      {TIER_TH[customer.tier] ?? customer.tier} · ใช้จ่ายรวม {thb(customer.totalSpent)}
                    </p>
                  )}
                </div>
                {customer && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/t/${slug}/customers/${customer.id}`}>
                      <ExternalLink aria-hidden /> โปรไฟล์
                    </Link>
                  </Button>
                )}
              </div>
              <div className="grid gap-2 text-sm">
                {b.customerPhone && (
                  <a href={`tel:${b.customerPhone.replace(/[^\d+]/g, "")}`} className="flex min-h-10 items-center gap-2 rounded-lg border px-3 hover:bg-muted">
                    <Phone className="size-4 text-muted-foreground" aria-hidden /> {b.customerPhone}
                  </a>
                )}
                {b.customerEmail && (
                  <a href={`mailto:${b.customerEmail}`} className="flex min-h-10 items-center gap-2 truncate rounded-lg border px-3 hover:bg-muted">
                    <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden /> <span className="truncate">{b.customerEmail}</span>
                  </a>
                )}
                {!b.customerPhone && !b.customerEmail && <p className="text-muted-foreground">ไม่มีข้อมูลติดต่อ</p>}
              </div>
              {customerHistory.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">การจองอื่นของลูกค้า ({fmtNumber(customerHistory.length)})</p>
                  <ul className="divide-y rounded-xl border text-sm">
                    {customerHistory.map((h) => (
                      <li key={h.id}>
                        <Link href={`/t/${slug}/bookings/${h.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{h.serviceName}</span>
                            <span className="block text-xs text-muted-foreground">{formatThaiDate(h.startsAt, { short: true, time: true })}</span>
                          </span>
                          <StatusPill map={BOOKING_STATUS} status={h.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <InternalNote slug={slug} bookingId={b.id} initial={b.internalNote ?? ""} canWrite={canWrite} />

          <Card>
            <CardHeader>
              <CardTitle>ประวัติ</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5" data-testid="booking-timeline">
                {events.map((t, i) => (
                  <li key={i} className="relative text-sm">
                    <span className={cn("absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-card", TONE_DOT[t.tone] ?? TONE_DOT.default)} aria-hidden />
                    <p className="font-medium">{t.label.replace(/\((walk_in|admin|online|line)\)/, (_, s: string) => `(${SOURCE_LABEL[s] ?? s})`)}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(t.at, { withTime: true })}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
