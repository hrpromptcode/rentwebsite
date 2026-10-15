import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gamepad2, History, Lock, Receipt, Repeat } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { getPayment, paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { eq, gamePackages, games } from "@rentweb/db";
import { getOrderByNumber, getOrderForCustomer, revealDeliveredCode, toPublicOrder } from "@rentweb/module-topup/services";
import { CodeReveal, OrderTracker, StatusBadge, dateTimeTh } from "@rentweb/module-topup/components";
import { FULFILLMENT_LABEL, PAYMENT_METHOD_LABEL } from "@rentweb/module-topup/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; number: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { number } = await params;
  return { title: `รายการ ${number.toUpperCase()}`, robots: { index: false } };
}

export default async function TopupOrderPage({ params, searchParams }: { params: Params; searchParams: Promise<{ k?: string }> }) {
  const { tenantId, number } = await params;
  const { k } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) notFound();
  const customer = await getCurrentCustomer(tenantId);

  const data = await tenantTx(tenantId, async (tx) => {
    const full = await getOrderForCustomer(tx, tenantId, { number, customerId: customer?.id, accessKey: k ?? null });
    const pub = full ? null : await getOrderByNumber(tx, tenantId, number);
    if (!full && !pub) return null;
    const payment = full?.paymentId ? await getPayment(tx, tenantId, full.paymentId) : null;
    const [meta] = full
      ? await tx
          .select({ image: games.image, estimatedMinutes: gamePackages.estimatedMinutes, fields: games.fields })
          .from(gamePackages)
          .innerJoin(games, eq(games.id, gamePackages.gameId))
          .where(eq(gamePackages.id, full.packageId))
          .limit(1)
      : [null];
    return { full, pub, payment, meta: meta ?? null };
  });
  if (!data) notFound();

  const { full, payment, meta } = data;
  const view = full ? toPublicOrder(full, meta?.estimatedMinutes ?? null) : data.pub!;
  const authorised = !!full;
  const code = full ? revealDeliveredCode(full) : null;
  const settings = paymentSettings(runtime.config.settings);
  const keyQs = k ? `?k=${encodeURIComponent(k)}` : "";
  const pollUrl = `/api/topup/orders/${encodeURIComponent(view.number)}${keyQs}`;
  const showPayment = authorised && payment && view.status === "pending_payment" && payment.status !== "paid";
  const fieldLabels = new Map<string, string>((meta?.fields ?? []).map((f) => [f.key, f.label]));

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">เลขที่รายการ</p>
              <h1 className="font-heading text-3xl font-semibold tracking-wide md:text-4xl">{view.number}</h1>
            </div>
            <StatusBadge status={view.status} size="md" />
          </Reveal>

          <div className="grid gap-5">
            <Reveal delay={0.05}>
              <OrderTracker
                initial={{ status: view.status, paidAt: view.paidAt?.toISOString() ?? null, fulfilledAt: view.fulfilledAt?.toISOString() ?? null, failureReason: view.failureReason }}
                pollUrl={pollUrl}
                estimatedMinutes={view.estimatedMinutes}
                fulfillment={view.fulfillment}
              />
            </Reveal>

            {showPayment && (
              <Reveal delay={0.1}>
                <PaymentPanel
                  payment={{ id: payment.id, method: payment.method, status: payment.status, amount: payment.amount, qrDataUrl: payment.qrPayload ? await promptpayQrDataUrl(payment.qrPayload) : null, expiresAt: payment.expiresAt?.toISOString() ?? null, slipUrl: payment.slipUrl }}
                  amountLabel={thb(payment.amount)}
                  promptpayName={settings.promptpayName}
                  promptpayId={settings.promptpayId}
                  bankAccounts={settings.bankAccounts ?? []}
                  successHref={`/topup/${view.number}${keyQs}`}
                />
              </Reveal>
            )}

            {authorised && code && (
              <Reveal delay={0.1}>
                <CodeReveal code={code} label={`โค้ด ${view.packageName}`} />
              </Reveal>
            )}

            {!authorised && view.status === "pending_payment" && (
              <div className="card flex items-start gap-3 p-5 text-sm text-muted-foreground">
                <Lock className="mt-0.5 size-4 shrink-0" />
                <p>
                  รายการนี้ยังไม่ชำระเงิน เปิดลิงก์จากหน้าที่สั่งซื้อ หรือ{" "}
                  <Link href={`/account/login?next=${encodeURIComponent(`/topup/${view.number}`)}`} className="text-primary underline-offset-4 hover:underline">
                    เข้าสู่ระบบ
                  </Link>{" "}
                  เพื่อชำระเงินและดูรายละเอียดทั้งหมด
                </p>
              </div>
            )}

            <Reveal delay={0.15} className="card p-5 md:p-7">
              <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                <Receipt className="size-5 text-primary" /> รายละเอียด
              </h2>
              <div className="mt-4 flex items-center gap-4">
                {meta?.image ? <img src={meta.image} alt="" className="size-14 rounded-[var(--radius-lg)] object-cover" /> : <span className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-muted"><Gamepad2 className="size-6 text-muted-foreground" /></span>}
                <div>
                  <p className="font-medium">{view.gameName}</p>
                  <p className="text-sm text-muted-foreground">{view.packageName}</p>
                </div>
                <p className="font-heading ml-auto text-2xl font-semibold text-primary">{thb(view.price)}</p>
              </div>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                {full
                  ? Object.entries(full.playerFields ?? {}).map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-4 rounded-[var(--radius-md)] bg-muted/50 px-3 py-2 sm:block">
                        <dt className="text-muted-foreground">{fieldLabels.get(key) ?? key}</dt>
                        <dd className="font-mono font-medium">{value}</dd>
                      </div>
                    ))
                  : (
                      <div className="flex justify-between gap-4 rounded-[var(--radius-md)] bg-muted/50 px-3 py-2 sm:block">
                        <dt className="text-muted-foreground">ผู้เล่น</dt>
                        <dd className="font-mono font-medium">{view.player}</dd>
                      </div>
                    )}
                <Row label="วิธีเติม" value={FULFILLMENT_LABEL[view.fulfillment] ?? view.fulfillment} />
                <Row label="ชำระผ่าน" value={PAYMENT_METHOD_LABEL[view.paymentMethod] ?? view.paymentMethod} />
                <Row label="สั่งซื้อเมื่อ" value={dateTimeTh(view.placedAt)} />
                {view.paidAt && <Row label="ชำระเมื่อ" value={dateTimeTh(view.paidAt)} />}
                {view.fulfilledAt && <Row label="เติมสำเร็จเมื่อ" value={dateTimeTh(view.fulfilledAt)} />}
                {full?.supplierRef && <Row label="เลขอ้างอิง" value={full.supplierRef} mono />}
                {full?.contact && <Row label="ติดต่อ" value={full.contact} />}
              </dl>
            </Reveal>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/games">
                  <Repeat /> เติมอีกครั้ง
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={customer ? "/account/topups" : "/topup/status"}>
                  <History /> {customer ? "ประวัติการเติม" : "ตรวจสอบสถานะ"}
                </Link>
              </Button>
            </div>
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
