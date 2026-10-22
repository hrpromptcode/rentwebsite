import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decodeSlug } from "@/lib/slug";
import { Gamepad2, History, Lock, Receipt, RefreshCw, Repeat } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { getPayment, isOpenPaymentStatus, paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { and, eq, gamePackages, games } from "@rentweb/db";
import { getOrderByNumber, getOrderForCustomer, reconcileTopupOrder, revealDeliveredCode, toPublicOrder, topupPaymentLapsed } from "@rentweb/module-topup/services";
import { CodeReveal, OrderTracker, StatusBadge, TopupStyles, dateTimeTh } from "@rentweb/module-topup/components";
import { FULFILLMENT_LABEL, PAYMENT_METHOD_LABEL, errorLabel, parseTopupOrderNumber } from "@rentweb/module-topup/labels";
import { renewTopupPaymentAction } from "./actions";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; number: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, number } = await params;
  // a shop without the top-up module answers 404 — do not title that page after the requested order number
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) return { robots: { index: false } };
  return { title: `รายการ ${parseTopupOrderNumber(decodeSlug(number)) ?? ""}`.trim(), robots: { index: false } };
}

export default async function TopupOrderPage({ params, searchParams }: { params: Params; searchParams: Promise<{ k?: string | string[]; renew?: string | string[] }> }) {
  const { tenantId, number: rawNumber } = await params;
  const sp = await searchParams;
  const k = typeof sp.k === "string" ? sp.k : undefined;
  const renewRefusal = typeof sp.renew === "string" && /^[a-z_]{1,40}$/.test(sp.renew) ? sp.renew : null;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) notFound();
  // only TP-<digits> can exist; NUL bytes / garbage must not reach Postgres
  const number = parseTopupOrderNumber(decodeSlug(rawNumber));
  if (!number) notFound();
  const customer = await getCurrentCustomer(tenantId);

  const data = await tenantTx(tenantId, async (tx) => {
    const found = await getOrderForCustomer(tx, tenantId, { number, customerId: customer?.id, accessKey: k ?? null });
    const full = found ? await reconcileTopupOrder(tx, tenantId, found) : null;
    const pub = full ? null : await getOrderByNumber(tx, tenantId, number);
    if (!full && !pub) return null;
    const payment = full?.paymentId ? await getPayment(tx, tenantId, full.paymentId) : null;
    const [meta] = full
      ? await tx
          .select({ image: games.image, estimatedMinutes: gamePackages.estimatedMinutes, fields: games.fields })
          .from(gamePackages)
          .innerJoin(games, and(eq(games.tenantId, tenantId), eq(games.id, gamePackages.gameId)))
          .where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, full.packageId)))
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
  // RV-03: a rejected slip (failed) / lapsed QR cannot take money any more → offer a fresh payment instead of a dead panel
  const lapsed = !!(authorised && payment && view.status === "pending_payment" && topupPaymentLapsed(payment));
  const showPayment = authorised && payment && view.status === "pending_payment" && isOpenPaymentStatus(payment.status) && !lapsed;
  const fieldLabels = new Map<string, string>((meta?.fields ?? []).map((f) => [f.key, f.label]));

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <TopupStyles />
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          {/* receipt header: number in the HUD face, status, the game strip */}
          <Reveal className="relative mb-5 overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-5 backdrop-blur-xl md:mb-6 md:p-7">
            <div aria-hidden className="pointer-events-none absolute -top-24 right-0 size-64 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="flex items-center gap-3 text-sm text-muted-foreground">
                  เลขที่รายการ
                  <span aria-hidden className="tp-hud text-[10px] text-primary" data-script="latin">
                    [ {view.fulfillment === "stock" ? "Code" : view.fulfillment === "manual" ? "Manual" : "Auto"} ]
                  </span>
                </p>
                <h1 className="tp-num mt-1 text-3xl font-semibold tracking-wide md:text-5xl">{view.number}</h1>
              </div>
              <StatusBadge status={view.status} size="md" />
            </div>
            <div className="relative mt-5 flex items-center gap-4 border-t border-dashed border-border/80 pt-5">
              {meta?.image ? (
                <img src={meta.image} alt="" className="size-14 shrink-0 rounded-[var(--radius-lg)] object-cover ring-1 ring-border/70 md:size-16" />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-muted md:size-16">
                  <Gamepad2 className="size-6 text-muted-foreground" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{view.gameName}</p>
                <p className="truncate text-sm text-muted-foreground">{view.packageName}</p>
              </div>
              <p className="tp-num ml-auto text-2xl font-semibold text-primary md:text-3xl">{thb(view.price)}</p>
            </div>
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

            {lapsed && payment && (
              <Reveal delay={0.1}>
                <div className="grid gap-3 rounded-[var(--radius-xl)] border border-amber-500/40 bg-card/80 p-5 md:p-7">
                  <h2 className="font-heading text-lg font-semibold">{payment.status === "failed" ? "ร้านตรวจสลิปแล้วไม่ผ่าน" : "รายการชำระเงินหมดเวลาแล้ว"}</h2>
                  {payment.status === "failed" && payment.failureReason && <p className="text-sm">เหตุผล: {payment.failureReason}</p>}
                  <p className="text-sm text-muted-foreground">
                    กด “ชำระเงินใหม่” เพื่อรับ QR / บัญชีโอนเงินใหม่สำหรับรายการเดิม ({thb(view.price)}) หากโอนเงินไปแล้ว กรุณาติดต่อร้านพร้อมสลิป
                  </p>
                  {renewRefusal && (
                    <p role="alert" className="text-sm text-destructive">
                      {errorLabel(renewRefusal)}
                    </p>
                  )}
                  <form action={renewTopupPaymentAction.bind(null, tenantId, view.number, k ?? null)}>
                    <Button type="submit" size="lg" className="h-12 w-full sm:w-auto">
                      <RefreshCw /> ชำระเงินใหม่
                    </Button>
                  </form>
                </div>
              </Reveal>
            )}

            {authorised && code && (
              <Reveal delay={0.1}>
                <CodeReveal code={code} label={`โค้ด ${view.packageName}`} />
              </Reveal>
            )}

            {!authorised && view.status === "pending_payment" && (
              <div className="flex items-start gap-3 rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-5 text-sm text-muted-foreground">
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

            <Reveal delay={0.15} className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-5 backdrop-blur-xl md:p-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                  <Receipt className="size-5 text-primary" /> รายละเอียด
                </h2>
                <span aria-hidden className="tp-hud text-[10px] text-muted-foreground" data-script="latin">
                  Receipt
                </span>
              </div>
              <dl className="mt-4 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border/60 bg-border/60 text-sm sm:grid-cols-2">
                {full
                  ? Object.entries(full.playerFields ?? {}).map(([key, value]) => <Row key={key} label={fieldLabels.get(key) ?? key} value={value} mono />)
                  : <Row label="ผู้เล่น" value={view.player} mono />}
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
              <Button asChild size="lg" className="h-12">
                <Link href="/games">
                  <Repeat /> เติมอีกครั้ง
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12">
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
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 bg-card px-4 py-3 sm:block">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`ml-auto min-w-0 text-right [overflow-wrap:anywhere] sm:mt-0.5 sm:ml-0 sm:text-left ${mono ? "font-mono font-medium tracking-wide" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
