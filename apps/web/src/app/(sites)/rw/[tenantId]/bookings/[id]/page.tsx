import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CalendarPlus, Clock, History, Lock, MapPin, Phone, Receipt, RefreshCw, Sparkles, UserRound, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Img, SectionStyles } from "@rentweb/storefront";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentRefundRequired, paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import { bookingConfig, canCustomerModify, formatBkkTime, formatThaiDate, getBookingForCustomer, packagesEnabled } from "@rentweb/module-booking/services";
import { BookingStatusBadge, BookingStyles, DetailRows, StatusTicket, SuccessCheck, lookOf, wizardDates } from "@rentweb/module-booking/ui";
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
          <BookingStyles />
          <div className="bk-panel bk-float rw-fade mx-auto flex max-w-lg flex-col items-center gap-4 p-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted">
              <Lock className="size-6 text-muted-foreground" />
            </span>
            <h1 className="font-heading text-2xl font-semibold">ไม่สามารถเปิดการจองนี้ได้</h1>
            <p className="text-sm text-muted-foreground">เปิดลิงก์จากข้อความยืนยันการจอง หรือเข้าสู่ระบบด้วยเบอร์โทรที่ใช้จองเพื่อดูรายละเอียด</p>
            <Button asChild size="lg" className="rounded-full">
              <Link href={`/account/login?next=${encodeURIComponent(`/bookings/${id}`)}`}>เข้าสู่ระบบ</Link>
            </Button>
          </div>
        </section>
      </PageBody>
    );
  }

  const { booking, service, staff, extraStaff, payment, package: course, instructor } = detail;
  const look = lookOf(runtime.config);
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
  // classes: the session's instructor stands in for the (null) staff
  const staffNames = [staff?.name ?? instructor?.name, ...extraStaff.map((s) => s.name)].filter(Boolean).join(", ");
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
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-28">
        <SectionStyles />
        <BookingStyles />
        <div className="mx-auto max-w-3xl">
          <div className="rw-fade flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">หมายเลขการจอง</p>
              <h1 className="font-accent text-step-4 leading-none font-semibold tracking-wide">{booking.number}</h1>
            </div>
            <BookingStatusBadge status={booking.status} className="px-4 py-1.5 text-sm" />
          </div>

          <StatusTicket
            className="mt-6"
            band={
              <div className="flex items-start gap-4">
                {booking.status === "confirmed" || booking.status === "completed" ? <SuccessCheck /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-background text-primary"><Sparkles className="size-5" /></span>}
                <div className="min-w-0">
                  <p className="font-heading text-step-2 leading-snug font-semibold">{headline}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{booking.status === "pending" && needsDeposit ? L.depositNote(thb(booking.depositAmount)) : booking.status === "cancelled" ? "หากต้องการจองใหม่ กดปุ่มด้านล่างได้เลย" : "บันทึกหน้านี้ไว้ หรือเพิ่มลงปฏิทินเพื่อไม่ให้พลาดนัด"}</p>
                </div>
              </div>
            }
            footer={
              isActive ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="h-11 rounded-full">
                    <a href={`/bookings/${booking.id}/ics${keyQs}`} download={`${booking.number}.ics`}>
                      <CalendarPlus className="size-4" /> เพิ่มลงปฏิทิน (.ics)
                    </a>
                  </Button>
                  {contact.phone && (
                    <Button asChild variant="ghost" className="h-11 rounded-full">
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="size-4" /> โทรหาร้าน
                      </a>
                    </Button>
                  )}
                </div>
              ) : undefined
            }
          >
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="flex items-center gap-4">
                {service.image ? <Img src={service.image} alt="" className={cn("size-20 shrink-0 object-cover", look === "clinic" ? "bk-arch" : look === "spa" ? "bk-pebble" : "rounded-[var(--radius-lg)]")} /> : <span className="size-20 shrink-0 rounded-[var(--radius-lg)] bg-muted" aria-hidden />}
                <div className="min-w-0">
                  <p className="font-heading text-xl leading-tight font-semibold">{service.name}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
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
              <div className="rounded-[calc(var(--radius,.75rem)*1.2)] border border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] px-6 py-4 text-center md:min-w-[210px]">
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" /> {formatThaiDate(booking.startsAt, { weekday: true })}
                </p>
                <p className="mt-1 font-accent text-step-4 leading-none font-semibold tabular-nums">{formatBkkTime(booking.startsAt)}</p>
                <p className="mt-1 text-xs text-muted-foreground">ถึง {formatBkkTime(booking.endsAt)} น.</p>
              </div>
            </div>
          </StatusTicket>

          {showPayment && payment && (
            <div className="rw-fade mt-5">
              <PaymentPanel
                payment={{ id: payment.id, method: payment.method, status: payment.status, amount: payment.amount, qrDataUrl: payment.qrPayload ? await promptpayQrDataUrl(payment.qrPayload) : null, expiresAt: payment.expiresAt?.toISOString() ?? null, slipUrl: payment.slipUrl }}
                amountLabel={thb(payment.amount)}
                promptpayName={settings.promptpayName}
                promptpayId={settings.promptpayId}
                bankAccounts={settings.bankAccounts ?? []}
                successHref={selfHref}
              />
              {payment.status === "pending" && <p className="mt-2 text-center text-xs text-muted-foreground">หากไม่ชำระมัดจำภายในเวลาที่กำหนด ระบบจะยกเลิกคิวนี้อัตโนมัติเพื่อเปิดให้ลูกค้าท่านอื่น</p>}
            </div>
          )}

          {renew && (
            <div className="bk-panel rw-fade mt-5 flex flex-col items-start gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <p className="font-heading text-lg font-semibold">{renew === "expired" ? "QR ชำระมัดจำหมดอายุแล้ว" : renew === "failed" ? "สลิปไม่ผ่านการตรวจสอบ" : "ชำระมัดจำเพื่อยืนยันคิว"}</p>
                <p className="text-sm text-muted-foreground">
                  {renew === "failed" && payment?.failureReason ? `${payment.failureReason} · ` : ""}
                  {renew === "none" ? `สร้าง QR ชำระมัดจำ ${thb(booking.depositAmount)} เพื่อยืนยันคิว` : `สร้างรายการชำระเงินใหม่เพื่อยืนยันคิว ${thb(booking.depositAmount)}`}
                </p>
              </div>
              <form action={renewPaymentAction.bind(null, tenantId, booking.id, key)}>
                <Button type="submit" size="lg" className="rounded-full">
                  <RefreshCw className="size-4" /> {renew === "none" ? "สร้าง QR ชำระมัดจำ" : "สร้าง QR ใหม่"}
                </Button>
              </form>
            </div>
          )}

          <div className="bk-panel rw-fade mt-5 p-5 md:p-8">
            <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
              <Receipt className="size-5 text-primary" /> รายละเอียด
            </h2>
            <DetailRows
              className="mt-3"
              rows={[
                { label: "ชื่อผู้จอง", value: booking.customerName },
                booking.customerPhone ? { label: "เบอร์โทร", value: booking.customerPhone, mono: true } : null,
                booking.customerEmail ? { label: "อีเมล", value: booking.customerEmail } : null,
                course ? { label: L.useCourse, value: L.courseLeft(course.packageName, course.sessionsLeft) } : { label: L.total, value: booking.price === 0 ? service.priceNote || L.free : thb(booking.price) },
                booking.depositAmount > 0 ? { label: L.deposit, value: thb(booking.depositAmount) } : null,
                // ADMIN_B2-04: booked while the shop had no payment receiver: no deposit was asked, everything is paid at the shop
                !course && (booking.answers as { payAtShop?: boolean } | null)?.payAtShop === true ? { label: L.deposit, value: L.payAtShopBadge } : null,
                { label: "สถานะการชำระ", value: course ? L.courseBookingNote : (PAYMENT_STATUS[booking.paymentStatus] ?? booking.paymentStatus) },
                payment ? { label: "ช่องทาง", value: METHOD_LABELS[payment.method]?.label ?? payment.method } : null,
                remaining > 0 && booking.price > 0 ? { label: L.payAtShop, value: thb(remaining) } : null,
                refundNote ? { label: "การคืนเงิน", value: "ร้านได้รับเงินหลังการจองถูกยกเลิก และจะติดต่อคืนเงินให้" } : null,
                { label: "จองเมื่อ", value: formatThaiDate(booking.createdAt, { time: true }) },
                booking.confirmedAt ? { label: "ยืนยันเมื่อ", value: formatThaiDate(booking.confirmedAt, { time: true }) } : null,
                booking.cancelledAt ? { label: "ยกเลิกเมื่อ", value: formatThaiDate(booking.cancelledAt, { time: true }) } : null,
                booking.cancelReason && booking.cancelReason !== "rescheduled" ? { label: "เหตุผล", value: booking.cancelReason } : null,
                booking.rescheduledFromId ? { label: "หมายเหตุ", value: "เลื่อนมาจากการจองก่อนหน้า" } : null,
                booking.note ? { label: "หมายเหตุถึงร้าน", value: booking.note } : null,
              ]}
            />
            {contact.address && (
              <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" /> {contact.address}
              </p>
            )}
          </div>

          {isActive && (
            <div className="rw-fade mt-5">
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
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant={booking.status === "cancelled" ? "default" : "outline"} className="rounded-full">
              <Link href={`/book?service=${encodeURIComponent(service.slug)}`}>
                <Sparkles className="size-4" /> {booking.status === "cancelled" ? "จองใหม่อีกครั้ง" : "จองบริการนี้อีกครั้ง"}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link href={customer ? "/account/bookings" : `/account/login?next=${encodeURIComponent("/account/bookings")}`}>
                <History className="size-4" /> การจองของฉัน
              </Link>
            </Button>
            {packagesEnabled(runtime.config.modules, runtime.config.moduleConfig) && customer && (
              <Button asChild size="lg" variant="ghost" className="rounded-full">
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
