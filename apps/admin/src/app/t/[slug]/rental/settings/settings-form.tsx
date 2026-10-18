"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { fieldErrors, rentalSettingsSchema, type RentalSettingsInput } from "@rentweb/module-rental/admin/schemas";
import { Field } from "@/components/ui/form";
import { saveRentalSettingsAction } from "./actions";

export interface SettingsValues {
  checkInTime: string;
  checkOutTime: string;
  freeCancelDays: string;
  depositPercent: string;
  allowFullPayment: boolean;
  allowPayAtProperty: boolean;
  maxAdvanceDays: string;
  maxNights: string;
  holdMinutes: string;
}

export function RentalSettingsForm({ slug, initial, canWrite, cashEnabled }: { slug: string; initial: SettingsValues; canWrite: boolean; /** tenant payments.enabled.cash – pay-at-property needs it */ cashEnabled: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<SettingsValues>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof SettingsValues>(k: K, val: SettingsValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];
  const pct = Number(v.depositPercent || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: RentalSettingsInput = { checkInTime: v.checkInTime, checkOutTime: v.checkOutTime, freeCancelDays: Number(v.freeCancelDays), depositPercent: Number(v.depositPercent), allowFullPayment: v.allowFullPayment, allowPayAtProperty: v.allowPayAtProperty, maxAdvanceDays: Number(v.maxAdvanceDays), maxNights: Number(v.maxNights), holdMinutes: Number(v.holdMinutes) };
    const parsed = rentalSettingsSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await saveRentalSettingsAction(slug, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
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
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2" data-testid="rental-settings">
      <Card>
        <CardHeader>
          <CardTitle>เวลาเช็กอิน / เช็กเอาต์</CardTitle>
          <CardDescription>แสดงบนหน้าห้องพัก หน้าจอง และข้อความยืนยัน</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label="เช็กอินตั้งแต่" htmlFor="s-in" error={err("checkInTime")}>
            <Input id="s-in" type="time" value={v.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="เช็กเอาต์ก่อน" htmlFor="s-out" error={err("checkOutTime")}>
            <Input id="s-out" type="time" value={v.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} disabled={!canWrite} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>นโยบายการยกเลิก</CardTitle>
          <CardDescription>ยกเลิกฟรีจนถึง N วันก่อนเช็กอิน หลังจากนั้นที่พักเก็บมัดจำ ลูกค้าเห็นนโยบายนี้ก่อนยืนยันการจอง</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="ยกเลิกฟรีจนถึง (วันก่อนเช็กอิน)" htmlFor="s-cancel" error={err("freeCancelDays")} hint={Number(v.freeCancelDays) === 0 ? "0 = ยกเลิกฟรีได้จนถึงวันเช็กอิน" : `ลูกค้าเห็น: “ยกเลิกฟรีจนถึง ${v.freeCancelDays} วันก่อนวันเช็กอิน”`}>
            <Input id="s-cancel" type="number" inputMode="numeric" min={0} max={365} value={v.freeCancelDays} onChange={(e) => set("freeCancelDays", e.target.value)} disabled={!canWrite} data-testid="free-cancel-days" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>มัดจำและการชำระเงิน</CardTitle>
          <CardDescription>เงินที่ต้องชำระออนไลน์เพื่อยืนยันการจอง ส่วนที่เหลือชำระที่ที่พัก</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="มัดจำ (% ของยอดรวม)" htmlFor="s-deposit" error={err("depositPercent")} hint={pct === 0 ? "0 = ไม่เก็บเงินออนไลน์ การจองยืนยันทันที" : pct >= 100 ? "100 = ต้องชำระเต็มจำนวนเพื่อยืนยัน" : `ลูกค้าชำระ ${pct}% ตอนจอง`}>
            <Input id="s-deposit" type="number" inputMode="numeric" min={0} max={100} value={v.depositPercent} onChange={(e) => set("depositPercent", e.target.value)} disabled={!canWrite} data-testid="deposit-percent" />
          </Field>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="block font-medium">ให้เลือกชำระเต็มจำนวนออนไลน์ได้</span>
              <span className="block text-xs text-muted-foreground">นอกจากมัดจำ ลูกค้าเลือกจ่ายครบตอนจองได้</span>
            </span>
            <Switch checked={v.allowFullPayment} onCheckedChange={(c) => set("allowFullPayment", c)} disabled={!canWrite || pct <= 0 || pct >= 100} aria-label="ให้เลือกชำระเต็มจำนวน" />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="block font-medium">รับจองแบบชำระที่ที่พัก</span>
              <span className="block text-xs text-muted-foreground">{cashEnabled ? "ลูกค้าเลือก “ชำระที่ที่พัก” ได้ การจองยืนยันทันทีโดยไม่มีมัดจำ" : "ต้องเปิดช่องทาง “เงินสด” ในตั้งค่า › รับเงิน ก่อน"}</span>
            </span>
            <Switch checked={v.allowPayAtProperty} onCheckedChange={(c) => set("allowPayAtProperty", c)} disabled={!canWrite} aria-label="รับจองแบบชำระที่ที่พัก" />
          </label>
          <Field label="ถือห้องรอชำระ (นาที)" htmlFor="s-hold" error={err("holdMinutes")} hint="ถ้าไม่ชำระภายในเวลานี้ ระบบยกเลิกการจองและคืนห้องให้คนอื่น">
            <Input id="s-hold" type="number" inputMode="numeric" min={5} max={1440} value={v.holdMinutes} onChange={(e) => set("holdMinutes", e.target.value)} disabled={!canWrite} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ข้อจำกัดการจองออนไลน์</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label="จองล่วงหน้าสูงสุด (วัน)" htmlFor="s-adv" error={err("maxAdvanceDays")}>
            <Input id="s-adv" type="number" inputMode="numeric" min={7} max={730} value={v.maxAdvanceDays} onChange={(e) => set("maxAdvanceDays", e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="จำนวนคืนสูงสุดต่อการจอง" htmlFor="s-nights" error={err("maxNights")}>
            <Input id="s-nights" type="number" inputMode="numeric" min={1} max={90} value={v.maxNights} onChange={(e) => set("maxNights", e.target.value)} disabled={!canWrite} />
          </Field>
        </CardContent>
      </Card>

      {canWrite && (
        <div className="flex justify-end lg:col-span-2">
          <Button type="submit" disabled={pending} data-testid="settings-save">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกนโยบาย
          </Button>
        </div>
      )}
    </form>
  );
}
