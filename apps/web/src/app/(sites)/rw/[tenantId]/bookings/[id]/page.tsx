import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CalendarPlus, CheckCircle2, Clock, History, Lock, MapPin, Phone, Receipt, RefreshCw, Sparkles, UserRound, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentRefundRequired, paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import { bookingConfig, canCustomerModify, formatBkkTime, formatThaiDate, getBookingForCustomer } from "@rentweb/module-booking/services";
import { BookingStatusBadge, wizardDates } from "@rentweb/module-booking/ui";
import { L, METHOD_LABELS, PAYMENT_STATUS } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { BookingActions } from "./booking-actions";
import { cancelBookingAction, renewPaymentAction, rescheduleBookingAction } from "./actions";

type Params = Promise<{ tenantId: string; id: string }>;
type Search = Promise<{ k?: string }>;

export const metadata: Metadata = { title: "รายละเอียดการจอง", robots: { index: false } };

/** /bookings/[id]?k=<access key> – confirmation + deposit payment + reschedule/cancel. Owner or key holder only. */
export default async function BookingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId, id } = await params;
  const { k } = await searchParams;
  const key = k ?? null;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) notFound();
  if (!isUuid(id)) notFound();
  const customer = await getCurrentCustomer(tenantId);
  const detail = await tenantTx(tenantId, (tx) => getBookingForCustomer(tx, tenantId, id, { customerId: customer?.id, key }));

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
              <Link href={`/account/login?next=${encodeURIComponent(`/bookings/${id}`)}`}>เข้าสู่ระบบ</Link>
            </Button>
          </div>
        </section>
      </PageBody>
    );
  }

  const { booking, service, staff, extraStaff, payment, package: course } = detail;
  const config = bookingConfig(runtime.config.moduleConfig);
  const settings = paymentSettings(runtime.config.settings);
  const now = new Date();
  const keyQs = key ? `?k=${encodeURIComponent(key)}` : "";
  const selfHref = `/bookings/${booking.id}${keyQs}`;
  const contact = (runtime.config.settings.contact as { address?: string; phone?: string } | undefined) ?? {};
  const paymentExpired = !!payment && payment.status === "pending" && !!payment.expiresAt && payment.expiresAt < now;
  const needsDeposit = booking.status === "pending" && booking.depositAmount > 0 && booking.paymentStatus === "unpaid";
  // a QR that can still be paid, or a slip under review (SBR-009: a rescheduled booking gets its own live QR)
  const paymentLive = !!payment && (payment.status === "pending_verification" || (payment.status === "pending" && !paymentExpired));
  const showPayment = needsDeposit && paymentLive;
  const renew: "expired" | "failed" | "none" | null = needsDeposit && !paymentLive ? (paymentExpired || payment?.status === "expired" ? "expired" : payment?.status === "failed" ? "failed" : "none") : null;
  const refundNote = booking.status === "cancelled" && payment?.status === "paid" ? paymentRefundRequired(payment) : null;
  const group = service.capacity > 1 || !service.requiresStaff;
  const staffNames = [staff?.name, ...extraStaff.map((s) => s.name)].filter(Boolean).join(", ");
  const canModify = canCustomerModify(booking, config, now);
  const isActive = booking.status === "pending" || booking.status === "confirmed";
  const { today, maxDate } = wizardDates(config, now);
  const remaining = Math.max(0, booking.price - (booking.paymentStatus === "paid" ? booking.price : booking.paymentStatus === "deposit_paid" ? booking.depositAmount : 0));

  const headline =
    booking.status === "confirmed"
      ? "จองสำเร็จ เจอกันตามนัดนะ"
      : booking.status === "pending"
        ? "อีกนิดเดียว ชำระมัดจำเพื่อยืนยันคิว"
        : booking.status === "cancelled"
          ? "การจองนี้ถูกยกเลิกแล้ว"
          : booking.status === "completed"
            ? "ขอบคุณที่มาใช้บริการ"
            : (L.summary as string);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Reveal className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">หมายเลขการจอง</p>
              <h1 className="font-heading text-3xl font-semibold tracking-wide md:text-4xl">{booking.number}</h1>
            </div>
            <BookingStatusBadge status={booking.status} className="px-4 py-1.5 text-sm" />
          </Reveal>

          <Reveal delay={0.05} className="mt-6">
            <div className="card overflow-hidden p-0">
              <div className="flex items-start gap-3 bg-primary-soft px-5 py-4 md:px-7">
                {booking.status === "confirmed" || booking.status === "completed" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" /> : <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />}
                <div>
                  <p className="font-heading text-lg font-semibold">{headline}</p>
                  <p className="text-sm text-muted-foreground">{booking.status === "pending" && needsDeposit ? L.depositNote(thb(booking.depositAmount)) : booking.status === "cancelled" ? "หากต้องการจองใหม่ กดปุ่มด้านล่างได้เลย" : "บันทึกหน้านี้ไว้ หรือเพิ่มลงปฏิทินเพื่อไม่ให้พลาดนัด"}</p>
                </div>
              </div>
              <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:p-7">
                <div className="flex items-center gap-4">
                  {service.image ? <Img src={service.image} alt="" className="size-20 shrink-0 rounded-[var(--radius-lg)] object-cover" /> : <span className="size-20 shrink-0 rounded-[var(--radius-lg)] bg-muted" aria-hidden />}
                  <div className="min-w-0">
                    <p className="font-heading text-xl font-semibold leading-tight">{service.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" /> {L.minutes(service.durationMin)}
                      </span>
                      {staffNames && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="size-3.5" /> {staffNames}
                        </span>
                      )}
                      {booking.partySize > 1 && <span>{L.guests(booking.partySize)}</span>}
                    </p>
                  </div>
                </div>
                <div className="rounded-[var(--radius-lg)] bg-muted/60 px-5 py-4 text-center md:min-w-[200px]">
                  <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" /> {formatThaiDate(booking.startsAt, { weekday: true })}
                  </p>
                  <p className="font-heading mt-1 text-3xl font-semibold tabular-nums">{formatBkkTime(booking.startsAt)}</p>
                  <p className="text-xs text-muted-foreground">ถึง {formatBkkTime(booking.endsAt)} น.</p>
                </div>
              </div>
              {isActive && (
                <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4 md:px-7">
                  <Button asChild variant="outline" className="h-11">
                    <a href={`/bookings/${booking.id}/ics${keyQs}`} download={`${booking.number}.ics`}>
                      <CalendarPlus className="size-4" /> เพิ่มลงปฏิทิน (.ics)
                    </a>
                  </Button>
                  {contact.phone && (
                    <Button asChild variant="ghost" className="h-11">
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="size-4" /> โทรหาร้าน
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Reveal>

          {showPayment && payment && (
            <Reveal delay={0.1} className="mt-5">
              <PaymentPanel
                payment={{ id: payment.id, method: payment.method, status: payment.status, amount: payment.amount, qrDataUrl: payment.qrPayload ? await promptpayQrDataUrl(payment.qrPayload) : null, expiresAt: payment.expiresAt?.toISOString() ?? null, slipUrl: payment.slipUrl }}
                amountLabel={thb(payment.amount)}
                promptpayName={settings.promptpayName}
                promptpayId={settings.promptpayId}
                bankAccounts={settings.bankAccounts ?? []}
                successHref={selfHref}
              />
              {payment.status === "pending" && <p className="mt-2 text-center text-xs text-muted-foreground">หากไม่ชำระมัดจำภายในเวลาที่กำหนด ระบบจะยกเลิกคิวนี้อัตโนมัติเพื่อเปิดให้ลูกค้าท่านอื่น</p>}
            </Reveal>
          )}

          {renew && (
            <Reveal delay={0.1} className="card mt-5 flex flex-col items-start gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <p className="font-heading text-lg font-semibold">{renew === "expired" ? "QR ชำระมัดจำหมดอายุแล้ว" : renew === "failed" ? "สลิปไม่ผ่านการตรวจสอบ" : "ชำระมัดจำเพื่อยืนยันคิว"}</p>
                <p className="text-sm text-muted-foreground">
                  {renew === "failed" && payment?.failureReason ? `${payment.failureReason} · ` : ""}
                  {renew === "none" ? `สร้าง QR ชำระมัดจำ ${thb(booking.depositAmount)} เพื่อยืนยันคิว` : `สร้างรายการชำระเงินใหม่เพื่อยืนยันคิว ${thb(booking.depositAmount)}`}
                </p>
              </div>
              <form action={renewPaymentAction.bind(null, tenantId, booking.id, key)}>
                <Button type="submit" size="lg">
                  <RefreshCw className="size-4" /> {renew === "none" ? "สร้าง QR ชำระมัดจำ" : "สร้าง QR ใหม่"}
                </Button>
              </form>
            </Reveal>
          )}

          <Reveal delay={0.15} className="card mt-5 p-5 md:p-7">
            <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
              <Receipt className="size-5 text-primary" /> รายละเอียด
            </h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Row label="ชื่อผู้จอง" value={booking.customerName} />
              {booking.customerPhone && <Row label="เบอร์โทร" value={booking.customerPhone} mono />}
              {booking.customerEmail && <Row label="อีเมล" value={booking.customerEmail} />}
              {course ? (
                <Row label={L.useCourse} value={L.courseLeft(course.packageName, course.sessionsLeft)} />
              ) : (
                <Row label={L.total} value={booking.price === 0 ? service.priceNote || L.free : thb(booking.price)} />
              )}
              {booking.depositAmount > 0 && <Row label={L.deposit} value={thb(booking.depositAmount)} />}
              {/* ADMIN_B2-04: booked while the shop had no payment receiver: no deposit was asked, everything is paid at the shop */}
              {!course && (booking.answers as { payAtShop?: boolean } | null)?.payAtShop === true && <Row label={L.deposit} value={L.payAtShopBadge} />}
              <Row label="สถานะการชำระ" value={course ? L.courseBookingNote : (PAYMENT_STATUS[booking.paymentStatus] ?? booking.paymentStatus)} />
              {payment && <Row label="ช่องทาง" value={METHOD_LABELS[payment.method]?.label ?? payment.method} />}
              {remaining > 0 && booking.price > 0 && <Row label={L.payAtShop} value={thb(remaining)} />}
              {refundNote && <Row label="การคืนเงิน" value="ร้านได้รับเงินหลังการจองถูกยกเลิก และจะติดต่อคืนเงินให้" />}
              <Row label="จองเมื่อ" value={formatThaiDate(booking.createdAt, { time: true })} />
              {booking.confirmedAt && <Row label="ยืนยันเมื่อ" value={formatThaiDate(booking.confirmedAt, { time: true })} />}
              {booking.cancelledAt && <Row label="ยกเลิกเมื่อ" value={formatThaiDate(booking.cancelledAt, { time: true })} />}
              {booking.cancelReason && booking.cancelReason !== "rescheduled" && <Row label="เหตุผล" value={booking.cancelReason} />}
              {booking.rescheduledFromId && <Row label="หมายเหตุ" value="เลื่อนมาจากการจองก่อนหน้า" />}
              {booking.note && <Row label="หมายเหตุถึงร้าน" value={booking.note} />}
            </dl>
            {contact.address && (
              <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" /> {contact.address}
              </p>
            )}
          </Reveal>

          {isActive && (
            <Reveal delay={0.2} className="mt-5">
              <BookingActions
                canModify={canModify}
                cancelHours={config.cancelHours}
                serviceId={booking.serviceId}
                staffId={group ? null : booking.staffId}
                today={today}
                maxDate={maxDate}
                showRemaining={service.capacity > 1}
                partySize={group ? booking.partySize : undefined}
                cancelAction={cancelBookingAction.bind(null, tenantId, booking.id, key)}
                rescheduleAction={rescheduleBookingAction.bind(null, tenantId, booking.id, key)}
              />
            </Reveal>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant={booking.status === "cancelled" ? "default" : "outline"}>
              <Link href={`/book?service=${encodeURIComponent(service.slug)}`}>
                <Sparkles className="size-4" /> {booking.status === "cancelled" ? "จองใหม่อีกครั้ง" : "จองบริการนี้อีกครั้ง"}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={customer ? "/account/bookings" : `/account/login?next=${encodeURIComponent("/account/bookings")}`}>
                <History className="size-4" /> การจองของฉัน
              </Link>
            </Button>
            {runtime.config.modules.includes("clinic") && customer && (
              <Button asChild size="lg" variant="ghost">
                <Link href="/account/packages">
                  <Wallet className="size-4" /> คอร์สของฉัน
                </Link>
              </Button>
            )}
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
