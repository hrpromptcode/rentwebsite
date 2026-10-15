import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, Package, Receipt, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import { formatThaiDate, getPatientPackageForCustomer } from "@rentweb/module-booking/services";
import { PackageStatusBadge } from "@rentweb/module-booking/ui";
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
  if (!runtime || !runtime.config.modules.includes("clinic")) notFound();
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
  const showPayment = pending && !!payment && payment.status !== "paid" && !paymentExpired;
  const usable = item.status === "active" && !item.isExpired;
  const pct = item.sessionsTotal > 0 ? Math.round((item.sessionsLeft / item.sessionsTotal) * 100) : 0;
  const selfHref = `/account/packages/${item.id}`;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Link href="/account/packages" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> คอร์สของฉัน
          </Link>
          <Reveal className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{item.serviceName ?? "คอร์ส"}</p>
              <h1 className="font-heading text-3xl font-semibold md:text-4xl">{item.packageName}</h1>
            </div>
            <PackageStatusBadge status={item.status} expired={item.isExpired} className="px-4 py-1.5 text-sm" />
          </Reveal>

          <Reveal delay={0.05} className="card mt-6 overflow-hidden p-0">
            <div className="flex items-start gap-3 bg-primary-soft px-5 py-4 md:px-7">
              {usable ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" /> : <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />}
              <div>
                <p className="font-heading text-lg font-semibold">{pending ? "ชำระเงินเพื่อเปิดใช้งานคอร์ส" : usable ? "คอร์สพร้อมใช้งาน จองคิวเพื่อใช้สิทธิ์ได้เลย" : item.isExpired ? "คอร์สนี้หมดอายุแล้ว" : item.status === "exhausted" ? "ใช้สิทธิ์ครบแล้ว ขอบคุณที่ไว้วางใจ" : "รายละเอียดคอร์ส"}</p>
                <p className="text-sm text-muted-foreground">{pending ? "คอร์สจะเปิดใช้งานและเริ่มนับอายุทันทีเมื่อยืนยันการชำระ" : item.expiresAt ? `${item.isExpired ? "หมดอายุเมื่อ" : "ใช้ได้ถึง"} ${formatThaiDate(item.expiresAt, { weekday: true })}` : ""}</p>
              </div>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-[auto_1fr] md:p-7">
              {item.packageImage ? <Img src={item.packageImage} alt="" className="size-24 rounded-[var(--radius-lg)] object-cover" /> : <span className="flex size-24 items-center justify-center rounded-[var(--radius-lg)] bg-muted"><Package className="size-8 text-muted-foreground" /></span>}
              <div>
                <div className="flex items-end justify-between gap-3">
                  <p className="text-sm text-muted-foreground">ครั้งคงเหลือ</p>
                  <p className="font-heading text-3xl font-semibold tabular-nums">
                    {item.sessionsLeft}
                    <span className="text-base font-normal text-muted-foreground">/{item.sessionsTotal}</span>
                  </p>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={item.sessionsLeft} aria-valuemin={0} aria-valuemax={item.sessionsTotal} aria-label="ครั้งคงเหลือ">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${usable ? pct : 0}%` }} />
                </div>
                {item.packageDescription && <p className="mt-3 text-sm text-muted-foreground">{item.packageDescription}</p>}
              </div>
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
            </Reveal>
          )}

          {pending && (!payment || paymentExpired) && (
            <Reveal delay={0.1} className="card mt-5 flex flex-col items-start gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <p className="font-heading text-lg font-semibold">QR ชำระเงินหมดอายุแล้ว</p>
                <p className="text-sm text-muted-foreground">สร้างรายการชำระเงินใหม่ {thb(item.pricePaid)} เพื่อเปิดใช้งานคอร์ส</p>
              </div>
              <form action={renewPackagePaymentAction.bind(null, tenantId, item.id)}>
                <Button type="submit" size="lg">
                  <RefreshCw className="size-4" /> สร้าง QR ใหม่
                </Button>
              </form>
            </Reveal>
          )}

          <Reveal delay={0.15} className="card mt-5 p-5 md:p-7">
            <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
              <Receipt className="size-5 text-primary" /> รายละเอียด
            </h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Row label="ราคาคอร์ส" value={thb(item.pricePaid)} />
              <Row label="จำนวนครั้ง" value={L.sessions(item.sessionsTotal)} />
              <Row label="ใช้ไปแล้ว" value={L.sessions(item.sessionsUsed)} />
              {payment && <Row label="ช่องทางชำระ" value={METHOD_LABELS[payment.method]?.label ?? payment.method} />}
              <Row label={pending ? "สร้างรายการเมื่อ" : "ซื้อเมื่อ"} value={formatThaiDate(item.purchasedAt, { time: true })} />
              {item.expiresAt && <Row label="หมดอายุ" value={formatThaiDate(item.expiresAt)} />}
            </dl>
          </Reveal>

          <div className="mt-8 flex flex-wrap gap-3">
            {usable && (
              <Button asChild size="lg">
                <Link href="/book">
                  <CalendarDays className="size-4" /> จองคิวใช้สิทธิ์
                </Link>
              </Button>
            )}
            <Button asChild size="lg" variant="outline">
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 rounded-[var(--radius-md)] bg-muted/50 px-3 py-2 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
