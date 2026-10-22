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
import { HoloCard, TopupStyles, WalletTopupForm, dateTimeTh } from "@rentweb/module-topup/components";
import { WALLET_REASON_LABEL } from "@rentweb/module-topup/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { cancelWalletTopupAction, createWalletTopupAction } from "./actions";
import { cmsFallback } from "@/lib/cms-fallback";
import { FloatingChatOptOut } from "@rentweb/storefront";

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
      <TopupStyles />
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          {/* the glowing balance card (holo tilt on desktop) + wallet facts */}
          <Reveal className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-border/70 bg-card/50 p-5 backdrop-blur-xl md:p-8 lg:col-span-2">
            <div aria-hidden className="pointer-events-none absolute -top-32 -left-24 size-80 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative grid gap-5 md:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-5">
              <div className="md:col-start-2 md:row-start-1 md:self-end">
                <p className="tp-hud mb-2 text-primary" data-script="latin">
                  [ Wallet ]
                </p>
                <h1 className="font-heading text-step-4 font-semibold">กระเป๋าเงิน</h1>
              </div>
              <HoloCard className="rounded-[1.4rem] md:col-start-1 md:row-span-2 md:row-start-1 md:self-center" max={6}>
                <div className="tp-balance-card relative flex aspect-[1.586] flex-col justify-between overflow-hidden rounded-[inherit] p-5 md:p-6">
                  <span aria-hidden className="tp-foil" />
                  <div className="relative flex items-start justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Wallet className="size-4 text-primary" /> ยอดเงินคงเหลือ
                    </p>
                    <span aria-hidden className="tp-hud text-[10px] text-foreground/80" data-script="latin">
                      {runtime.config.name} · Wallet
                    </span>
                  </div>
                  <div className="relative">
                    <span aria-hidden className="tp-chip mb-3 block h-7 w-10 md:h-8 md:w-11" />
                    <p className="tp-num text-[2.5rem] leading-none font-semibold text-glow md:text-[3.25rem]">
                      <Counter to={balanceBaht} prefix="฿" decimals={wallet.balance % 100 ? 2 : 0} />
                    </p>
                  </div>
                  <div className="relative flex items-end justify-between gap-3">
                    <p className="min-w-0 truncate text-sm text-muted-foreground">
                      {customer.name ?? customer.phone ?? customer.email} · ระดับ <span className="font-medium text-foreground uppercase">{customer.tier}</span>
                    </p>
                    <span aria-hidden className="tp-hud shrink-0 text-[10px] text-muted-foreground" data-script="latin">
                      •••• {wallet.id.replace(/-/g, "").slice(-4).toUpperCase()}
                    </span>
                  </div>
                </div>
              </HoloCard>
              <div className="grid content-start gap-5 md:col-start-2 md:row-start-2">
                <div className="flex flex-wrap gap-2">
                  {cfg.walletBonusPercent > 0 && (
                    <Badge variant="success" className="h-9 gap-1.5 px-3 text-sm">
                      <Gift /> โบนัส +{cfg.walletBonusPercent}% ทุกครั้งที่เติม
                    </Badge>
                  )}
                  <Button asChild variant="outline" size="sm" className="h-11">
                    <Link href="/games">
                      <Zap /> ไปเติมเกม
                    </Link>
                  </Button>
                </div>
                <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border/60 bg-border/60">
                  {[
                    ["Bonus", cfg.walletBonusPercent > 0 ? `+${cfg.walletBonusPercent}%` : "—"],
                    ["Min", thb(cfg.minWalletTopup)],
                    ["Tier", customer.tier.toUpperCase()],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0 bg-card/80 px-3 py-3 sm:px-4">
                      <dt className="tp-hud text-[10px] text-muted-foreground" data-script="latin">
                        {k}
                      </dt>
                      <dd className={cn("mt-1 truncate font-semibold", k === "Tier" ? "font-heading text-base tracking-wide sm:text-lg" : "tp-num text-sm sm:text-lg")}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-sm text-muted-foreground">ใช้ยอดในกระเป๋าเติมเกมได้ทันที ไม่ต้องแนบสลิปทุกครั้ง · เติมไม่สำเร็จ ระบบคืนเงินเข้ากระเป๋าอัตโนมัติ</p>
              </div>
            </div>
          </Reveal>

          {frozen && (
            <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-xl)] border border-destructive/50 bg-destructive/10 p-5 lg:col-span-2">
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
              <div role="status" className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-5 text-sm">
                <X className="size-5 shrink-0 text-muted-foreground" />
                <p>ยกเลิกรายการเติมเงินแล้ว ไม่มีการเรียกเก็บเงิน</p>
              </div>
            )}
            {closedTopup && (
              <div role="status" className="flex items-start gap-3 rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-5 text-sm">
                <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <p>
                  รายการเติมเงิน {thb(pending.amount)} {payment.status === "cancelled" ? "ถูกยกเลิกแล้ว" : payment.status === "expired" ? "หมดเวลาชำระแล้ว" : "ไม่สำเร็จ"} — หากโอนเงินไปแล้ว กรุณาติดต่อแอดมินพร้อมสลิป
                </p>
              </div>
            )}
            {justCredited && (
              <Reveal className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-emerald-500/40 bg-emerald-500/10 p-5 shadow-[0_0_40px_-16px_rgb(16_185_129/0.6)]">
                <CheckCircle2 className="size-6 shrink-0 text-emerald-500" />
                <div className="text-sm">
                  <p className="font-medium">เติมเงินสำเร็จ {thb(pending.amount)}</p>
                  {pending.bonus > 0 && <p className="text-muted-foreground">ได้รับโบนัสเพิ่ม {thb(pending.bonus)}</p>}
                </div>
                <Button asChild size="sm" className="ml-auto h-11">
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
              <div className="rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-5 md:p-7">
                <h2 className="font-heading flex items-center gap-2 text-xl font-semibold">
                  <Lock className="size-5 text-muted-foreground" /> เติมเงินเข้ากระเป๋า
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">ปิดการเติมเงินชั่วคราวเพราะกระเป๋าเงินถูกระงับ กรุณาติดต่อแอดมินเพื่อปลดระงับ</p>
              </div>
            ) : (
              <Reveal className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-5 backdrop-blur-xl md:p-7" delay={0.05}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-heading flex items-center gap-2 text-xl font-semibold">
                    <Plus className="size-5 text-primary" /> เติมเงินเข้ากระเป๋า
                  </h2>
                  <span aria-hidden className="tp-hud pt-1.5 text-[10px] text-muted-foreground" data-script="latin">
                    Top-up
                  </span>
                </div>
                <p className="mt-1 mb-6 text-sm text-muted-foreground">ใช้เติมเกมในเว็บนี้เท่านั้น ไม่สามารถถอนเป็นเงินสดได้ · ขั้นต่ำ {thb(cfg.minWalletTopup)}</p>
                {/* phones: the floating LINE button would sit on the amount tiles / submit button */}
                <FloatingChatOptOut>
                  <WalletTopupForm presets={PRESETS} minAmount={cfg.minWalletTopup} bonusPercent={cfg.walletBonusPercent} methods={methods} action={createWalletTopupAction.bind(null, tenantId)} />
                </FloatingChatOptOut>
              </Reveal>
            )}
          </div>

          {/* history */}
          <Reveal className="rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-5 backdrop-blur-xl md:p-6" delay={0.1}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                <History className="size-5 text-primary" /> ประวัติรายการ
              </h2>
              <span aria-hidden className="tp-hud text-[10px] text-muted-foreground" data-script="latin">
                Ledger · {String(transactions.length).padStart(2, "0")}
              </span>
            </div>
            {transactions.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border/80 px-4 py-8 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Gift className="size-5" />
                </span>
                <p className="text-sm text-muted-foreground">ยังไม่มีรายการ เติมเงินครั้งแรกเพื่อรับโบนัส</p>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border/60">
                {transactions.map((t) => {
                  const credit = t.type === "credit";
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]", credit ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground")}>
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
