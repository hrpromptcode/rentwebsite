import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Search, Wallet, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { listAdminWallets } from "@rentweb/module-topup/admin";
import { TIER_LABEL } from "@rentweb/module-topup/admin/labels";
import { FilterTabs, Pagination, qs } from "@rentweb/module-topup/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, fmtRelative, thb } from "@/lib/format";
import { getTenantCtx, tenantTx } from "@/lib/tenant";

export const metadata: Metadata = { title: "กระเป๋าเงินลูกค้า" };

export default async function TopupWalletsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; page?: string; frozen?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const q = sp.q?.trim() ?? "";
  const frozenOnly = sp.frozen === "1";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const base = `/t/${slug}/topup/wallets`;
  const list = await tenantTx(ctx.tenant.id, (tx) => listAdminWallets(tx, ctx.tenant.id, { q, page, perPage: 25, frozen: frozenOnly || null }));
  const params_ = { q, frozen: frozenOnly ? "1" : "" };

  return (
    <div className="space-y-6">
      <PageHeader title="กระเป๋าเงินลูกค้า" description="ยอดเงินที่ลูกค้าเติมไว้ในเว็บ · ดูประวัติ ปรับยอด และระงับกระเป๋า" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:max-w-3xl">
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label="คงเหลือรวม" value={thb(list.totalBalance)} icon={Wallet} tone="primary" hint="เงินลูกค้าที่ร้านต้องให้บริการ" />
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label={frozenOnly ? "ถูกระงับ" : q ? "ตามคำค้น" : "กระเป๋า"} value={fmtNumber(list.total)} icon={frozenOnly ? Lock : Wallet} />
      </div>

      <FilterTabs
        active={frozenOnly ? "frozen" : "all"}
        tabs={[
          { key: "all", label: "ทั้งหมด", href: `${base}${qs({ q })}` },
          { key: "frozen", label: "ถูกระงับ", href: `${base}${qs({ q, frozen: "1" })}` },
        ]}
      />

      <form className="card flex gap-2 p-4" action={base}>
        {frozenOnly && <input type="hidden" name="frozen" value="1" />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ชื่อ เบอร์โทร หรืออีเมลลูกค้า…" className="pl-9" aria-label="ค้นหากระเป๋าเงิน" />
        </div>
        <Button type="submit" variant="secondary">
          ค้นหา
        </Button>
        {q && (
          <Button asChild variant="ghost" size="icon" aria-label="ล้างคำค้น">
            <Link href={`${base}${qs({ frozen: frozenOnly ? "1" : "" })}`}>
              <X aria-hidden />
            </Link>
          </Button>
        )}
      </form>

      {list.rows.length === 0 ? (
        <EmptyState icon={Wallet} title={q || frozenOnly ? "ไม่พบกระเป๋าเงินตามเงื่อนไข" : "ยังไม่มีลูกค้าเปิดกระเป๋าเงิน"} description={q || frozenOnly ? "ลองเปลี่ยนคำค้นหรือตัวกรอง" : "กระเป๋าเงินถูกสร้างเมื่อลูกค้าล็อกอินและเปิดหน้ากระเป๋าเงินบนหน้าร้าน"} />
      ) : (
        <div className="card min-w-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ลูกค้า</TableHead>
                <TableHead className="hidden md:table-cell">ระดับ</TableHead>
                <TableHead className="text-right">คงเหลือ</TableHead>
                <TableHead className="hidden sm:table-cell">เคลื่อนไหวล่าสุด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((w) => (
                <TableRow key={w.id} className="relative">
                  <TableCell className="whitespace-normal">
                    <Link href={`${base}/${w.id}`} className="font-semibold after:absolute after:inset-0 after:content-['']">
                      {w.customerName ?? w.customerPhone ?? w.customerEmail ?? "ไม่ระบุชื่อ"}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{[w.customerPhone, w.customerEmail].filter(Boolean).join(" · ") || "—"}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {w.frozen && (
                        <Badge variant="destructive" className="gap-1">
                          <Lock aria-hidden /> ระงับ
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground sm:hidden">{w.lastTxAt ? fmtRelative(w.lastTxAt) : "ยังไม่มีรายการ"}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={w.tier === "vip" ? "accent" : w.tier === "agent" ? "soft" : "outline"}>{TIER_LABEL[w.tier] ?? w.tier}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{thb(w.balance)}</TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {w.lastTxAt ? (
                      <>
                        <span className={w.lastTxType === "credit" ? "text-emerald-700" : "text-foreground"}>
                          {w.lastTxType === "credit" ? "+" : "−"}
                          {thb(w.lastTxAmount ?? 0)}
                        </span>
                        <span className="block text-xs text-muted-foreground">{fmtRelative(w.lastTxAt)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">ยังไม่มีรายการ</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={list.page} pages={list.pages} total={list.total} baseHref={base} params={params_} label="กระเป๋า" />
        </div>
      )}
    </div>
  );
}
