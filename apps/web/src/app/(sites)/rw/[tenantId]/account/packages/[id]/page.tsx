import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, CalendarDays, ChevronLeft, Package, Receipt, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Img } from "@rentweb/storefront";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import { formatThaiDate, getPatientPackageForCustomer, packagesEnabled } from "@rentweb/module-booking/services";
import { CompactIntro, DetailRows, PackageStatusBadge, StatusTicket, SuccessCheck } from "@rentweb/module-booking/ui";
import { L, METHOD_LABELS } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { renewPackagePaymentAction } from "./actions";

type Params = Promise<{ tenantId: string; id: string }>;

export const metadata: Metadata = { title: "รายละเอียดคอร์ส", robots: { index: false } };

/** /account/packages/[id] – one purchased course: payment (while pending), sessions left, validity. */
export default async function AccountPackagePage({ params }: { params: Params }) {
  const { tenantId, id } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !packagesEnabled(runtime.config.modules, runtime.config.moduleConfig)) notFound();
  if (!isUuid(id)) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent(`/account/packages/${id}`)}`);
  const item = await tenantTx(tenantId, (tx) => getPatientPackageForCustomer(tx, tenantId, id, customer));
  if (!item) notFound();

  const settings = paymentSettings(runtime.config.settings);
  const payment = item.payment;
  const now = new Date();
  const paymentExpired = !!payment && payment.status === "pending" && !!payment.expiresAt && payment.expiresAt < now;
  const pending = item.status === "pending";
  const paymentLive = !!payment && (payment.status === "pending_verification" || (payment.status === "pending" && !paymentExpired));
  const showPayment = pending && paymentLive;
  const cancelled = item.status === "cancelled";
  const usable = item.status === "active" && !item.isExpired;
  const pct = item.sessionsTotal > 0 ? Math.round((item.sessionsLeft / item.sessionsTotal) * 100) : 0;
  const selfHref = `/account/packages/${item.id}`;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-28">
        <div className="mx-auto max-w-3xl">
          <CompactIntro
            back={
              <Link href="/account/packages" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
                <ChevronLeft className="size-4" /> คอร์สของฉัน
              </Link>
            }
            eyebrow={item.serviceName ?? "คอร์ส"}
            title={item.packageName}
            right={<PackageStatusBadge status={item.status} expired={item.isExpired} className="px-4 py-1.5 text-sm" />}
          />

          <StatusTicket
            className="mt-6"
            band={
              <div className="flex items-start gap-4">
                {usable ? <SuccessCheck /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-background text-primary"><Sparkles className="size-5" /></span>}
                <div className="min-w-0">
                  <p className="font-heading text-step-2 leading-snug font-semibold">{pending ? "ชำระเงินเพื่อเปิดใช้งานคอร์ส" : cancelled ? "รายการสั่งซื้อนี้ถูกยกเลิก" : usable ? "คอร์สพร้อมใช้งาน จองคิวเพื่อใช้สิทธิ์ได้เลย" : item.isExpired ? "คอร์สนี้หมดอายุแล้ว" : item.status === "exhausted" ? "ใช้สิทธิ์ครบแล้ว ขอบคุณที่ไว้วางใจ" : "รายละเอียดคอร์ส"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{pending ? "คอร์สจะเปิดใช้งานและเริ่มนับอายุทันทีเมื่อยืนยันการชำระ" : cancelled ? "ไม่ได้ชำระเงินภายในเวลาที่กำหนด สั่งซื้อใหม่ได้จากหน้าแพ็กเกจ" : item.expiresAt ? `${item.isExpired ? "หมดอายุเมื่อ" : "ใช้ได้ถึง"} ${formatThaiDate(item.expiresAt, { weekday: true })}` : ""}</p>
                </div>
              </div>
            }
          >
            <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
              {item.packageImage ? <Img src={item.packageImage} alt="" className="size-24 rounded-[calc(var(--radius,.75rem)*1.2)] object-cover" /> : <span className="flex size-24 items-center justify-center rounded-[calc(var(--radius,.75rem)*1.2)] bg-muted"><Package className="size-8 text-muted-foreground" /></span>}
              <div>
                <div className="flex items-end justify-between gap-3">
                  <p className="text-sm text-muted-foreground">ครั้งคงเหลือ</p>
                  <p className="font-accent text-step-4 leading-none font-semibold tabular-nums">
                    {item.sessionsLeft}
                    <span className="font-body text-base font-normal text-muted-foreground">/{item.sessionsTotal}</span>
                  </p>
                </div>
                <div className="bk-meter mt-3 !h-2.5" role="progressbar" aria-valuenow={item.sessionsLeft} aria-valuemin={0} aria-valuemax={item.sessionsTotal} aria-label="ครั้งคงเหลือ">
                  <i style={{ transform: `scaleX(${usable ? pct / 100 : 0})` }} />
                </div>
                {item.packageDescription && <p className="mt-3 text-sm text-muted-foreground">{item.packageDescription}</p>}
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
            </div>
          )}

          {pending && !paymentLive && (
            <div className="bk-panel rw-fade mt-5 flex flex-col items-start gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <p className="font-heading text-lg font-semibold">QR ชำระเงินหมดอายุแล้ว</p>
                <p className="text-sm text-muted-foreground">สร้างรายการชำระเงินใหม่ {thb(item.pricePaid)} เพื่อเปิดใช้งานคอร์ส</p>
              </div>
              <form action={renewPackagePaymentAction.bind(null, tenantId, item.id)}>
                <Button type="submit" size="lg" className="rounded-full">
                  <RefreshCw className="size-4" /> สร้าง QR ใหม่
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
                { label: "ราคาคอร์ส", value: thb(item.pricePaid) },
                { label: "จำนวนครั้ง", value: L.sessions(item.sessionsTotal) },
                { label: "ใช้ไปแล้ว", value: L.sessions(item.sessionsUsed) },
                payment ? { label: "ช่องทางชำระ", value: METHOD_LABELS[payment.method]?.label ?? payment.method } : null,
                { label: pending ? "สร้างรายการเมื่อ" : "ซื้อเมื่อ", value: formatThaiDate(item.purchasedAt, { time: true }) },
                item.expiresAt ? { label: "หมดอายุ", value: formatThaiDate(item.expiresAt) } : null,
              ]}
            />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {usable && item.sessionsLeft > 0 && (
              <Button asChild size="lg" className="rounded-full">
                <Link href={`/book?${new URLSearchParams({ ...(item.serviceSlug ? { service: item.serviceSlug } : {}), package: item.id }).toString()}`}>
                  <CalendarDays className="size-4" /> จองคิวใช้สิทธิ์
                </Link>
              </Button>
            )}
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link href="/packages">
                <CalendarClock className="size-4" /> ดูคอร์สอื่น
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </PageBody>
  );
}
