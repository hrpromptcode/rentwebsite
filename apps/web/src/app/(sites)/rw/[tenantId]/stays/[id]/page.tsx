import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, CalendarDays, CheckCircle2, Clock, History, Lock, MapPin, Moon, Phone, Receipt, RefreshCw, Sparkles, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentRefundRequired, paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import type { StayMeta } from "@rentweb/db";
import { canCustomerCancel, evaluateCancellation, getStayForCustomer, rentalConfig } from "@rentweb/module-rental/services";
import { L, METHOD_LABELS, QuoteBreakdown, STAY_PAYMENT_STATUS, StayStatusBadge, formatThaiDateTime, formatThaiYmd } from "@rentweb/module-rental/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { StayActions } from "./stay-actions";
import { cancelStayAction, renewPaymentAction } from "./actions";

type Params = Promise<{ tenantId: string; id: string }>;
type Search = Promise<{ k?: string }>;

export const metadata: Metadata = { title: "รายละเอียดการจองห้องพัก", robots: { index: false } };

/** /stays/[id]?k=<access key> – confirmation + payment + policy / cancel + directions. Owner or key holder only. */
export default async function StayPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId, id } = await params;
  const { k } = await searchParams;
  const key = k ?? null;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) notFound();
  if (!isUuid(id)) notFound();
  const customer = await getCurrentCustomer(tenantId);
  const detail = await tenantTx(tenantId, (tx) => getStayForCustomer(tx, tenantId, id, { customerId: customer?.id, key }));

  if (!detail) {
    return (
      <PageBody theme={runtime.theme} sections={[]}>
        <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
          <div className="card mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted">
              <Lock className="size-6 text-muted-foreground" />
            </span>
            <h1 className="font-heading text-2xl font-semibold">ไม่สามารถเปิดการจองนี้ได้</h1>
            <p className="text-sm text-muted-foreground">เปิดลิงก์จากข้อความยืนยันการจอง หรือเข้าสู่ระบบด้วยเบอร์โทรที่ใช้จองเพื่อดูรายละเอียด</p>
            <Button asChild size="lg">
              <Link href={`/account/login?next=${encodeURIComponent(`/stays/${id}`)}`}>เข้าสู่ระบบ</Link>
            </Button>
          </div>
        </section>
      </PageBody>
    );
  }

  const { stay, type, payment } = detail;
  const config = rentalConfig(runtime.config.moduleConfig);
  const settings = paymentSettings(runtime.config.settings);
  const now = new Date();
  const keyQs = key ? `?k=${encodeURIComponent(key)}` : "";
  const selfHref = `/stays/${stay.id}${keyQs}`;
  const contact = (runtime.config.settings.contact as { address?: string; phone?: string; mapUrl?: string } | undefined) ?? {};
  const meta = (stay.meta ?? {}) as StayMeta;
  const paymentExpired = !!payment && payment.status === "pending" && !!payment.expiresAt && payment.expiresAt < now;
  const needsPayment = stay.status === "pending" && stay.depositAmount > 0 && stay.paymentStatus === "unpaid";
  const paymentLive = !!payment && (payment.status === "pending_verification" || (payment.status === "pending" && !paymentExpired));
  const showPayment = needsPayment && paymentLive;
  const renew: "expired" | "failed" | "none" | null = needsPayment && !paymentLive ? (paymentExpired || payment?.status === "expired" ? "expired" : payment?.status === "failed" ? "failed" : "none") : null;
  const refundNote = (stay.status === "cancelled" || stay.status === "no_show") && payment?.status === "paid" ? paymentRefundRequired(payment) : null;
  const isActive = stay.status === "pending" || stay.status === "confirmed";
  const policy = evaluateCancellation(stay, config, now);
  const canCancel = canCustomerCancel(stay, now);
  const remaining = Math.max(0, stay.total - stay.paidAmount);
  const headline = L.headline[stay.status] ?? L.summary;
  const cashCollect = meta.payOption === "cash" || meta.payAtProperty === true;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Reveal className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{L.stayNumber}</p>
              <h1 className="font-heading text-3xl font-semibold tracking-wide md:text-4xl" data-testid="stay-number">
                {stay.number}
              </h1>
            </div>
            <span data-testid="stay-status">
              <StayStatusBadge status={stay.status} className="px-4 py-1.5 text-sm" />
            </span>
          </Reveal>

          <Reveal delay={0.05} className="mt-6">
            <div className="card overflow-hidden p-0">
              <div className="flex items-start gap-3 bg-primary-soft px-5 py-4 md:px-7">
                {stay.status === "confirmed" || stay.status === "checked_in" || stay.status === "checked_out" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" /> : <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />}
                <div>
                  <p className="font-heading text-lg font-semibold" data-testid="stay-headline">
                    {headline}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {needsPayment ? L.payToConfirm(thb(stay.depositAmount)) : stay.status === "cancelled" || stay.status === "no_show" ? "หากต้องการจองใหม่ กดปุ่มด้านล่างได้เลย" : cashCollect && remaining > 0 ? `ชำระ ${thb(remaining)} เมื่อเช็กอิน` : remaining > 0 ? `${L.payLater} ${thb(remaining)}` : "บันทึกหน้านี้ไว้เพื่อแสดงตอนเช็กอิน"}
                  </p>
                </div>
              </div>
              <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:p-7">
                <div className="flex items-center gap-4">
                  {type.gallery[0] ? <Img src={type.gallery[0]} alt="" className="size-20 shrink-0 rounded-[var(--radius-lg)] object-cover" /> : <span className="flex size-20 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-muted"><BedDouble className="size-6 text-muted-foreground" /></span>}
                  <div className="min-w-0">
                    <p className="font-heading text-xl font-semibold leading-tight">{type.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Moon className="size-3.5" /> {L.nights(stay.nights)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" /> {L.guestsN(stay.guests)}
                      </span>
                      {stay.unitNumber && (
                        <span className="inline-flex items-center gap-1">
                          <BedDouble className="size-3.5" /> {L.unitNumber} {stay.unitNumber}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:min-w-[260px]">
                  <div className="rounded-[var(--radius-lg)] bg-muted/60 px-4 py-3 text-center">
                    <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" /> {L.checkIn}
                    </p>
                    <p className="font-heading mt-1 text-lg font-semibold leading-tight">{formatThaiYmd(stay.checkIn, { short: true, weekday: true })}</p>
                    <p className="text-xs text-muted-foreground">{L.checkInTime(config.checkInTime)}</p>
                  </div>
                  <div className="rounded-[var(--radius-lg)] bg-muted/60 px-4 py-3 text-center">
                    <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" /> {L.checkOut}
                    </p>
                    <p className="font-heading mt-1 text-lg font-semibold leading-tight">{formatThaiYmd(stay.checkOut, { short: true, weekday: true })}</p>
                    <p className="text-xs text-muted-foreground">{L.checkOutTime(config.checkOutTime)}</p>
                  </div>
                </div>
              </div>
              {(contact.phone || contact.mapUrl) && (
                <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4 md:px-7">
                  {contact.phone && (
                    <Button asChild variant="outline" className="h-11">
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="size-4" /> {L.callProperty}
                      </a>
                    </Button>
                  )}
                  {contact.mapUrl && (
                    <Button asChild variant="ghost" className="h-11">
                      <a href={contact.mapUrl.replace("&output=embed", "")} target="_blank" rel="noreferrer">
                        <MapPin className="size-4" /> {L.directions}
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Reveal>

          {showPayment && payment && (
            <Reveal delay={0.1} className="mt-5" data-testid="stay-payment">
              <PaymentPanel
                payment={{ id: payment.id, method: payment.method, status: payment.status, amount: payment.amount, qrDataUrl: payment.qrPayload ? await promptpayQrDataUrl(payment.qrPayload) : null, expiresAt: payment.expiresAt?.toISOString() ?? null, slipUrl: payment.slipUrl }}
                amountLabel={thb(payment.amount)}
                promptpayName={settings.promptpayName}
                promptpayId={settings.promptpayId}
                bankAccounts={settings.bankAccounts ?? []}
                successHref={selfHref}
                accessKey={key}
              />
              {payment.status === "pending" && <p className="mt-2 text-center text-xs text-muted-foreground">{L.holdNote}</p>}
            </Reveal>
          )}

          {renew && (
            <Reveal delay={0.1} className="card mt-5 flex flex-col items-start gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <p className="font-heading text-lg font-semibold">{renew === "expired" ? L.qrExpired : renew === "failed" ? L.slipRejected : L.payToConfirm(thb(stay.depositAmount))}</p>
                <p className="text-sm text-muted-foreground">
                  {renew === "failed" && payment?.failureReason ? `${payment.failureReason} · ` : ""}
                  สร้างรายการชำระเงินใหม่ {thb(stay.depositAmount)} เพื่อยืนยันการจอง (ระบบตรวจสอบห้องว่างอีกครั้ง)
                </p>
              </div>
              <form action={renewPaymentAction.bind(null, tenantId, stay.id, key)}>
                <Button type="submit" size="lg">
                  <RefreshCw className="size-4" /> {L.renewQr}
                </Button>
              </form>
            </Reveal>
          )}

          <Reveal delay={0.15} className="card mt-5 p-5 md:p-7">
            <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
              <Receipt className="size-5 text-primary" /> {L.summary}
            </h2>
            <div className="mt-4">
              <QuoteBreakdown quote={{ nights: stay.nights, guests: stay.guests, nightly: stay.nightly, roomTotal: stay.roomTotal, extraGuests: Math.max(0, stay.guests - type.baseGuests), extraGuestTotal: stay.extraGuestTotal, extras: stay.extras, extrasTotal: stay.extrasTotal, total: stay.total, deposit: stay.depositAmount, depositPercent: config.depositPercent }} />
            </div>
            <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2">
              <Row label={L.name} value={stay.guestName} />
              {stay.guestPhone && <Row label={L.phone} value={stay.guestPhone} mono />}
              {stay.guestEmail && <Row label="อีเมล" value={stay.guestEmail} />}
              <Row label={L.paymentStatus} value={`${STAY_PAYMENT_STATUS[stay.paymentStatus] ?? stay.paymentStatus}${stay.paidAmount > 0 ? ` (${thb(stay.paidAmount)})` : ""}`} />
              {payment && <Row label="ช่องทาง" value={METHOD_LABELS[payment.method]?.label ?? payment.method} />}
              {remaining > 0 && stay.status !== "cancelled" && stay.status !== "no_show" && <Row label={L.payLater} value={thb(remaining)} />}
              {refundNote && <Row label="การคืนเงิน" value={L.refundNote} />}
              {meta.cancellation && <Row label="ผลการยกเลิก" value={meta.cancellation.free ? L.cancelFree : L.cancelKeep(thb(Math.max(0, stay.paidAmount - meta.cancellation.refundDue)))} />}
              <Row label={L.bookedAt} value={formatThaiDateTime(stay.createdAt)} />
              {stay.confirmedAt && <Row label={L.confirmedAt} value={formatThaiDateTime(stay.confirmedAt)} />}
              {stay.cancelledAt && <Row label={L.cancelledAt} value={formatThaiDateTime(stay.cancelledAt)} />}
              {stay.cancelReason && <Row label={L.reason} value={stay.cancelReason} />}
              {stay.note && <Row label={L.specialRequest} value={stay.note} />}
            </dl>
            {contact.address && (
              <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" /> {contact.address}
              </p>
            )}
            <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
              <Clock className="mt-0.5 size-4 shrink-0" /> {L.checkInTime(config.checkInTime)} · {L.checkOutTime(config.checkOutTime)}
            </p>
          </Reveal>

          {isActive && (
            <Reveal delay={0.2} className="mt-5">
              <StayActions canCancel={canCancel} freeCancelDays={config.freeCancelDays} depositPercent={config.depositPercent} policy={policy} keptLabel={thb(policy.kept || Math.min(stay.depositAmount, Math.max(stay.paidAmount, stay.depositAmount)))} cancelAction={cancelStayAction.bind(null, tenantId, stay.id, key)} />
            </Reveal>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant={stay.status === "cancelled" || stay.status === "no_show" ? "default" : "outline"}>
              <Link href={`/rooms/${encodeURIComponent(type.slug)}`}>
                <Sparkles className="size-4" /> {L.bookAgain}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={customer ? "/account/stays" : `/account/login?next=${encodeURIComponent("/account/stays")}`}>
                <History className="size-4" /> {L.myStays}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </PageBody>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 rounded-[var(--radius-md)] bg-muted/50 px-3 py-2 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono font-medium" : "font-medium"}>{value}</dd>
    </div>
  );
}
