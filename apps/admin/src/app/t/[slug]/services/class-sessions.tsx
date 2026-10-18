"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { THAI_WEEKDAYS } from "@rentweb/module-booking/admin/labels";
import { ColorDot, NativeSelect } from "@rentweb/module-booking/admin/ui";
import { saveClassSessionsAction } from "./actions";

/*
 * Weekly timetable editor of a class (course template). Each row = one availability_rules row with service_id:
 * weekday + start time + instructor. The end time follows the class duration; the storefront timetable, the booking
 * wizard and the admin calendar all read these rows.
 */

export interface ClassSessionRowVM {
  weekday: number;
  /** HH:MM */
  start: string;
  /** staff id or "" */
  staffId: string;
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function endOf(start: string, durationMin: number): string {
  const [h, m] = start.split(":").map(Number) as [number, number];
  if (Number.isNaN(h) || Number.isNaN(m)) return "–";
  const t = (h * 60 + m + durationMin) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function ClassSessionsCard({ slug, serviceId, durationMin, capacity, initial, instructors, canEdit }: { slug: string; serviceId: string; durationMin: number; capacity: number; initial: ClassSessionRowVM[]; instructors: Array<{ id: string; name: string; color: string }>; canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = React.useState<ClassSessionRowVM[]>(initial);
  const [pending, setPending] = React.useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const sorted = [...rows].map((r, i) => ({ r, i })).sort((a, b) => WEEK_ORDER.indexOf(a.r.weekday) - WEEK_ORDER.indexOf(b.r.weekday) || a.r.start.localeCompare(b.r.start));

  const update = (i: number, patch: Partial<ClassSessionRowVM>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    const last = rows[rows.length - 1];
    setRows((rs) => [...rs, { weekday: last ? (last.weekday + 1) % 7 : 1, start: last?.start ?? "18:00", staffId: last?.staffId ?? instructors[0]?.id ?? "" }]);
  };
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  async function save() {
    setPending(true);
    try {
      const r = await saveClassSessionsAction(slug, { serviceId, sessions: rows.map((x) => ({ weekday: x.weekday, start: x.start, staffId: x.staffId || null })) });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card data-testid="class-sessions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-5 text-muted-foreground" aria-hidden /> รอบเรียนประจำสัปดาห์ ({rows.length} รอบ)
        </CardTitle>
        <CardDescription>
          คลาสละ {durationMin} นาที รับ {capacity} ที่นั่ง/รอบ — ลูกค้าเห็นรอบเหล่านี้ในตารางเรียนและสมัครได้ทันที วันหยุด/วันลาครูตั้งในหน้าพนักงาน (เวลาหยุด) แล้วรอบจะหายไปเอง
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">ยังไม่มีรอบเรียน — คลาสนี้จะไม่ปรากฏในตารางเรียนจนกว่าจะเพิ่มรอบ</p>
        ) : (
          <ul className="grid gap-2" aria-label="รอบเรียน">
            {sorted.map(({ r, i }) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-2 rounded-xl border p-3 sm:grid-cols-[9rem_7rem_auto_minmax(0,1fr)_auto] sm:items-center" data-testid="class-session-row">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  วัน
                  <NativeSelect value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })} disabled={!canEdit} aria-label="วันในสัปดาห์">
                    {WEEK_ORDER.map((w) => (
                      <option key={w} value={w}>
                        {THAI_WEEKDAYS[w]}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  เริ่ม
                  <Input type="time" step={300} value={r.start} onChange={(e) => update(i, { start: e.target.value })} disabled={!canEdit} aria-label="เวลาเริ่ม" required />
                </label>
                <span className="text-sm tabular-nums text-muted-foreground sm:pt-4">– {endOf(r.start, durationMin)}</span>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  ครูผู้สอน
                  <span className="flex items-center gap-2">
                    {r.staffId && <ColorDot color={instructors.find((x) => x.id === r.staffId)?.color ?? "#64748b"} />}
                    <NativeSelect value={r.staffId} onChange={(e) => update(i, { staffId: e.target.value })} disabled={!canEdit} aria-label="ครูผู้สอน" className="min-w-0 flex-1">
                      <option value="">ไม่ระบุครู</option>
                      {instructors.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </span>
                </label>
                {canEdit && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`ลบรอบ ${THAI_WEEKDAYS[r.weekday]} ${r.start}`} className="justify-self-end text-destructive hover:text-destructive sm:pt-0">
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={add}>
              <Plus aria-hidden /> เพิ่มรอบ
            </Button>
            <Button type="button" onClick={save} disabled={pending || !dirty} data-testid="save-sessions">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกรอบเรียน
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
