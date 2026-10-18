"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { RATE_MODE_LABEL, WEEKDAY_PRESETS } from "@rentweb/module-rental/admin/labels";
import { bahtToSatang, fieldErrors, rateRuleSchema, satangToBaht, type RateRuleInput } from "@rentweb/module-rental/admin/schemas";
import { MoneyInput, NativeSelect, WeekdayPicker } from "@rentweb/module-rental/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { deleteRateRuleAction, saveRateRuleAction, toggleRateRuleAction } from "./actions";

export interface RuleVM {
  id: string;
  name: string;
  unitTypeId: string | null;
  startDate: string | null;
  endDate: string | null;
  weekdays: number[] | null;
  mode: string;
  value: number;
  priority: number;
  active: boolean;
}

type Draft = { name: string; unitTypeId: string; startDate: string; endDate: string; weekdays: number[]; mode: "percent" | "price"; value: string; priority: string; active: boolean };
const EMPTY: Draft = { name: "", unitTypeId: "", startDate: "", endDate: "", weekdays: [], mode: "percent", value: "", priority: "10", active: true };

/** Create / edit one seasonal or weekday rate rule. */
export function RateRuleDialog({ slug, rule, types, trigger }: { slug: string; rule: RuleVM | null; types: Array<{ id: string; name: string }>; trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [d, setD] = React.useState<Draft>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  const start = () => {
    setD(rule ? { name: rule.name, unitTypeId: rule.unitTypeId ?? "", startDate: rule.startDate ?? "", endDate: rule.endDate ?? "", weekdays: rule.weekdays ?? [], mode: rule.mode === "price" ? "price" : "percent", value: rule.mode === "price" ? satangToBaht(rule.value) : String(rule.value), priority: String(rule.priority), active: rule.active } : EMPTY);
    setErrors({});
    setOpen(true);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: RateRuleInput = { name: d.name, unitTypeId: d.unitTypeId || null, startDate: d.startDate || null, endDate: d.endDate || null, weekdays: d.weekdays, mode: d.mode, value: d.mode === "price" ? bahtToSatang(d.value || 0) : Number(d.value), priority: Number(d.priority || 10), active: d.active };
    const parsed = rateRuleSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setPending(true);
    try {
      const r = await saveRateRuleAction(slug, rule?.id ?? null, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {trigger ? (
        <span onClick={start} className="contents">
          {trigger}
        </span>
      ) : rule ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`แก้ไข ${rule.name}`} onClick={start}>
          <Pencil aria-hidden />
        </Button>
      ) : (
        <Button type="button" onClick={start} data-testid="rule-new">
          <Plus aria-hidden /> เพิ่มกฎราคา
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submit} className="grid gap-4" data-testid="rule-form">
            <DialogHeader>
              <DialogTitle>{rule ? "แก้ไขกฎราคา" : "เพิ่มกฎราคา"}</DialogTitle>
              <DialogDescription>กฎใช้ตามลำดับ (เลขน้อยก่อน): % ทบกัน, “กำหนดราคา” แทนที่ราคาที่คำนวณมาก่อนหน้า</DialogDescription>
            </DialogHeader>
            <Field label="ชื่อกฎ" htmlFor="r-name" error={errors.name}>
              <Input id="r-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="เช่น ไฮซีซัน, สุดสัปดาห์, ปีใหม่" maxLength={120} autoFocus />
            </Field>
            <Field label="ใช้กับ" htmlFor="r-type" error={errors.unitTypeId}>
              <NativeSelect id="r-type" value={d.unitTypeId} onChange={(e) => setD({ ...d, unitTypeId: e.target.value })}>
                <option value="">ทุกประเภทห้อง</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ตั้งแต่วันที่" htmlFor="r-from" error={errors.startDate} hint="เว้นว่าง = ทุกวันที่">
                <Input id="r-from" type="date" value={d.startDate} onChange={(e) => setD({ ...d, startDate: e.target.value })} />
              </Field>
              <Field label="ถึงวันที่" htmlFor="r-to" error={errors.endDate}>
                <Input id="r-to" type="date" value={d.endDate} min={d.startDate || undefined} onChange={(e) => setD({ ...d, endDate: e.target.value })} />
              </Field>
            </div>
            <Field label="วันในสัปดาห์" error={errors.weekdays} hint="ไม่เลือก = ทุกวัน">
              <div className="grid gap-2">
                <WeekdayPicker value={d.weekdays} onChange={(w) => setD({ ...d, weekdays: w })} />
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => setD({ ...d, weekdays: p.days })} className="min-h-8 rounded-full border border-dashed px-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="รูปแบบ" htmlFor="r-mode" error={errors.mode}>
                <NativeSelect id="r-mode" value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value as Draft["mode"], value: "" })}>
                  {Object.entries(RATE_MODE_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {d.mode === "percent" ? (
                <Field label="ปรับ (%)" htmlFor="r-value" error={errors.value} hint="+25 = แพงขึ้น 25%, -10 = ลด 10%">
                  <Input id="r-value" type="number" inputMode="numeric" min={-90} max={500} value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} placeholder="25" />
                </Field>
              ) : (
                <Field label="ราคาต่อคืน (บาท)" htmlFor="r-value" error={errors.value}>
                  <MoneyInput id="r-value" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} placeholder="18,000" />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="ลำดับการใช้" htmlFor="r-prio" error={errors.priority} hint="น้อยใช้ก่อน (ฤดูกาล 10, สุดสัปดาห์ 20, วันหยุดพิเศษ 30)">
                <Input id="r-prio" type="number" inputMode="numeric" min={0} max={999} value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value })} />
              </Field>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Switch checked={d.active} onCheckedChange={(c) => setD({ ...d, active: c })} aria-label="เปิดใช้" /> เปิดใช้กฎนี้
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending} data-testid="rule-save">
                {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RuleRowActions({ slug, rule, types }: { slug: string; rule: RuleVM; types: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <div className="flex items-center gap-1">
      <Switch
        checked={rule.active}
        disabled={pending}
        aria-label={`เปิดใช้ ${rule.name}`}
        onCheckedChange={async (c) => {
          setPending(true);
          try {
            const r = await toggleRateRuleAction(slug, rule.id, c);
            if (!r.ok) toast.error(r.error);
            else router.refresh();
          } finally {
            setPending(false);
          }
        }}
      />
      <RateRuleDialog slug={slug} rule={rule} types={types} />
      <ConfirmButton type="button" variant="ghost" size="icon-sm" aria-label={`ลบ ${rule.name}`} title={`ลบกฎ “${rule.name}”?`} description="ราคาของการจองที่มีอยู่แล้วไม่เปลี่ยน" confirmLabel="ลบ" action={async () => {
        const r = await deleteRateRuleAction(slug, rule.id);
        if (r.ok) router.refresh();
        return r;
      }}>
        <Trash2 aria-hidden />
      </ConfirmButton>
    </div>
  );
}
