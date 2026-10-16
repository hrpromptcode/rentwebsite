"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { addDays, formatThaiDate, parseYmd, ymdToString } from "@rentweb/module-booking/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { addTimeOffAction, removeTimeOffAction } from "./actions";

export interface TimeOffVM {
  id: string;
  staffName: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

const DAY = 86_400_000;

function rangeLabel(r: TimeOffVM): string {
  const s = new Date(r.startsAt);
  const e = new Date(r.endsAt);
  const bkk = (d: Date) => new Date(d.getTime() + 7 * 3_600_000);
  const allDay = bkk(s).getUTCHours() === 0 && bkk(s).getUTCMinutes() === 0 && bkk(e).getUTCHours() === 0 && bkk(e).getUTCMinutes() === 0;
  if (allDay) {
    const last = new Date(e.getTime() - DAY);
    const a = formatThaiDate(s, { weekday: true, short: true });
    return last.getTime() <= s.getTime() ? `${a} (ทั้งวัน)` : `${a} – ${formatThaiDate(last, { weekday: true, short: true })} (ทั้งวัน)`;
  }
  return `${formatThaiDate(s, { short: true, time: true })} – ${formatThaiDate(e, { short: true, time: true })}`;
}

export function TimeOffManager({ slug, staffId, rows, today, canEdit, showStaff }: { slug: string; staffId: string | null; rows: TimeOffVM[]; today: string; canEdit: boolean; showStaff?: boolean }) {
  const router = useRouter();
  const [allDay, setAllDay] = React.useState(true);
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [fromT, setFromT] = React.useState(`${today}T12:00`);
  const [toT, setToT] = React.useState(`${today}T13:00`);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function add(e: React.FormEvent) {
    e.preventDefault();
    let startsAt = fromT;
    let endsAt = toT;
    if (allDay) {
      const end = parseYmd(to < from ? from : to);
      startsAt = `${from}T00:00`;
      endsAt = end ? `${ymdToString(addDays(end, 1))}T00:00` : "";
    }
    setPending(true);
    setErrors({});
    try {
      const r = await addTimeOffAction(slug, { staffId, startsAt, endsAt, reason: reason || null });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      if (r.data?.affected) toast.warning(r.message ?? "บันทึกแล้ว", { duration: 8000 });
      else toast.success(r.message ?? "บันทึกแล้ว");
      setReason("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card data-testid={staffId ? "staff-time-off" : "shop-closures"}>
      <CardHeader>
        <CardTitle>{staffId ? "วันหยุด / ลา" : "วันหยุดร้าน"}</CardTitle>
        <CardDescription>{staffId ? "ช่วงที่ไม่รับคิว เช่น ลาพักร้อน ไปอบรม หรือพักเที่ยง" : "ปิดรับคิวทั้งร้าน เช่น วันหยุดนักขัตฤกษ์ ปิดปรับปรุง"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarOff className="size-4" aria-hidden /> ไม่มีวันหยุดที่กำลังจะถึง
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {rows.map((r) => (
              <li key={r.id} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{rangeLabel(r)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {showStaff && (r.staffName ?? "ทั้งร้าน")}
                    {showStaff && r.reason && " · "}
                    {r.reason ?? (showStaff ? "" : "ไม่ระบุเหตุผล")}
                  </span>
                </span>
                {canEdit && (
                  <ConfirmButton
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label="ลบวันหยุด"
                    title="ลบวันหยุดนี้?"
                    description="ช่วงเวลานี้จะกลับมารับคิวได้ตามตารางปกติ"
                    confirmLabel="ลบ"
                    action={async () => {
                      const res = await removeTimeOffAction(slug, r.id, staffId);
                      if (res.ok) router.refresh();
                      return res;
                    }}
                  >
                    <Trash2 aria-hidden />
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form onSubmit={add} className="space-y-3 rounded-xl border border-dashed p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">หยุดทั้งวัน</span>
              <Switch checked={allDay} onCheckedChange={setAllDay} aria-label="หยุดทั้งวัน" />
            </label>
            {allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="ตั้งแต่วันที่" htmlFor={`to-from-${staffId ?? "shop"}`}>
                  <Input id={`to-from-${staffId ?? "shop"}`} type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} required />
                </Field>
                <Field label="ถึงวันที่" htmlFor={`to-to-${staffId ?? "shop"}`}>
                  <Input id={`to-to-${staffId ?? "shop"}`} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
                </Field>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="เริ่ม" htmlFor={`to-fromt-${staffId ?? "shop"}`} error={errors.startsAt}>
                  <Input id={`to-fromt-${staffId ?? "shop"}`} type="datetime-local" step={1800} value={fromT} onChange={(e) => setFromT(e.target.value)} required />
                </Field>
                <Field label="สิ้นสุด" htmlFor={`to-tot-${staffId ?? "shop"}`} error={errors.endsAt}>
                  <Input id={`to-tot-${staffId ?? "shop"}`} type="datetime-local" step={1800} value={toT} onChange={(e) => setToT(e.target.value)} required />
                </Field>
              </div>
            )}
            <div className="flex gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล (ไม่บังคับ)" maxLength={200} aria-label="เหตุผล" />
              <Button type="submit" variant="secondary" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} เพิ่ม
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
