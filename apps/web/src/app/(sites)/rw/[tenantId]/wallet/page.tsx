import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, Gift, History, Info, Lock, Plus, Sparkles, Wallet, X, Zap } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Counter, Reveal } from "@rentweb/ui/motion";
import { PaymentPanel, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { enabledMethods, getPayment, isOpenPaymentStatus, paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import { getOrCreateWallet, getWallet, getWalletTopup, listTransactions, reconcileWalletTopup, topupConfig } from "@rentweb/module-topup/services";
import { WalletTopupForm, dateTimeTh } from "@rentweb/module-topup/components";
import { WALLET_REASON_LABEL } from "@rentweb/module-topup/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { cancelWalletTopupAction, createWalletTopupAction } from "./actions";
import { cmsFallback } from "@/lib/cms-fallback";

export const metadata: Metadata = { title: "กระเป๋าเงิน" };

const PRESETS = [10000, 30000, 50000, 100000]; // satang

export default async function WalletPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ topup?: string; cancelled?: string; cancel?: string }> }) {
  const { tenantId } = await params;
  const { topup: rawTopupId, cancelled, cancel } = await searchParams;
  const topupId = typeof rawTopupId === "string" && isUuid(rawTopupId) ? rawTopupId : null;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("topup")) return cmsFallback(runtime, "wallet");
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/wallet")}`);
  const cfg = topupConfig(runtime.config.moduleConfig.topup);
  if (!cfg.walletEnabled) notFound();

  const { wallet, transactions, pending, payment } = await tenantTx(tenantId, async (tx) => {
    const base = await getOrCreateWallet(tx, tenantId, customer.id);
    const found = topupId ? await getWalletTopup(tx, tenantId, topupId) : null;
    // credits a paid-but-uncredited top-up before reading the balance (idempotent)
    const pending = found && found.walletId === base.id ? await reconcileWalletTopup(tx, tenantId, found) : null;
    const wallet = pending ? ((await getWallet(tx, tenantId, customer.id)) ?? base) : base;
    const transactions = await listTransactions(tx, tenantId, wallet.id, { limit: 30 });
    const payment = pending?.paymentId ? await getPayment(tx, tenantId, pending.paymentId) : null;
    return { wallet, transactions, pending, payment };
  });

  const settings = paymentSettings(runtime.config.settings);
  const methods: PaymentMethodOption[] = enabledMethods(runtime.config.settings)
    .filter((m): m is "promptpay_qr" | "slip" => m === "promptpay_qr" || m === "slip")
    .map((m) => (m === "promptpay_qr" ? { value: m, label: "PromptPay QR", description: "สแกนจ่าย แนบสลิป เข้ากระเป๋าอัตโนมัติ" } : { value: m, label: "โอนเงินผ่านธนาคาร", description: "โอนแล้วแนบสลิปยืนยัน" }));
  const frozen = wallet.frozen;
  // only an open payment can still be paid into; a cancelled / expired / failed one shows a closed notice instead
  const showPanel = !frozen && pending && payment && pending.status !== "credited" && isOpenPaymentStatus(payment.status);
  const closedTopup = pending && payment && pending.status !== "credited" && payment.status !== "paid" && !isOpenPaymentStatus(payment.status);
  const canCancel = showPanel && payment.status === "pending";
  const justCredited = pending && pending.status === "credited";
  const balanceBaht = wallet.balance / 100;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          {/* balance hero */}
          <Reveal className="card relative overflow-hidden p-6 md:p-8 lg:col-span-2">
            <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-primary/30 blur-3xl animate-breathe" aria-hidden />
            <div className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-accent/20 blur-3xl" aria-hidden />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wallet className="size-4 text-primary" /> ยอดเงินคงเหลือ
                </p>
                <p className="heading-display mt-2 text-5xl font-semibold text-glow md:text-7xl">
                  <Counter to={balanceBaht} prefix="฿" decimals={wallet.balance % 100 ? 2 : 0} />
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {customer.name ?? customer.phone ?? customer.email} · ระดับ <span className="font-medium text-foreground uppercase">{customer.tier}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {cfg.walletBonusPercent > 0 && (
                  <Badge variant="success" className="gap-1.5 px-3 py-1.5 text-sm">
                    <Gift /> โบนัส +{cfg.walletBonusPercent}% ทุกครั้งที่เติม
                  </Badge>
                )}
                <Button asChild variant="outline" size="sm" className="h-11">
                  <Link href="/games">
                    <Zap /> ไปเติมเกม
                  </Link>
                </Button>
              </div>
            </div>
          </Reveal>

          {frozen && (
            <div role="alert" className="card flex items-start gap-3 border-destructive/50 bg-destructive/10 p-5 lg:col-span-2">
              <Lock className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="text-sm">
                <p className="font-semibold text-foreground">กระเป๋าเงินถูกระงับชั่วคราว</p>
                <p className="mt-1 text-muted-foreground">กรุณาติดต่อแอดมิน ระหว่างนี้เติมเงินเข้ากระเป๋าหรือใช้ยอดคงเหลือซื้อแพ็กเกจไม่ได้ (ยอดเงินยังอยู่ครบ) ยังเติมเกมด้วย PromptPay / โอนเงินได้ตามปกติ</p>
              </div>
            </div>
          )}

          {/* main column */}
          <div className="grid gap-6">
            {cancelled === "1" && !pending && (
              <div role="status" className="card flex items-center gap-3 p-5 text-sm">
                <X className="size-5 shrink-0 text-muted-foreground" />
                <p>ยกเลิกรายการเติมเงินแล้ว ไม่มีการเรียกเก็บเงิน</p>
              </div>
            )}
            {closedTopup && (
              <div role="status" className="card flex items-start gap-3 p-5 text-sm">
                <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <p>
                  รายการเติมเงิน {thb(pending.amount)} {payment.status === "cancelled" ? "ถูกยกเลิกแล้ว" : payment.status === "expired" ? "หมดเวลาชำระแล้ว" : "ไม่สำเร็จ"} — หากโอนเงินไปแล้ว กรุณาติดต่อแอดมินพร้อมสลิป
                </p>
              </div>
            )}
            {justCredited && (
              <Reveal className="card flex items-center gap-3 border-emerald-500/40 bg-emerald-500/10 p-5">
                <CheckCircle2 className="size-6 shrink-0 text-emerald-500" />
                <div className="text-sm">
                  <p className="font-medium">เติมเงินสำเร็จ {thb(pending.amount)}</p>
                  {pending.bonus > 0 && <p className="text-muted-foreground">ได้รับโบนัสเพิ่ม {thb(pending.bonus)}</p>}
                </div>
                <Button asChild size="sm" className="ml-auto">
                  <Link href="/games">เติมเกมเลย</Link>
                </Button>
              </Reveal>
            )}

            {showPanel ? (
              <Reveal className="grid gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-xl font-semibold">ชำระเงินเพื่อเติมกระเป๋า</h2>
                  {canCancel ? (
                    <form action={cancelWalletTopupAction.bind(null, tenantId, pending.id)}>
                      <Button type="submit" variant="ghost" size="sm" className="h-11">
                        <X /> ยกเลิกรายการ
                      </Button>
                    </form>
                  ) : (
                    <Button asChild variant="ghost" size="sm" className="h-11">
                      <Link href="/wallet">กลับ</Link>
                    </Button>
                  )}
                </div>
                {cancel === "slip" && (
                  <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="size-4 shrink-0" /> ส่งสลิปแล้ว รอร้านตรวจสอบ จึงยกเลิกเองไม่ได้ หากต้องการยกเลิกกรุณาติดต่อแอดมิน
                  </p>
                )}
                <PaymentPanel
                  payment={{ id: payment.id, method: payment.method, status: payment.status, amount: payment.amount, qrDataUrl: payment.qrPayload ? await promptpayQrDataUrl(payment.qrPayload) : null, expiresAt: payment.expiresAt?.toISOString() ?? null, slipUrl: payment.slipUrl }}
                  amountLabel={thb(payment.amount)}
                  promptpayName={settings.promptpayName}
                  promptpayId={settings.promptpayId}
                  bankAccounts={settings.bankAccounts ?? []}
                  successHref={`/wallet?topup=${pending.id}`}
                />
                {pending.bonus > 0 && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="size-4 text-primary" /> เมื่อชำระสำเร็จจะได้รับ {thb(pending.amount + pending.bonus)} (รวมโบนัส {thb(pending.bonus)})
                  </p>
                )}
              </Reveal>
            ) : frozen ? (
              <div className="card p-5 md:p-7">
                <h2 className="font-heading flex items-center gap-2 text-xl font-semibold">
                  <Lock className="size-5 text-muted-foreground" /> เติมเงินเข้ากระเป๋า
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">ปิดการเติมเงินชั่วคราวเพราะกระเป๋าเงินถูกระงับ กรุณาติดต่อแอดมินเพื่อปลดระงับ</p>
              </div>
            ) : (
              <Reveal className="card p-5 md:p-7" delay={0.05}>
                <h2 className="font-heading flex items-center gap-2 text-xl font-semibold">
                  <Plus className="size-5 text-primary" /> เติมเงินเข้ากระเป๋า
                </h2>
                <p className="mt-1 mb-6 text-sm text-muted-foreground">ใช้เติมเกมในเว็บนี้เท่านั้น ไม่สามารถถอนเป็นเงินสดได้ · ขั้นต่ำ {thb(cfg.minWalletTopup)}</p>
                <WalletTopupForm presets={PRESETS} minAmount={cfg.minWalletTopup} bonusPercent={cfg.walletBonusPercent} methods={methods} action={createWalletTopupAction.bind(null, tenantId)} />
              </Reveal>
            )}
          </div>

          {/* history */}
          <Reveal className="card p-5 md:p-6" delay={0.1}>
            <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
              <History className="size-5 text-primary" /> ประวัติรายการ
            </h2>
            {transactions.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">ยังไม่มีรายการ เติมเงินครั้งแรกเพื่อรับโบนัส</p>
            ) : (
              <ul className="mt-4 divide-y divide-border/60">
                {transactions.map((t) => {
                  const credit = t.type === "credit";
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", credit ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground")}>
                        {credit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{WALLET_REASON_LABEL[t.reason] ?? t.reason}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.note ?? dateTimeTh(t.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("font-mono text-sm font-semibold", credit ? "text-emerald-500" : "text-foreground")}>
                          {credit ? "+" : "−"}
                          {thb(t.amount)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">คงเหลือ {thb(t.balanceAfter)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Reveal>
        </div>
      </section>
    </PageBody>
  );
}
