"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarPlus, DoorOpen, Loader2, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { SESSION_STATUS } from "@rentweb/module-events/admin/labels";
import { fieldErrors, sessionInputSchema, type SessionInput } from "@rentweb/module-events/admin/schemas";
import { BkkDateTimeInput, StatusPill, formatThaiSession, formatThaiTime } from "@rentweb/module-events/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { deleteSessionAction, saveSessionAction, setSessionStatusAction } from "../actions";

export interface SessionVM {
  id: string;
  name: string | null;
  startsAt: string;
  endsAt: string;
  doorsOpen: string | null;
  capacity: number | null;
  reserved: number;
  sold: number;
  status: string;
  sort: number;
}

type Draft = { name: string; startsAt: string; endsAt: string; doorsOpen: string; capacity: string; sort: string };

function defaultDraft(last?: SessionVM): Draft {
  // next session defaults to the day after the last one at the same time (recurring events)
  if (last) {
    const s = new Date(last.startsAt);
    const e = new Date(last.endsAt);
    const d = new Date(s.getTime() + 86_400_000);
    const de = new Date(e.getTime() + 86_400_000);
    return { name: "", startsAt: d.toISOString(), endsAt: de.toISOString(), doorsOpen: last.doorsOpen ? new Date(new Date(last.doorsOpen).getTime() + 86_400_000).toISOString() : "", capacity: last.capacity ? String(last.capacity) : "", sort: String(last.sort + 1) };
  }
  const base = new Date();
  base.setUTCMinutes(0, 0, 0);
  const s = new Date(base.getTime() + 7 * 86_400_000 + 3 * 3_600_000);
  return { name: "", startsAt: s.toISOString(), endsAt: new Date(s.getTime() + 3 * 3_600_000).toISOString(), doorsOpen: "", capacity: "", sort: "0" };
}

export function SessionsEditor({ slug, eventId, sessions, canWrite }: { slug: string; eventId: string; sessions: SessionVM[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const [d, setD] = React.useState<Draft>(defaultDraft());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  const start = (s?: SessionVM) => {
    setEditing(s ? s.id : "new");
    setD(s ? { name: s.name ?? "", startsAt: s.startsAt, endsAt: s.endsAt, doorsOpen: s.doorsOpen ?? "", capacity: s.capacity ? String(s.capacity) : "", sort: String(s.sort) } : defaultDraft(sessions[sessions.length - 1]));
    setErrors({});
  };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const input: SessionInput = { name: d.name || null, startsAt: d.startsAt, endsAt: d.endsAt, doorsOpen: d.doorsOpen || null, capacity: d.capacity ? Number(d.capacity) : null, sort: Number(d.sort || 0) };
    const parsed = sessionInputSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setPending(true);
    try {
      const r = await saveSessionAction(slug, eventId, editing === "new" ? null : editing, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setEditing(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function setStatus(id: string, status: "scheduled" | "cancelled" | "ended") {
    const r = await setSessionStatusAction(slug, eventId, id, status);
    if (r.ok) router.refresh();
    return r;
  }

  return (
    <Card data-testid="sessions-editor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DoorOpen className="size-4" aria-hidden /> รอบการแสดง / วันจัดงาน
        </CardTitle>
        <CardDescription>งานวันเดียวมี 1 รอบ · งานหลายวันหรือหลายรอบเพิ่มได้ตามต้องการ · ความจุรอบจำกัดจำนวนบัตรรวมทุกประเภท</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">ยังไม่มีรอบ — เพิ่มอย่างน้อย 1 รอบก่อนเผยแพร่</p>}
        <ul className="space-y-2">
          {sessions.map((s) => {
            const live = s.sold + s.reserved;
            return (
              <li key={s.id} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm", s.status !== "scheduled" && "opacity-60")} data-testid="session-row">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="tabular-nums">{formatThaiSession(new Date(s.startsAt), new Date(s.endsAt))}</span>
                    <StatusPill map={SESSION_STATUS} status={s.status} />
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {s.name && <span>{s.name}</span>}
                    {s.doorsOpen && <span>ประตูเปิด {formatThaiTime(new Date(s.doorsOpen))}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" aria-hidden /> ขายแล้ว {s.sold}
                      {s.reserved > 0 ? ` · ถือไว้ ${s.reserved}` : ""} {s.capacity ? ` / ${s.capacity} ที่นั่ง` : " · ไม่จำกัดที่นั่ง"}
                    </span>
                  </p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="แก้ไขรอบ" onClick={() => start(s)}>
                      <Pencil aria-hidden />
                    </Button>
                    {s.status === "scheduled" ? (
                      <ConfirmButton type="button" variant="ghost" size="icon-sm" aria-label="ยกเลิกรอบ" title="ยกเลิกรอบนี้?" description={live > 0 ? `รอบนี้มีบัตร ${live} ใบ — บัตรจะถูกปฏิเสธที่จุดเช็กอิน และต้องคืนเงินลูกค้าจากหน้าคำสั่งซื้อ` : "รอบนี้ยังไม่มีบัตร ยกเลิกได้โดยไม่กระทบลูกค้า"} confirmLabel="ยกเลิกรอบ" action={() => setStatus(s.id, "cancelled")}>
                        <Ban aria-hidden />
                      </ConfirmButton>
                    ) : (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="เปิดรอบอีกครั้ง" onClick={() => setStatus(s.id, "scheduled").then((r) => (r.ok ? toast.success(r.message) : toast.error(r.error)))}>
                        <RotateCcw aria-hidden />
                      </Button>
                    )}
                    {live === 0 && (
                      <ConfirmButton type="button" variant="ghost" size="icon-sm" aria-label="ลบรอบ" title="ลบรอบนี้?" description="ลบได้เฉพาะรอบที่ยังไม่มีบัตร" confirmLabel="ลบ" action={async () => {
                        const r = await deleteSessionAction(slug, eventId, s.id);
                        if (r.ok) router.refresh();
                        return r;
                      }}>
                        <Trash2 aria-hidden />
                      </ConfirmButton>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {canWrite && (
          <Button type="button" variant="outline" size="sm" onClick={() => start()} data-testid="session-add">
            <CalendarPlus aria-hidden /> เพิ่มรอบ
          </Button>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto">
          <form onSubmit={submit} className="grid gap-4" data-testid="session-form">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "เพิ่มรอบ" : "แก้ไขรอบ"}</DialogTitle>
              <DialogDescription>เวลาเป็นเวลาประเทศไทย (Asia/Bangkok)</DialogDescription>
            </DialogHeader>
            <Field label="ชื่อรอบ (ไม่บังคับ)" htmlFor="s-name" error={errors.name} hint="เช่น รอบบ่าย, คืนแรก, วันที่ 1">
              <Input id="s-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={120} autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="เริ่ม" htmlFor="s-start" error={errors.startsAt}>
                <BkkDateTimeInput id="s-start" value={d.startsAt} onChange={(iso) => setD((cur) => ({ ...cur, startsAt: iso, endsAt: cur.endsAt && iso && new Date(cur.endsAt) <= new Date(iso) ? new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString() : cur.endsAt }))} required invalid={!!errors.startsAt} data-testid="session-start" />
              </Field>
              <Field label="จบ" htmlFor="s-end" error={errors.endsAt}>
                <BkkDateTimeInput id="s-end" value={d.endsAt} onChange={(iso) => setD({ ...d, endsAt: iso })} required invalid={!!errors.endsAt} data-testid="session-end" />
              </Field>
              <Field label="ประตูเปิด (ไม่บังคับ)" htmlFor="s-doors" error={errors.doorsOpen} hint="ใช้คำนวณเวลาเริ่มเช็กอิน">
                <BkkDateTimeInput id="s-doors" value={d.doorsOpen} onChange={(iso) => setD({ ...d, doorsOpen: iso })} />
              </Field>
              <Field label="ความจุรอบ (ที่นั่ง)" htmlFor="s-cap" error={errors.capacity} hint="เว้นว่าง = ไม่จำกัด (ใช้จำนวนของแต่ละประเภทบัตร)">
                <Input id="s-cap" type="number" inputMode="numeric" min={1} max={1_000_000} value={d.capacity} onChange={(e) => setD({ ...d, capacity: e.target.value })} placeholder="ไม่จำกัด" />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={pending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending} data-testid="session-save">
                {pending && <Loader2 className="animate-spin" aria-hidden />} {editing === "new" ? "เพิ่มรอบ" : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
