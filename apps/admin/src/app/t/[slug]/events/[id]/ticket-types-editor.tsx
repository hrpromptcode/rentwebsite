"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { SALE_STATE } from "@rentweb/module-events/admin/labels";
import { bahtToSatang, fieldErrors, satangToBaht, ticketTypeInputSchema, type TicketTypeInput } from "@rentweb/module-events/admin/schemas";
import { BkkDateTimeInput, MoneyInput, NativeSelect, StatusPill, formatThaiDateTime, formatThaiSession } from "@rentweb/module-events/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { deleteTicketTypeAction, saveTicketTypeAction, setTicketTypeVisibilityAction } from "../actions";

export interface TicketTypeVM {
  id: string;
  sessionId: string | null;
  name: string;
  description: string | null;
  price: number;
  quantity: number | null;
  reserved: number;
  sold: number;
  minPerOrder: number;
  maxPerOrder: number;
  salesStart: string | null;
  salesEnd: string | null;
  visibility: string;
  sort: number;
  saleState: string;
}

export interface SessionOption {
  id: string;
  name: string | null;
  startsAt: string;
  endsAt: string;
}

type Draft = { sessionId: string; name: string; description: string; price: string; quantity: string; minPerOrder: string; maxPerOrder: string; salesStart: string; salesEnd: string; visibility: string; sort: string };
const EMPTY: Draft = { sessionId: "", name: "", description: "", price: "", quantity: "", minPerOrder: "1", maxPerOrder: "10", salesStart: "", salesEnd: "", visibility: "public", sort: "0" };

export function TicketTypesEditor({ slug, eventId, types, sessions, canWrite }: { slug: string; eventId: string; types: TicketTypeVM[]; sessions: SessionOption[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const [d, setD] = React.useState<Draft>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const sessionLabel = (id: string | null) => {
    const s = sessions.find((x) => x.id === id);
    return s ? s.name || formatThaiSession(new Date(s.startsAt), new Date(s.endsAt)) : null;
  };

  const start = (t?: TicketTypeVM) => {
    setEditing(t ? t.id : "new");
    setD(t ? { sessionId: t.sessionId ?? "", name: t.name, description: t.description ?? "", price: satangToBaht(t.price), quantity: t.quantity === null ? "" : String(t.quantity), minPerOrder: String(t.minPerOrder), maxPerOrder: String(t.maxPerOrder), salesStart: t.salesStart ?? "", salesEnd: t.salesEnd ?? "", visibility: t.visibility, sort: String(t.sort) } : { ...EMPTY, sort: String(types.length) });
    setErrors({});
  };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const input: TicketTypeInput = {
      sessionId: d.sessionId || null,
      name: d.name,
      description: d.description || null,
      price: bahtToSatang(d.price || 0),
      quantity: d.quantity === "" ? null : Number(d.quantity),
      minPerOrder: Number(d.minPerOrder || 1),
      maxPerOrder: Number(d.maxPerOrder || 10),
      salesStart: d.salesStart || null,
      salesEnd: d.salesEnd || null,
      visibility: d.visibility as "public" | "hidden",
      sort: Number(d.sort || 0),
    };
    const parsed = ticketTypeInputSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setPending(true);
    try {
      const r = await saveTicketTypeAction(slug, eventId, editing === "new" ? null : editing, input);
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

  return (
    <Card data-testid="ticket-types-editor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="size-4" aria-hidden /> ประเภทบัตร
        </CardTitle>
        <CardDescription>ราคา จำนวน ช่วงเวลาขาย และขั้นต่ำ/สูงสุดต่อคำสั่งซื้อ · บัตรราคา 0 = บัตรฟรี (ออกบัตรทันที)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">ยังไม่มีประเภทบัตร — เพิ่มอย่างน้อย 1 ประเภทก่อนเผยแพร่</p>}
        <ul className="space-y-2">
          {types.map((t) => {
            const live = t.sold + t.reserved;
            const remaining = t.quantity === null ? null : Math.max(0, t.quantity - live);
            const pct = t.quantity ? Math.min(100, Math.round((t.sold / t.quantity) * 100)) : 0;
            return (
              <li key={t.id} className={cn("rounded-xl border p-3 text-sm", t.visibility === "hidden" && "bg-muted/40")} data-testid="ticket-type-row">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span data-testid="ticket-type-name">{t.name}</span>
                      <StatusPill map={SALE_STATE} status={t.visibility === "hidden" ? "hidden" : t.saleState} />
                      {t.sessionId && <Badge variant="outline">{sessionLabel(t.sessionId) ?? "เฉพาะรอบ"}</Badge>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums">{t.price ? thb(t.price) : "ฟรี"}</span>
                      <span>
                        ขายแล้ว {t.sold}
                        {t.reserved ? ` · ถือไว้ ${t.reserved}` : ""} {t.quantity === null ? "· ไม่จำกัด" : `/ ${t.quantity} (เหลือ ${remaining})`}
                      </span>
                      <span>
                        {t.minPerOrder}–{t.maxPerOrder} ใบ/คำสั่งซื้อ
                      </span>
                      {(t.salesStart || t.salesEnd) && (
                        <span>
                          ขาย {t.salesStart ? formatThaiDateTime(new Date(t.salesStart)) : "ทันที"} – {t.salesEnd ? formatThaiDateTime(new Date(t.salesEnd)) : "จนจบงาน"}
                        </span>
                      )}
                    </p>
                    {t.description && <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>}
                    {t.quantity !== null && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className={cn("h-full", pct >= 100 ? "bg-rose-500" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`แก้ไข ${t.name}`} onClick={() => start(t)}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.visibility === "hidden" ? "แสดงบนหน้าร้าน" : "ซ่อนจากหน้าร้าน"}
                        onClick={() => setTicketTypeVisibilityAction(slug, eventId, t.id, t.visibility === "hidden" ? "public" : "hidden").then((r) => (r.ok ? (toast.success(r.message), router.refresh()) : toast.error(r.error)))}
                      >
                        {t.visibility === "hidden" ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                      </Button>
                      {live === 0 && (
                        <ConfirmButton type="button" variant="ghost" size="icon-sm" aria-label={`ลบ ${t.name}`} title={`ลบ “${t.name}”?`} description="ลบได้เฉพาะประเภทที่ยังไม่มีบัตร" confirmLabel="ลบ" action={async () => {
                          const r = await deleteTicketTypeAction(slug, eventId, t.id);
                          if (r.ok) router.refresh();
                          return r;
                        }}>
                          <Trash2 aria-hidden />
                        </ConfirmButton>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {canWrite && (
          <Button type="button" variant="outline" size="sm" onClick={() => start()} data-testid="ticket-type-add">
            <Plus aria-hidden /> เพิ่มประเภทบัตร
          </Button>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={submit} className="grid gap-4" data-testid="ticket-type-form">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "เพิ่มประเภทบัตร" : "แก้ไขประเภทบัตร"}</DialogTitle>
              <DialogDescription>จำนวนที่ขายไปแล้วจะไม่ถูกแก้ ลดจำนวนต่ำกว่าที่ขายแล้วไม่ได้</DialogDescription>
            </DialogHeader>
            <Field label="ชื่อประเภทบัตร" htmlFor="t-name" error={errors.name}>
              <Input id="t-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="เช่น Early Bird, บัตรทั่วไป, VIP" maxLength={120} autoFocus data-testid="ticket-type-name-input" />
            </Field>
            <Field label="คำอธิบาย (ไม่บังคับ)" htmlFor="t-desc" error={errors.description}>
              <Textarea id="t-desc" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={2} maxLength={1000} placeholder="สิ่งที่รวมในบัตร โซนที่นั่ง ของที่ระลึก…" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ราคา (บาท)" htmlFor="t-price" error={errors.price} hint="0 = บัตรฟรี">
                <MoneyInput id="t-price" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} placeholder="0" invalid={!!errors.price} data-testid="ticket-type-price" />
              </Field>
              <Field label="จำนวนบัตร" htmlFor="t-qty" error={errors.quantity} hint="เว้นว่าง = ไม่จำกัด">
                <Input id="t-qty" type="number" inputMode="numeric" min={0} max={1_000_000} value={d.quantity} onChange={(e) => setD({ ...d, quantity: e.target.value })} placeholder="ไม่จำกัด" data-testid="ticket-type-qty" />
              </Field>
              <Field label="ขั้นต่ำต่อคำสั่งซื้อ" htmlFor="t-min" error={errors.minPerOrder}>
                <Input id="t-min" type="number" inputMode="numeric" min={1} max={100} value={d.minPerOrder} onChange={(e) => setD({ ...d, minPerOrder: e.target.value })} />
              </Field>
              <Field label="สูงสุดต่อคำสั่งซื้อ" htmlFor="t-max" error={errors.maxPerOrder}>
                <Input id="t-max" type="number" inputMode="numeric" min={1} max={100} value={d.maxPerOrder} onChange={(e) => setD({ ...d, maxPerOrder: e.target.value })} />
              </Field>
              <Field label="เปิดขาย" htmlFor="t-start" error={errors.salesStart} hint="เว้นว่าง = ขายทันทีที่เผยแพร่">
                <BkkDateTimeInput id="t-start" value={d.salesStart} onChange={(iso) => setD({ ...d, salesStart: iso })} invalid={!!errors.salesStart} />
              </Field>
              <Field label="ปิดขาย" htmlFor="t-end" error={errors.salesEnd} hint="เว้นว่าง = จนรอบ/งานจบ">
                <BkkDateTimeInput id="t-end" value={d.salesEnd} onChange={(iso) => setD({ ...d, salesEnd: iso })} invalid={!!errors.salesEnd} />
              </Field>
              <Field label="ใช้ได้กับรอบ" htmlFor="t-session" error={errors.sessionId}>
                <NativeSelect id="t-session" value={d.sessionId} onChange={(e) => setD({ ...d, sessionId: e.target.value })}>
                  <option value="">ทุกรอบของงาน</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ? `${s.name} · ` : ""}
                      {formatThaiSession(new Date(s.startsAt), new Date(s.endsAt))}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="การแสดงผล" htmlFor="t-vis" error={errors.visibility} hint="ซ่อน = ขายผ่านลิงก์ตรง / หน้างานเท่านั้น">
                <NativeSelect id="t-vis" value={d.visibility} onChange={(e) => setD({ ...d, visibility: e.target.value })}>
                  <option value="public">แสดงบนหน้าร้าน</option>
                  <option value="hidden">ซ่อน</option>
                </NativeSelect>
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={pending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending} data-testid="ticket-type-save">
                {pending && <Loader2 className="animate-spin" aria-hidden />} {editing === "new" ? "เพิ่มประเภทบัตร" : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
