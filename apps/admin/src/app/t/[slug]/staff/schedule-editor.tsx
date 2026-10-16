"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Save } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { THAI_WEEKDAYS } from "@rentweb/module-booking/admin/labels";
import type { ScheduleDay } from "@rentweb/module-booking/admin/schemas";
import { saveScheduleAction } from "./actions";
import { WEEK_ORDER } from "./form-values";

/**
 * Weekly schedule editor. staffId = null edits the shop's business hours (availability_rules with staff_id null);
 * otherwise the staff's own rules, with an "inherit shop hours" switch.
 */
export function ScheduleEditor({
  slug,
  staffId,
  own,
  days: initialDays,
  businessDays,
  canEdit,
  title,
  description,
}: {
  slug: string;
  staffId: string | null;
  own: boolean;
  days: ScheduleDay[];
  businessDays?: ScheduleDay[];
  canEdit: boolean;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [inherit, setInherit] = React.useState(staffId ? !own : false);
  const [days, setDays] = React.useState<ScheduleDay[]>(initialDays);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const shown = inherit && businessDays ? businessDays : days;
  const locked = !canEdit || inherit;
  const dirtyRef = React.useRef(false);

  const update = (weekday: number, patch: Partial<ScheduleDay>) => {
    dirtyRef.current = true;
    setDays((ds) => ds.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  };

  function copyMonday() {
    const mon = days.find((d) => d.weekday === 1);
    if (!mon) return;
    setDays((ds) => ds.map((d) => (d.closed ? d : { ...d, start: mon.start, end: mon.end })));
    toast.message(`ใช้เวลา ${mon.start}–${mon.end} กับทุกวันที่เปิด`);
  }

  async function save() {
    setPending(true);
    setErrors({});
    try {
      const r = await saveScheduleAction(slug, { staffId, inherit, days: inherit && businessDays ? businessDays : days });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      dirtyRef.current = false;
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const openCount = shown.filter((d) => !d.closed).length;

  return (
    <Card data-testid={staffId ? "staff-schedule" : "business-hours"}>
      <CardHeader>
        <CardTitle>{title ?? (staffId ? "ตารางงานประจำสัปดาห์" : "เวลาทำการของร้าน")}</CardTitle>
        <CardDescription>{description ?? (staffId ? "วันที่ปิด = ไม่รับคิวทั้งวัน (ลูกค้าจะไม่เห็นช่องเวลาของวันนั้น)" : `ใช้เป็นช่วงเวลาของปฏิทิน และเป็นค่าเริ่มต้นของพนักงานที่ไม่ได้ตั้งตารางเอง · เปิด ${openCount} วัน/สัปดาห์`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {staffId && businessDays && (
          <label className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
            <span>
              <span className="block font-medium">ใช้เวลาทำการของร้าน</span>
              <span className="block text-xs text-muted-foreground">ปิดเพื่อกำหนดวัน/เวลางานของคนนี้เอง</span>
            </span>
            <Switch
              checked={inherit}
              disabled={!canEdit}
              onCheckedChange={(c) => {
                setInherit(c);
                if (!c && !own && !dirtyRef.current) setDays(businessDays.map((d) => ({ ...d })));
              }}
              aria-label="ใช้เวลาทำการของร้าน"
            />
          </label>
        )}
        <ul className="divide-y rounded-xl border">
          {WEEK_ORDER.map((w) => {
            const d = shown.find((x) => x.weekday === w)!;
            const name = THAI_WEEKDAYS[w];
            const idx = shown.indexOf(d);
            const e = errors[`days.${idx}.end`];
            return (
              <li key={w} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[7rem_auto_minmax(0,1fr)]", d.closed && "bg-muted/30")} data-testid={`schedule-day-${w}`}>
                <span className={cn("text-sm font-medium", (w === 0 || w === 6) && "text-primary")}>{name}</span>
                <label className="flex items-center gap-2 justify-self-end text-xs text-muted-foreground sm:justify-self-start">
                  <Switch checked={!d.closed} disabled={locked} onCheckedChange={(c) => update(w, { closed: !c })} aria-label={`เปิดทำงานวัน${name}`} />
                  <span className="w-8">{d.closed ? "หยุด" : "เปิด"}</span>
                </label>
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                  {d.closed ? (
                    <span className="text-sm text-muted-foreground">ไม่รับคิว</span>
                  ) : (
                    <>
                      <Input type="time" step={1800} value={d.start} disabled={locked} onChange={(ev) => update(w, { start: ev.target.value })} className="h-10 w-full max-w-32" aria-label={`เวลาเริ่มวัน${name}`} />
                      <span className="text-muted-foreground">–</span>
                      <Input type="time" step={1800} value={d.end} disabled={locked} onChange={(ev) => update(w, { end: ev.target.value })} className={cn("h-10 w-full max-w-32", e && "border-destructive")} aria-label={`เวลาเลิกวัน${name}`} aria-invalid={!!e} />
                      {e && <span className="hidden text-xs text-destructive sm:inline">{e}</span>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {canEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={copyMonday} disabled={locked}>
              <Copy aria-hidden /> ใช้เวลาวันจันทร์กับทุกวัน
            </Button>
            <Button type="button" onClick={save} disabled={pending} data-testid="save-schedule">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกตาราง
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
