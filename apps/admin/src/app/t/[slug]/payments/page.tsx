import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { paymentQueueCounts, paymentsQueue, type PaymentQueueTab } from "@rentweb/module-commerce/admin";
import { PAYMENT_STATUS, REF_TYPE } from "@rentweb/module-commerce/admin/labels";
import { FilterTabs, NativeSelect, Pagination, SlipPreview, ToneBadge, paymentMethodLabel, qs } from "@rentweb/module-commerce/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtDate, fmtNumber, fmtRelative, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { PaymentQueueActions } from "./payment-actions";

export const metadata: Metadata = { title: "ตรวจสลิป / การชำระเงิน" };

const TABS: Array<{ key: PaymentQueueTab; label: string }> = [
  { key: "pending_verification", label: "รอตรวจสลิป" },
  { key: "paid", label: "ชำระแล้ว" },
  { key: "failed", label: "ปฏิเสธ / หมดอายุ" },
];

export default async function PaymentsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; type?: string; page?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "pending_verification") as PaymentQueueTab;
  const refType = sp.type && REF_TYPE[sp.type] ? sp.type : "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const base = `/t/${slug}/payments`;
  const canWrite = hasRole(ctx, "manager");
  const { list, counts } = await tenantTx(ctx.tenant.id, async (tx) => ({ list: await paymentsQueue(tx, ctx.tenant.id, { tab, refType: refType || null, page, perPage: 20 }), counts: await paymentQueueCounts(tx, ctx.tenant.id) }));
  const params_ = { tab: tab === "pending_verification" ? "" : tab, type: refType };

  return (
    <div className="space-y-6">
      <PageHeader title="ตรวจสลิป / การชำระเงิน" description={`คิวตรวจสลิปรวมทุกโมดูล (ออเดอร์ การจอง เติมเกม ร้านอาหาร) · รอตรวจ ${fmtNumber(counts.pending_verification)} รายการ`} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], href: `${base}${qs(params_, { tab: t.key === "pending_verification" ? "" : t.key })}` }))} />
        <form action={base} className="flex gap-2">
          {tab !== "pending_verification" && <input type="hidden" name="tab" value={tab} />}
          <NativeSelect name="type" defaultValue={refType} aria-label="ประเภทรายการ" className="w-48">
            <option value="">ทุกประเภท</option>
            {Object.entries(REF_TYPE).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" variant="secondary">
            กรอง
          </Button>
        </form>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState icon={BadgeCheck} title={tab === "pending_verification" ? "ไม่มีสลิปรอตรวจ" : "ไม่มีรายการ"} description={tab === "pending_verification" ? "เมื่อลูกค้าแนบสลิปโอนเงิน รายการจะมาปรากฏที่นี่ให้คุณยืนยันหรือปฏิเสธ" : undefined} />
      ) : (
        <div className="card divide-y py-0">
          {list.rows.map((p) => {
            const st = PAYMENT_STATUS[p.status] ?? { label: p.status, tone: "muted" as const };
            const href = p.refHref ? `/t/${slug}${p.refHref}` : null;
            return (
              <article key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
                <SlipPreview src={p.slipUrl ? assetUrl(p.slipUrl) : null} size="md" description={`${REF_TYPE[p.refType] ?? p.refType} ${p.refNumber ?? ""} · ${thb(p.amount)}`} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold tabular-nums">{thb(p.amount)}</span>
                    <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                    {p.refundRequired && <ToneBadge tone="destructive">ต้องคืนเงิน</ToneBadge>}
                    <Badge variant="outline">{REF_TYPE[p.refType] ?? p.refType}</Badge>
                    <span className="text-sm text-muted-foreground">{paymentMethodLabel(p.method)}</span>
                  </div>
                  <p className="text-sm">
                    {href ? (
                      <Link href={href} className="font-medium text-primary hover:underline">
                        {p.refNumber ?? p.refId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="font-medium">{p.refNumber ?? p.refId.slice(0, 8)}</span>
                    )}
                    {(p.customerName || p.customerPhone) && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {p.customerName ?? "ไม่ระบุชื่อ"}
                        {p.customerPhone ? ` (${p.customerPhone})` : ""}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tab === "pending_verification" ? `แนบสลิป ${fmtRelative(p.updatedAt)}` : p.paidAt ? `ชำระ ${fmtDate(p.paidAt, { withTime: true })}` : `อัปเดต ${fmtDate(p.updatedAt, { withTime: true })}`}
                    {p.slipTransRef && <> · อ้างอิง {p.slipTransRef}</>}
                    {p.verifiedBy && <> · ตรวจโดย {p.verifiedBy === "auto" ? "ระบบอัตโนมัติ" : p.verifiedBy === ctx.userId ? "คุณ" : "เจ้าหน้าที่"}</>}
                    {p.refundRequired ? <span className="text-destructive"> · ต้องคืนเงินลูกค้า: {p.refundRequired}</span> : p.failureReason && <span className="text-destructive"> · {p.failureReason}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
                  <PaymentQueueActions slug={slug} payment={{ id: p.id, status: p.status, amount: p.amount }} canWrite={canWrite} />
                  {href && (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={href}>
                        เปิดรายการ <ExternalLink aria-hidden />
                      </Link>
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          <Pagination page={list.page} pages={list.pages} total={list.total} baseHref={base} params={params_} label="รายการ" />
        </div>
      )}
    </div>
  );
}
