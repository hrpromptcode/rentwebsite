"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Star } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Switch } from "@rentweb/ui/components/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { thb } from "@/lib/format";
import { toggleServiceFlagAction } from "./actions";
import { durationLabel } from "./form-values";

export interface ServiceRowVM {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  categoryName: string | null;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  price: number;
  priceNote: string | null;
  depositRequired: boolean;
  depositAmount: number;
  capacity: number;
  requiresStaff: boolean;
  active: boolean;
  featured: boolean;
  staffCount: number;
  upcomingBookings: number;
}

export function ServicesTable({ slug, rows, canWrite }: { slug: string; rows: ServiceRowVM[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  async function toggle(id: string, flags: { active?: boolean; featured?: boolean }) {
    setPending(`${id}:${Object.keys(flags)[0]}`);
    try {
      const r = await toggleServiceFlagAction(slug, id, flags);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>บริการ</TableHead>
            <TableHead className="hidden sm:table-cell">ระยะเวลา</TableHead>
            <TableHead className="w-px text-right">ราคา</TableHead>
            <TableHead className="hidden 2xl:table-cell">ผู้ให้บริการ</TableHead>
            <TableHead className="hidden w-12 text-center sm:table-cell">แนะนำ</TableHead>
            <TableHead className="w-px text-center">เปิด</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id} className={cn(!s.active && "bg-muted/30")}>
              <TableCell className="max-w-0 sm:max-w-none">
                <Link href={`/t/${slug}/services/${s.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                  <span className={cn("size-11 shrink-0 overflow-hidden rounded-lg border bg-muted", !s.active && "opacity-60")}>
                    {s.image ? <img src={s.image} alt="" className="size-full object-cover" loading="lazy" /> : <span className="grid size-full place-items-center text-[10px] text-muted-foreground">ไม่มีรูป</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-medium sm:line-clamp-none sm:block sm:max-w-[18rem] sm:truncate">{s.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.categoryName ?? "ไม่ระบุหมวดหมู่"}
                      <span className="sm:hidden"> · {durationLabel(s.durationMin)}</span>
                      {s.depositRequired && <span className="sm:hidden"> · มัดจำ {thb(s.depositAmount)}</span>}
                      <span className="hidden lg:inline 2xl:hidden"> · {!s.requiresStaff ? "ไม่ผูกพนักงาน" : `${s.staffCount} ผู้ให้บริการ`}</span>
                      {s.upcomingBookings > 0 && <> · คิวล่วงหน้า {s.upcomingBookings}</>}
                    </span>
                  </span>
                </Link>
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                {durationLabel(s.durationMin)}
                {(s.bufferBeforeMin > 0 || s.bufferAfterMin > 0) && <span className="block text-xs">+ เตรียม/พัก {s.bufferBeforeMin + s.bufferAfterMin} นาที</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">
                <span className="block font-medium">{s.price > 0 ? thb(s.price) : "ฟรี"}</span>
                {s.priceNote && <span className="block max-w-28 truncate text-xs text-muted-foreground sm:max-w-none">{s.priceNote}</span>}
                {s.depositRequired && (
                  <span className="mt-1 hidden justify-end sm:flex">
                    <Badge variant="warning">มัดจำ {thb(s.depositAmount)}</Badge>
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground 2xl:table-cell">
                {!s.requiresStaff ? "ไม่ผูกพนักงาน" : s.staffCount ? `${s.staffCount} คน` : <span className="text-destructive">ยังไม่มีผู้ให้บริการ</span>}
                {s.capacity > 1 && <span className="block text-xs">รับ {s.capacity} คน/รอบ</span>}
              </TableCell>
              <TableCell className="hidden text-center sm:table-cell">
                <button
                  type="button"
                  disabled={!canWrite || pending !== null}
                  onClick={() => toggle(s.id, { featured: !s.featured })}
                  className="inline-grid size-9 place-items-center rounded-lg hover:bg-muted disabled:cursor-not-allowed"
                  aria-label={s.featured ? `เอา ${s.name} ออกจากบริการแนะนำ` : `ตั้ง ${s.name} เป็นบริการแนะนำ`}
                  aria-pressed={s.featured}
                >
                  {pending === `${s.id}:featured` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Star className={cn("size-4", s.featured ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50")} aria-hidden />}
                </button>
              </TableCell>
              <TableCell className="text-center">
                <Switch checked={s.active} disabled={!canWrite || pending !== null} onCheckedChange={(c) => toggle(s.id, { active: c })} aria-label={s.active ? `ปิดการใช้งาน ${s.name}` : `เปิดใช้งาน ${s.name}`} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
