import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BedDouble, Check, CheckCircle2, Clock, History, Lock, MapPin, Moon, Phone, Receipt, RefreshCw, Sparkles, Users, X } from "lucide-react";
import { Img, SectionStyles, sized } from "@rentweb/storefront";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentRefundRequired, paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import type { StayMeta } from "@rentweb/db";
import { canCustomerCancel, evaluateCancellation, getStayForCustomer, rentalConfig } from "@rentweb/module-rental/services";
import { L, METHOD_LABELS, QuoteBreakdown, RentalStyles, RoomName, STAY_PAYMENT_STATUS, StayStatusBadge, formatThaiDateTime, formatThaiYmd } from "@rentweb/module-rental/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { StayActions } from "./stay-actions";
import { cancelStayAction, renewPaymentAction } from "./actions";

type Params = Promise<{ tenantId: string; id: string }>;
type Search = Promise<{ k?: string }>;

export const metadata: Metadata = { title: "รายละเอียดการจองห้องพัก", robots: { index: false } };

type StepState = "done" | "now" | "todo" | "stop";

/** The stay's journey as a filled track: จองแล้ว → ชำระเงิน → ยืนยันแล้ว → เข้าพัก → เช็กเอาต์ (or a stop). */
function trackFor(status: string, paid: boolean): Array<{ label: string; state: StepState }> {
  const base = ["จองแล้ว", "ชำระเงิน", "ยืนยันแล้ว", "เข้าพัก", "เช็กเอาต์"];
  const mk = (states: StepState[]) => base.map((label, i) => ({ label, state: states[i] ?? "todo" }));
  switch (status) {
    case "pending":
      return mk(["done", "now"]);
    case "confirmed":
      return mk(["done", "done", "done", "now"]);
    case "checked_in":
      return mk(["done", "done", "done", "done", "now"]);
    case "checked_out":
      return mk(["done", "done", "done", "done", "done"]);
    case "cancelled":
      return [
        { label: "จองแล้ว", state: "done" },
        { label: paid ? "ชำระแล้ว" : "ชำระเงิน", state: paid ? "done" : "todo" },
        { label: "ยกเลิกแล้ว", state: "stop" },
      ];
    case "no_show":
      return [
        { label: "จองแล้ว", state: "done" },
        { label: "ยืนยันแล้ว", state: "done" },
        { label: "ไม่มาเข้าพัก", state: "stop" },
      ];
    default:
      return mk(["done"]);
  }
}

/** /stays/[id]?k=<access key> – confirmation "pass" + payment + policy / cancel + directions. Owner or key holder only. */
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
        <RentalStyles />
        <section className="container-x pt-10 pb-20 md:pt-16 md:pb-28">
          <div className="mx-auto flex max-w-xl flex-col items-center gap-5 rounded-[var(--radius-2xl)] border border-border bg-card px-6 py-12 text-center shadow-float md:px-10">
            <span className="flex size-16 items-center justify-center rounded-full bg-muted">
              <Lock className="size-7 text-muted-foreground" aria-hidden />
            </span>
            <h1 className="font-heading text-step-3 font-semibold">ไม่สามารถเปิดการจองนี้ได้</h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">เปิดลิงก์จากข้อความยืนยันการจอง หรือเข้าสู่ระบบด้วยเบอร์โทรที่ใช้จองเพื่อดูรายละเอียด</p>
            <Link href={`/account/login?next=${encodeURIComponent(`/stays/${id}`)}`} className="rw-press inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              เข้าสู่ระบบ <ArrowRight className="size-4" aria-hidden />
            </Link>
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
  const ended = stay.status === "cancelled" || stay.status === "no_show";
  const policy = evaluateCancellation(stay, config, now);
  const canCancel = canCustomerCancel(stay, now);
  const remaining = Math.max(0, stay.total - stay.paidAmount);
  const headline = L.headline[stay.status] ?? L.summary;
  const cashCollect = meta.payOption === "cash" || meta.payAtProperty === true;
  const happy = stay.status === "confirmed" || stay.status === "checked_in" || stay.status === "checked_out";
  const track = trackFor(stay.status, stay.paidAmount > 0);
  const lastLit = track.reduce((acc, s, i) => (s.state !== "todo" ? i : acc), 0);
  const fill = track.length > 1 ? lastLit / (track.length - 1) : 0;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <RentalStyles />
      <SectionStyles />
      <section className="container-x pt-8 pb-16 md:pt-14 md:pb-24">
        <div className="mx-auto max-w-4xl">
          <div className="rw-fade flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{L.stayNumber}</p>
              <h1 className="rw-price-num mt-1 text-step-5 leading-none text-foreground" data-testid="stay-number">
                {stay.number}
              </h1>
            </div>
            <span data-testid="stay-status">
              <StayStatusBadge status={stay.status} className="px-4 py-1.5 text-sm" />
            </span>
          </div>

          {/* the pass */}
          <div className={`rw-pass rw-fade mt-8 rounded-[var(--radius-2xl)] border bg-card shadow-float ${ended ? "border-border opacity-95" : "border-border"}`}>
            <div className={`flex items-start gap-3 px-5 py-5 md:px-8 ${happy ? "bg-primary-soft" : ended ? "bg-muted" : "bg-surface"}`}>
              {happy ? <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-primary-ink" aria-hidden /> : ended ? <X className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden /> : <Sparkles className="mt-0.5 size-6 shrink-0 text-primary-ink" aria-hidden />}
              <div className="min-w-0">
                <p className="font-heading text-step-2 leading-snug font-semibold" data-testid="stay-headline">
                  {headline}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {needsPayment ? L.payToConfirm(thb(stay.depositAmount)) : ended ? "หากต้องการจองใหม่ กดปุ่มด้านล่างได้เลย" : cashCollect && remaining > 0 ? `ชำระ ${thb(remaining)} เมื่อเช็กอิน` : remaining > 0 ? `${L.payLater} ${thb(remaining)}` : "บันทึกหน้านี้ไว้เพื่อแสดงตอนเช็กอิน"}
                </p>
              </div>
            </div>

            <ol className="rw-track gap-1 px-3 pt-6 pb-2 md:px-6" aria-label="สถานะการจอง">
              {track.map((s, i) => (
                <li key={s.label} className="rw-track-step relative flex flex-col items-center gap-2 text-center" data-state={s.state} aria-current={s.state === "now" ? "step" : undefined}>
                  {i < track.length - 1 && (
                    <span aria-hidden className="rw-track-line">
                      <i style={{ "--fill": i < lastLit ? 1 : 0 } as React.CSSProperties} />
                    </span>
                  )}
                  <span className="rw-track-dot">{s.state === "done" ? <Check className="size-3.5" aria-hidden /> : s.state === "stop" ? <X className="size-3.5" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" aria-hidden />}</span>
                  <span className={`text-xs leading-tight md:text-sm ${s.state === "todo" ? "text-muted-foreground" : "font-medium"}`}>{s.label}</span>
                </li>
              ))}
            </ol>
            <span className="sr-only">{`ความคืบหน้า ${Math.round(fill * 100)}%`}</span>

            <div className="grid gap-5 px-5 py-6 md:grid-cols-[auto_1fr] md:items-center md:px-8">
              {type.gallery[0] ? (
                <Img src={sized(type.gallery[0], 520)} alt="" className="aspect-[16/10] w-full rounded-[var(--radius-xl)] object-cover md:w-56" />
              ) : (
                <span className="flex aspect-[16/10] w-full items-center justify-center rounded-[var(--radius-xl)] bg-muted md:w-56">
                  <BedDouble className="size-8 text-muted-foreground" aria-hidden />
                </span>
              )}
              <div className="min-w-0">
                <RoomName as="p" name={type.name} className="font-heading text-step-3 leading-tight font-semibold" />
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Moon className="size-4" aria-hidden /> {L.nights(stay.nights)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" aria-hidden /> {L.guestsN(stay.guests)}
                  </span>
                  {stay.unitNumber && (
                    <span className="inline-flex items-center gap-1.5">
                      <BedDouble className="size-4" aria-hidden /> {L.unitNumber} {stay.unitNumber}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="rw-pass-perf" aria-hidden />

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-7 md:px-8">
              <div>
                <p className="text-xs text-muted-foreground">{L.checkIn}</p>
                <p className="mt-1 font-heading text-step-2 leading-tight font-semibold">{formatThaiYmd(stay.checkIn, { short: true, weekday: true })}</p>
                <p className="mt-1 text-xs text-muted-foreground">{L.checkInTime(config.checkInTime)}</p>
              </div>
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <span aria-hidden className="h-px w-10 bg-border md:w-24" />
                <span className="rw-nights-pill">
                  <Moon className="size-3" aria-hidden /> {L.nights(stay.nights)}
                </span>
                <span aria-hidden className="h-px w-10 bg-border md:w-24" />
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{L.checkOut}</p>
                <p className="mt-1 font-heading text-step-2 leading-tight font-semibold">{formatThaiYmd(stay.checkOut, { short: true, weekday: true })}</p>
                <p className="mt-1 text-xs text-muted-foreground">{L.checkOutTime(config.checkOutTime)}</p>
              </div>
            </div>

            {(contact.phone || contact.mapUrl) && (
              <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4 md:px-8">
                {contact.phone && (
                  <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="rw-press inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:border-foreground">
                    <Phone className="size-4" aria-hidden /> {L.callProperty}
                  </a>
                )}
                {contact.mapUrl && (
                  <a href={contact.mapUrl.replace("&output=embed", "")} target="_blank" rel="noreferrer" className="rw-press inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-primary-ink hover:bg-primary-soft">
                    <MapPin className="size-4" aria-hidden /> {L.directions}
                  </a>
                )}
              </div>
            )}
          </div>

          {showPayment && payment && (
            <div className="rw-fade mt-6" data-testid="stay-payment">
              <PaymentPanel
                payment={{ id: payment.id, method: payment.method, status: payment.status, amount: payment.amount, qrDataUrl: payment.qrPayload ? await promptpayQrDataUrl(payment.qrPayload) : null, expiresAt: payment.expiresAt?.toISOString() ?? null, slipUrl: payment.slipUrl }}
                amountLabel={thb(payment.amount)}
                promptpayName={settings.promptpayName}
                promptpayId={settings.promptpayId}
                bankAccounts={settings.bankAccounts ?? []}
                successHref={selfHref}
                accessKey={key}
              />
              {payment.status === "pending" && <p className="mt-3 text-center text-xs text-muted-foreground">{L.holdNote}</p>}
            </div>
          )}

          {renew && (
            <div className="mt-6 flex flex-col items-start gap-4 rounded-[var(--radius-2xl)] border border-border bg-card p-5 md:flex-row md:items-center md:justify-between md:p-7">
              <div>
                <p className="font-heading text-step-1 font-semibold">{renew === "expired" ? L.qrExpired : renew === "failed" ? L.slipRejected : L.payToConfirm(thb(stay.depositAmount))}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {renew === "failed" && payment?.failureReason ? `${payment.failureReason} · ` : ""}
                  สร้างรายการชำระเงินใหม่ {thb(stay.depositAmount)} เพื่อยืนยันการจอง (ระบบตรวจสอบห้องว่างอีกครั้ง)
                </p>
              </div>
              <form action={renewPaymentAction.bind(null, tenantId, stay.id, key)}>
                <button type="submit" className="rw-press inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <RefreshCw className="size-4" aria-hidden /> {L.renewQr}
                </button>
              </form>
            </div>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-[var(--radius-2xl)] border border-border bg-card p-5 md:p-7">
              <h2 className="flex items-center gap-2 font-heading text-step-1 font-semibold">
                <Receipt className="size-5 text-primary-ink" aria-hidden /> {L.summary}
              </h2>
              <div className="mt-5">
                <QuoteBreakdown quote={{ nights: stay.nights, guests: stay.guests, nightly: stay.nightly, roomTotal: stay.roomTotal, extraGuests: Math.max(0, stay.guests - type.baseGuests), extraGuestTotal: stay.extraGuestTotal, extras: stay.extras, extrasTotal: stay.extrasTotal, total: stay.total, deposit: stay.depositAmount, depositPercent: config.depositPercent }} />
              </div>
            </div>
            <div className="rounded-[var(--radius-2xl)] border border-border bg-card p-5 md:p-7">
              <h2 className="font-heading text-step-1 font-semibold">ข้อมูลการจอง</h2>
              <dl className="mt-4 divide-y divide-border text-sm">
                <Row label={L.name} value={stay.guestName} />
                {stay.guestPhone && <Row label={L.phone} value={stay.guestPhone} mono />}
                {stay.guestEmail && <Row label="อีเมล" value={stay.guestEmail} />}
                <Row label={L.paymentStatus} value={`${STAY_PAYMENT_STATUS[stay.paymentStatus] ?? stay.paymentStatus}${stay.paidAmount > 0 ? ` (${thb(stay.paidAmount)})` : ""}`} />
                {payment && <Row label="ช่องทาง" value={METHOD_LABELS[payment.method]?.label ?? payment.method} />}
                {remaining > 0 && !ended && <Row label={L.payLater} value={thb(remaining)} />}
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
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {contact.address}
                </p>
              )}
              <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> {L.checkInTime(config.checkInTime)} · {L.checkOutTime(config.checkOutTime)}
              </p>
            </div>
          </div>

          {isActive && (
            <div className="mt-6">
              <StayActions canCancel={canCancel} freeCancelDays={config.freeCancelDays} depositPercent={config.depositPercent} policy={policy} keptLabel={thb(policy.kept || Math.min(stay.depositAmount, Math.max(stay.paidAmount, stay.depositAmount)))} cancelAction={cancelStayAction.bind(null, tenantId, stay.id, key)} />
            </div>
          )}

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={`/rooms/${encodeURIComponent(type.slug)}`} className={`rw-press inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold ${ended ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:border-foreground"}`}>
              <Sparkles className="size-4" aria-hidden /> {L.bookAgain}
            </Link>
            <Link href={customer ? "/account/stays" : `/account/login?next=${encodeURIComponent("/account/stays")}`} className="rw-press inline-flex min-h-12 items-center gap-2 rounded-full border border-border px-6 text-sm font-semibold hover:border-foreground">
              <History className="size-4" aria-hidden /> {L.myStays}
            </Link>
          </div>
        </div>
      </section>
    </PageBody>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? "text-right font-mono font-medium" : "text-right font-medium"}>{value}</dd>
    </div>
  );
}
