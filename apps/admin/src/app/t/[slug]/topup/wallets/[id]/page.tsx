import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, History, Lock, Wallet } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { getAdminWallet } from "@rentweb/module-topup/admin";
import { TIER_LABEL, WALLET_REASON_LABEL } from "@rentweb/module-topup/admin/labels";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { fmtDate, fmtNumber, fmtRelative, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { WalletActions } from "./wallet-actions";

export const metadata: Metadata = { title: "กระเป๋าเงินลูกค้า" };

const TOPUP_STATUS: Record<string, { label: string; variant: "success" | "warning" | "muted" | "destructive" }> = {
  pending: { label: "รอชำระ", variant: "muted" },
  pending_verification: { label: "รอตรวจสลิป", variant: "warning" },
  credited: { label: "เข้ากระเป๋าแล้ว", variant: "success" },
  rejected: { label: "ปฏิเสธ", variant: "destructive" },
  expired: { label: "หมดอายุ", variant: "muted" },
};

export default async function TopupWalletDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const data = await tenantTx(ctx.tenant.id, (tx) => getAdminWallet(tx, ctx.tenant.id, id));
  if (!data) notFound();
  const { wallet, customer, transactions, topups, stats } = data;
  const canWrite = hasRole(ctx, "manager");
  const display = customer.name ?? customer.phone ?? customer.email ?? "ไม่ระบุชื่อ";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการกระเป๋าเงิน">
            <Link href={`/t/${slug}/topup/wallets`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{display}</h1>
              <Badge variant={customer.tier === "vip" ? "accent" : "outline"}>{TIER_LABEL[customer.tier] ?? customer.tier}</Badge>
              {wallet.frozen && (
                <Badge variant="destructive" className="gap-1" data-testid="wallet-frozen">
                  <Lock aria-hidden /> ระงับอยู่
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[customer.phone, customer.email].filter(Boolean).join(" · ") || "—"} ·{" "}
              <Link href={`/t/${slug}/customers/${customer.id}`} className="underline-offset-2 hover:underline">
                ข้อมูลลูกค้า
              </Link>{" "}
              ·{" "}
              <Link href={`/t/${slug}/topup/orders?tab=all&q=${encodeURIComponent(customer.phone ?? customer.email ?? "")}`} className="underline-offset-2 hover:underline">
                รายการเติม
              </Link>
            </p>
          </div>
        </div>
        {canWrite && <WalletActions slug={slug} walletId={wallet.id} frozen={wallet.frozen} balance={wallet.balance} customerName={display} />}
      </div>

      {wallet.frozen && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">กระเป๋านี้ถูกระงับ — ลูกค้าใช้จ่ายหรือรับเงินเข้ากระเป๋าไม่ได้ (รวมถึงการคืนเงินอัตโนมัติ) จนกว่าจะปลดระงับ</div>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label="คงเหลือ" value={<span data-testid="wallet-balance">{thb(wallet.balance)}</span>} icon={Wallet} tone="primary" />
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label="เติมเข้ารวม" value={thb(stats.credited)} icon={ArrowDownLeft} tone="success" />
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label="ใช้ไปรวม" value={thb(stats.debited)} icon={ArrowUpRight} />
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label="รายการ" value={fmtNumber(stats.txCount)} icon={History} hint={`เปิดเมื่อ ${fmtDate(wallet.createdAt)}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card min-w-0 py-0" aria-labelledby="ledger-h">
          <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
            <h2 id="ledger-h" className="font-heading text-base font-semibold sm:text-lg">
              ประวัติกระเป๋าเงิน
            </h2>
            <span className="text-xs text-muted-foreground">ล่าสุด {transactions.length} รายการ</span>
          </div>
          {transactions.length === 0 ? (
            <EmptyState icon={History} title="ยังไม่มีรายการ" description="เมื่อลูกค้าเติมเงินหรือซื้อแพ็กเกจด้วยกระเป๋า รายการจะแสดงที่นี่" compact className="border-0" />
          ) : (
            <ul className="divide-y" data-testid="wallet-ledger">
              {transactions.map((t) => {
                const credit = t.type === "credit";
                const orderLink = t.refType === "topup_order" && t.refId && isUuid(t.refId) ? `/t/${slug}/topup/orders/${t.refId}` : null;
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3 sm:px-5" data-ledger-reason={t.reason}>
                    <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${credit ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{credit ? <ArrowDownLeft className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{WALLET_REASON_LABEL[t.reason] ?? t.reason}</p>
                      {t.note && <p className="break-words text-sm text-muted-foreground">{t.note}</p>}
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(t.createdAt, { withTime: true })} · {fmtRelative(t.createdAt)}
                        {t.createdBy && t.reason === "adjustment" ? " · โดยแอดมิน" : ""}
                        {orderLink && (
                          <>
                            {" · "}
                            <Link href={orderLink} className="text-primary hover:underline">
                              ดูรายการเติม
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-semibold tabular-nums ${credit ? "text-emerald-700" : ""}`}>
                        {credit ? "+" : "−"}
                        {thb(t.amount)}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">คงเหลือ {thb(t.balanceAfter)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>การเติมเงินเข้ากระเป๋า</CardTitle>
          </CardHeader>
          <CardContent>
            {topups.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่เคยเติมเงินเข้ากระเป๋า</p>
            ) : (
              <ul className="divide-y text-sm">
                {topups.map((t) => {
                  const s = TOPUP_STATUS[t.status] ?? { label: t.status, variant: "muted" as const };
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-medium tabular-nums">
                          {thb(t.amount)}
                          {t.bonus > 0 && <span className="ml-1 text-xs font-normal text-emerald-700">+โบนัส {thb(t.bonus)}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{fmtDate(t.createdAt, { withTime: true })}</p>
                      </div>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
