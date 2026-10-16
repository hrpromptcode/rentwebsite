"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2, ShieldAlert } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Checkbox } from "@rentweb/ui/components/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { primaryPlayerField } from "@rentweb/module-topup/admin/labels";
import { FulfillmentBadge, PaymentStatusBadge, TopupStatusBadge, paymentMethodLabel } from "@rentweb/module-topup/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fmtRelative, thb } from "@/lib/format";
import { fulfillManyAction } from "./actions";

export interface OrderRowVM {
  id: string;
  number: string;
  gameName: string;
  packageName: string;
  gameImage: string | null;
  playerFields: Record<string, string>;
  price: number;
  paymentMethod: string;
  paymentStatus: string | null;
  status: string;
  fulfillment: string;
  riskScore: number;
  riskFlags: string[];
  refundRequired: boolean;
  contact: string | null;
  customerName: string | null;
  customerPhone: string | null;
  placedAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
}

export function OrdersTable({ slug, rows, canBatch }: { slug: string; rows: OrderRowVM[]; canBatch: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const batchable = rows.filter((r) => r.status === "processing" && r.fulfillment === "manual");
  const allChecked = batchable.length > 0 && batchable.every((r) => selected.has(r.id));
  const base = `/t/${slug}/topup/orders`;

  React.useEffect(() => {
    // drop ids that left the page after a refresh
    setSelected((prev) => new Set([...prev].filter((id) => rows.some((r) => r.id === id))));
  }, [rows]);

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function fulfillSelected() {
    setPending(true);
    try {
      const r = await fulfillManyAction(slug, [...selected]);
      if (!r.ok) return { ok: false as const, error: r.error };
      setSelected(new Set());
      router.refresh();
      return r;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-w-0">
      {canBatch && batchable.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <Checkbox checked={allChecked} onCheckedChange={(v) => setSelected(v ? new Set(batchable.map((r) => r.id)) : new Set())} aria-label="เลือกทั้งหมด" />
            <span>
              เลือกแล้ว <span className="font-semibold tabular-nums">{selected.size}</span> / {batchable.length} รายการ
            </span>
          </label>
          <ConfirmButton
            size="sm"
            disabled={selected.size === 0 || pending}
            title={`ยืนยันเติมสำเร็จ ${selected.size} รายการ?`}
            description="ทุกรายการที่เลือกจะเปลี่ยนเป็น “เติมสำเร็จ” โดยไม่แนบหลักฐาน ลูกค้าแต่ละรายจะได้รับแจ้งเตือนทันที"
            confirmLabel="เติมสำเร็จทั้งหมด"
            action={fulfillSelected}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck aria-hidden />} เติมสำเร็จที่เลือก
          </ConfirmButton>
        </div>
      )}
      <div className="relative overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {canBatch && <TableHead className="w-10" />}
              <TableHead>เลขที่ / สถานะ</TableHead>
              <TableHead>เกม · แพ็กเกจ</TableHead>
              <TableHead className="hidden md:table-cell">ผู้เล่น</TableHead>
              <TableHead className="text-right">ราคา</TableHead>
              <TableHead className="hidden sm:table-cell">การชำระ</TableHead>
              <TableHead className="hidden lg:table-cell">เวลา</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => {
              const player = primaryPlayerField(o.playerFields);
              const extra = Object.entries(o.playerFields).filter(([, v]) => v && v !== player);
              const selectable = canBatch && o.status === "processing" && o.fulfillment === "manual";
              return (
                <TableRow key={o.id} className="relative" data-state={selected.has(o.id) ? "selected" : undefined}>
                  {canBatch && (
                    <TableCell className="relative z-10 align-top">
                      {selectable && <Checkbox checked={selected.has(o.id)} onCheckedChange={(v) => toggle(o.id, !!v)} aria-label={`เลือก ${o.number}`} className="mt-1" />}
                    </TableCell>
                  )}
                  <TableCell className="align-top">
                    <Link href={`${base}/${o.id}`} className="font-semibold text-primary after:absolute after:inset-0 after:content-['']">
                      {o.number}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <TopupStatusBadge status={o.status} refundRequired={o.refundRequired} />
                      {o.riskScore >= 30 && (
                        <Badge variant="warning" className="gap-1">
                          <ShieldAlert aria-hidden /> เสี่ยง {o.riskScore}
                        </Badge>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground lg:hidden">{fmtRelative(o.placedAt)}</span>
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="flex items-start gap-2">
                      {o.gameImage ? <img src={o.gameImage} alt="" className="mt-0.5 size-8 shrink-0 rounded-lg object-cover" /> : <span className="mt-0.5 size-8 shrink-0 rounded-lg bg-muted" />}
                      <span className="min-w-0">
                        <span className="block max-w-[14rem] truncate font-medium">{o.packageName}</span>
                        <span className="block truncate text-xs text-muted-foreground">{o.gameName}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <FulfillmentBadge fulfillment={o.fulfillment} />
                        </span>
                        <span className="mt-1 block font-mono text-xs md:hidden">{player}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <span className="block font-mono text-sm font-medium">{player}</span>
                    {extra.length > 0 && <span className="block max-w-[12rem] truncate text-xs text-muted-foreground">{extra.map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>}
                    <span className="block truncate text-xs text-muted-foreground">{o.customerName ?? o.customerPhone ?? o.contact ?? "ไม่ได้ล็อกอิน"}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top font-semibold tabular-nums">
                    {thb(o.price)}
                    <span className="block text-xs font-normal text-muted-foreground sm:hidden">{paymentMethodLabel(o.paymentMethod)}</span>
                  </TableCell>
                  <TableCell className="hidden align-top sm:table-cell">
                    <PaymentStatusBadge status={o.paymentStatus} />
                    <span className="mt-1 block text-xs text-muted-foreground">{paymentMethodLabel(o.paymentMethod)}</span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap align-top text-muted-foreground lg:table-cell">
                    <span className="block">{fmtRelative(o.placedAt)}</span>
                    {o.paidAt && o.status === "processing" && <span className="block text-xs">ชำระ {fmtRelative(o.paidAt)}</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {pending && (
        <p className="px-4 py-2 text-xs text-muted-foreground" role="status">
          กำลังบันทึก…
        </p>
      )}
    </div>
  );
}
