import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { listAdminShippingMethods } from "@rentweb/module-commerce/admin";
import { SHIPPING_TYPE } from "@rentweb/module-commerce/admin/labels";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { MethodRowActions } from "./method-row-actions";

export const metadata: Metadata = { title: "การจัดส่ง" };

function configSummary(type: string, cfg: Record<string, unknown>): string {
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  switch (type) {
    case "flat":
      return n(cfg.amount) === 0 ? "ส่งฟรี" : thb(n(cfg.amount));
    case "weight": {
      const tiers = Array.isArray(cfg.tiers) ? (cfg.tiers as Array<{ maxGrams: unknown; amount: unknown }>) : [];
      if (!tiers.length) return "ยังไม่กำหนดขั้นน้ำหนัก";
      const sorted = [...tiers].sort((a, b) => n(a.maxGrams) - n(b.maxGrams));
      return `${sorted.length} ขั้น · ${thb(n(sorted[0]!.amount))} – ${thb(n(sorted[sorted.length - 1]!.amount))}`;
    }
    case "free_over":
      return `${thb(n(cfg.amount))} · ฟรีเมื่อครบ ${thb(n(cfg.threshold))}`;
    case "cod":
      return `${thb(n(cfg.amount))} + ค่าธรรมเนียม ${thb(n(cfg.fee))}`;
    case "pickup":
      return "ไม่มีค่าส่ง";
    default:
      return "—";
  }
}

export default async function ShippingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const rows = await tenantTx(ctx.tenant.id, (tx) => listAdminShippingMethods(tx, ctx.tenant.id));
  const canWrite = hasRole(ctx, "manager");
  const base = `/t/${slug}/shipping`;
  return (
    <div className="space-y-6">
      <PageHeader
        title="การจัดส่ง"
        description={`${fmtNumber(rows.length)} วิธี · ลูกค้าเลือกตอนชำระเงิน เรียงตามลำดับ`}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus aria-hidden /> เพิ่มวิธีจัดส่ง
              </Link>
            </Button>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={Truck} title="ยังไม่มีวิธีจัดส่ง" description="ลูกค้าจะชำระเงินไม่ได้จนกว่าจะมีวิธีจัดส่งอย่างน้อย 1 วิธี เช่น Kerry 60 บาท หรือรับที่ร้าน" action={canWrite ? <Button asChild><Link href={`${base}/new`}>เพิ่มวิธีจัดส่งแรก</Link></Button> : undefined} />
      ) : (
        <div className="card py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-12 sm:table-cell">ลำดับ</TableHead>
                <TableHead>วิธีจัดส่ง</TableHead>
                <TableHead className="hidden sm:table-cell">ประเภท</TableHead>
                <TableHead>ค่าส่ง</TableHead>
                <TableHead className="hidden md:table-cell">ระยะเวลา</TableHead>
                <TableHead className="hidden md:table-cell">สถานะ</TableHead>
                {canWrite && <TableHead className="text-right sm:w-24">จัดการ</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="hidden text-center text-xs tabular-nums text-muted-foreground sm:table-cell">{m.sort}</TableCell>
                  <TableCell className="whitespace-normal">
                    <Link href={`${base}/${m.id}`} className="font-medium text-primary">
                      {m.name}
                    </Link>
                    {m.description && <span className="block max-w-[18rem] truncate text-xs text-muted-foreground">{m.description}</span>}
                    <span className="mt-1 block text-xs text-muted-foreground sm:hidden">{SHIPPING_TYPE[m.type]?.label ?? m.type}</span>
                    <span className="mt-1 block md:hidden">
                      <Badge variant={m.active ? "success" : "muted"}>{m.active ? "เปิดใช้" : "ปิดใช้"}</Badge>
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline">{SHIPPING_TYPE[m.type]?.label ?? m.type}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal text-sm tabular-nums">{configSummary(m.type, (m.config ?? {}) as Record<string, unknown>)}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{m.estimatedDays ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={m.active ? "success" : "muted"}>{m.active ? "เปิดใช้" : "ปิดใช้"}</Badge>
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <MethodRowActions slug={slug} id={m.id} name={m.name} active={m.active} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
