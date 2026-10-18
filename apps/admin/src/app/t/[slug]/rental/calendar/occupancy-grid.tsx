"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Loader2, LockOpen } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { STAY_STATUS } from "@rentweb/module-rental/admin/labels";
import { NativeSelect, StatusPill, THAI_WEEKDAYS_SHORT, formatThaiYmd, weekdayOf } from "@rentweb/module-rental/admin/ui";
import { Field } from "@/components/ui/form";
import { setBlockedAction } from "./actions";

export interface GridType {
  id: string;
  name: string;
  quantity: number;
  active: boolean;
  days: Array<{ date: string; booked: number; remaining: number; blocked: boolean; past: boolean }>;
}

export interface GridStay {
  id: string;
  number: string;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
  unitTypeId: string;
  unitNumber: string | null;
}

/**
 * Month occupancy per unit type: one row per type, one cell per night (booked / quantity). Click a cell to block or
 * unblock a range starting there. Stays of the month are listed under the grid with links to their detail pages.
 */
export function OccupancyGrid({ slug, month, today, types, stays, canWrite }: { slug: string; month: string; today: string; types: GridType[]; stays: GridStay[]; canWrite: boolean }) {
  const router = useRouter();
  const dates = types[0]?.days.map((d) => d.date) ?? [];
  const [dialog, setDialog] = React.useState<{ typeId: string; date: string; blocked: boolean } | null>(null);
  const [typeId, setTypeId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const open = (t: GridType, d: GridType["days"][number]) => {
    if (!canWrite) return;
    setDialog({ typeId: t.id, date: d.date, blocked: d.blocked });
    setTypeId(t.id);
    setFrom(d.date);
    setTo(d.date);
    setReason("");
  };

  async function submit(blocked: boolean) {
    setPending(true);
    try {
      const r = await setBlockedAction(slug, { unitTypeId: typeId, from, to, reason: reason || null, blocked });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "บันทึกแล้ว");
        setDialog(null);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  const heat = (booked: number, qty: number) => {
    if (qty <= 0) return "bg-muted";
    const r = booked / qty;
    if (r >= 1) return "bg-rose-500/80 text-white";
    if (r >= 0.75) return "bg-amber-500/70 text-amber-950";
    if (r > 0) return "bg-emerald-500/40";
    return "bg-emerald-500/10";
  };

  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto py-0" data-testid="occupancy-grid">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[160px] border-b bg-card px-3 py-2 text-left font-medium">ประเภทห้อง</th>
              {dates.map((d) => {
                const wd = weekdayOf(d);
                return (
                  <th key={d} className={cn("min-w-[2.6rem] border-b px-0.5 py-2 text-center font-medium", (wd === 0 || wd === 6) && "bg-muted/40", d === today && "text-primary")}>
                    <span className="block text-[10px] text-muted-foreground">{THAI_WEEKDAYS_SHORT[wd]}</span>
                    <span className={cn("tabular-nums", d === today && "rounded-full bg-primary px-1.5 text-primary-foreground")}>{Number(d.slice(-2))}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} data-testid={`grid-row-${t.id}`}>
                <th scope="row" className="sticky left-0 z-10 border-b bg-card px-3 py-1.5 text-left font-medium">
                  <span className={cn(!t.active && "text-muted-foreground line-through")}>{t.name}</span>
                  <span className="block text-[10px] font-normal text-muted-foreground">{t.quantity} ห้อง</span>
                </th>
                {t.days.map((d) => (
                  <td key={d.date} className="border-b p-0.5">
                    <button
                      type="button"
                      disabled={!canWrite}
                      onClick={() => open(t, d)}
                      data-date={d.date}
                      data-blocked={d.blocked || undefined}
                      aria-label={`${t.name} ${formatThaiYmd(d.date, { short: true })}: ${d.blocked ? "ปิดจอง" : `จองแล้ว ${d.booked} จาก ${t.quantity}`}`}
                      className={cn("flex h-10 w-full min-w-[2.4rem] items-center justify-center rounded-md tabular-nums transition", d.blocked ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(120,120,120,0.35)_3px,rgba(120,120,120,0.35)_6px)] text-muted-foreground" : heat(d.booked, t.quantity), d.past && "opacity-50", canWrite && "hover:ring-2 hover:ring-primary/50")}
                    >
                      {d.blocked ? <Ban className="size-3.5" aria-hidden /> : d.booked > 0 ? d.booked : ""}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-emerald-500/10" /> ว่าง
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-emerald-500/40" /> มีผู้จอง
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-amber-500/70" /> ใกล้เต็ม
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-rose-500/80" /> เต็ม
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Ban className="size-3" /> ปิดจอง
          </span>
          {canWrite && <span className="ml-auto">คลิกช่องวันที่เพื่อปิด/เปิดจอง</span>}
        </div>
      </div>

      <section className="card py-0">
        <h2 className="border-b px-4 py-3 font-heading text-base font-semibold">การจองในเดือนนี้ ({stays.length})</h2>
        {stays.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">ยังไม่มีการจองที่คาบเกี่ยวเดือนนี้</p>
        ) : (
          <ul className="divide-y text-sm">
            {stays.map((s) => (
              <li key={s.id}>
                <Link href={`/t/${slug}/rental/bookings/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-muted/40">
                  <span className="font-mono text-xs">{s.number}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{s.guestName}</span>
                  <span className="text-muted-foreground">{types.find((t) => t.id === s.unitTypeId)?.name}{s.unitNumber ? ` · ${s.unitNumber}` : ""}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatThaiYmd(s.checkIn, { short: true, year: false })} → {formatThaiYmd(s.checkOut, { short: true, year: false })}
                  </span>
                  <StatusPill map={STAY_STATUS} status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.blocked ? "เปิดจองอีกครั้ง" : "ปิดจอง (ซ่อมบำรุง / เจ้าของใช้)"}</DialogTitle>
            <DialogDescription>วันที่ปิดจองจะไม่แสดงเป็นห้องว่างบนหน้าร้าน การจองที่มีอยู่แล้วไม่ถูกเปลี่ยนแปลง</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="ประเภทห้อง" htmlFor="block-type">
              <NativeSelect id="block-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ตั้งแต่วันที่" htmlFor="block-from">
                <Input id="block-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="ถึงวันที่" htmlFor="block-to">
                <Input id="block-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            <Field label="เหตุผล (ไม่บังคับ)" htmlFor="block-reason">
              <Input id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="เช่น ซ่อมแอร์, เจ้าของใช้" />
            </Field>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => submit(false)} disabled={pending} data-testid="unblock-submit">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LockOpen aria-hidden />} เปิดจอง
            </Button>
            <Button type="button" variant="destructive" onClick={() => submit(true)} disabled={pending} data-testid="block-submit">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Ban aria-hidden />} ปิดจองช่วงนี้
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
