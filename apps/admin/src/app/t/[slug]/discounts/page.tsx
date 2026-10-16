import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Ticket } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { discountState, listDiscounts } from "@rentweb/module-commerce/admin";
import { ToneBadge, discountTypeLabel } from "@rentweb/module-commerce/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtDate, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { DiscountRowActions } from "./discount-row-actions";

export const metadata: Metadata = { title: "คูปองและโปรโมชัน" };

const STATE: Record<ReturnType<typeof discountState>, { label: string; tone: "success" | "warning" | "muted" | "destructive" | "soft" }> = {
  active: { label: "ใช้งานได้", tone: "success" },
  scheduled: { label: "รอเริ่ม", tone: "soft" },
  expired: { label: "หมดอายุ", tone: "muted" },
  exhausted: { label: "ใช้ครบแล้ว", tone: "warning" },
  inactive: { label: "ปิดใช้", tone: "muted" },
};

function discountValueLabel(d: { type: string; value: number; maxDiscount: number | null }): string {
  if (d.type === "percent") return `${d.value}%${d.maxDiscount ? ` (สูงสุด ${thb(d.maxDiscount)})` : ""}`;
  if (d.type === "fixed") return thb(d.value);
  return "ส่งฟรี";
}

export default async function DiscountsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const rows = await tenantTx(ctx.tenant.id, (tx) => listDiscounts(tx, ctx.tenant.id));
  const canWrite = hasRole(ctx, "manager");
  const base = `/t/${slug}/discounts`;
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="คูปองและโปรโมชัน"
        description={`${fmtNumber(rows.length)} โค้ด · ลูกค้ากรอกโค้ดในตะกร้าเพื่อรับส่วนลด`}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus aria-hidden /> สร้างคูปอง
              </Link>
            </Button>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={Ticket} title="ยังไม่มีคูปอง" description="สร้างโค้ดส่วนลด เช่น WELCOME10 ลด 10% สำหรับลูกค้าใหม่ หรือ FREESHIP ส่งฟรีเมื่อซื้อครบ" action={canWrite ? <Button asChild><Link href={`${base}/new`}>สร้างคูปองแรก</Link></Button> : undefined} />
      ) : (
        <div className="card py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>โค้ด</TableHead>
                <TableHead>ส่วนลด</TableHead>
                <TableHead className="hidden md:table-cell">เงื่อนไข</TableHead>
                <TableHead className="hidden text-right sm:table-cell">ใช้แล้ว</TableHead>
                <TableHead className="hidden lg:table-cell">ช่วงเวลา</TableHead>
                <TableHead className="hidden md:table-cell">สถานะ</TableHead>
                {canWrite && <TableHead className="text-right sm:w-24">จัดการ</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => {
                const st = STATE[discountState(d, now)];
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link href={`${base}/${d.id}`} className="font-mono font-semibold text-primary">
                        {d.code}
                      </Link>
                      {d.name && <span className="block text-xs text-muted-foreground">{d.name}</span>}
                      <span className="mt-1 block md:hidden">
                        <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                        <span className="ml-2 text-xs text-muted-foreground sm:hidden">ใช้แล้ว {fmtNumber(d.usedCount)}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{discountValueLabel(d)}</span>
                      <span className="block text-xs text-muted-foreground">{discountTypeLabel(d.type)}</span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {d.minSubtotal > 0 ? `ขั้นต่ำ ${thb(d.minSubtotal)}` : "ไม่มีขั้นต่ำ"}
                      {d.perCustomerLimit ? ` · ${d.perCustomerLimit} ครั้ง/คน` : ""}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {fmtNumber(d.usedCount)}
                      {d.maxUses ? <span className="text-muted-foreground"> / {fmtNumber(d.maxUses)}</span> : ""}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {d.startsAt || d.endsAt ? `${d.startsAt ? fmtDate(d.startsAt) : "ตอนนี้"} – ${d.endsAt ? fmtDate(d.endsAt) : "ไม่กำหนด"}` : "ไม่จำกัดเวลา"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                    </TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <DiscountRowActions slug={slug} id={d.id} code={d.code} active={d.active} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
