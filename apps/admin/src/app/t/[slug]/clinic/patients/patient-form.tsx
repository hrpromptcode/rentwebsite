"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { BLOOD_TYPES, GENDER_LABEL } from "@rentweb/module-booking/admin/labels";
import { fieldErrors, patientSchema } from "@rentweb/module-booking/admin/schemas";
import { NativeSelect } from "@rentweb/module-booking/admin/ui";
import { Field } from "@/components/ui/form";
import { updatePatientAction } from "../actions";
import { patientFormToInput, type PatientFormValues } from "../form-values";

type SetFn = <K extends keyof PatientFormValues>(k: K, val: PatientFormValues[K]) => void;

export function IdentityFields({ v, set, errors, autoFocus }: { v: PatientFormValues; set: SetFn; errors: Record<string, string>; autoFocus?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="ชื่อ" htmlFor="pt-first" error={errors.firstName}>
        <Input id="pt-first" value={v.firstName} onChange={(e) => set("firstName", e.target.value)} required maxLength={100} autoFocus={autoFocus} autoComplete="off" />
      </Field>
      <Field label="นามสกุล" htmlFor="pt-last" error={errors.lastName}>
        <Input id="pt-last" value={v.lastName} onChange={(e) => set("lastName", e.target.value)} maxLength={100} autoComplete="off" />
      </Field>
      <Field label="ชื่อเล่น" htmlFor="pt-nick" error={errors.nickname}>
        <Input id="pt-nick" value={v.nickname} onChange={(e) => set("nickname", e.target.value)} maxLength={60} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="เพศ" htmlFor="pt-gender" error={errors.gender}>
          <NativeSelect id="pt-gender" value={v.gender} onChange={(e) => set("gender", e.target.value as PatientFormValues["gender"])}>
            <option value="">ไม่ระบุ</option>
            {Object.entries(GENDER_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="วันเกิด" htmlFor="pt-birth" error={errors.birthDate}>
          <Input id="pt-birth" type="date" value={v.birthDate} onChange={(e) => set("birthDate", e.target.value)} max={new Date().toISOString().slice(0, 10)} className="min-w-0" />
        </Field>
      </div>
      <Field label="เบอร์โทร" htmlFor="pt-phone" error={errors.phone} hint="ใช้จับคู่กับบัญชีลูกค้าและการจองออนไลน์">
        <Input id="pt-phone" type="tel" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08x-xxx-xxxx" maxLength={20} autoComplete="off" />
      </Field>
      <Field label="อีเมล" htmlFor="pt-email" error={errors.email}>
        <Input id="pt-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} maxLength={160} autoComplete="off" />
      </Field>
    </div>
  );
}

export function MedicalFields({ v, set, errors, full }: { v: PatientFormValues; set: SetFn; errors: Record<string, string>; full?: boolean }) {
  return (
    <div className="grid gap-4">
      <Field label="ประวัติแพ้ยา / แพ้อาหาร" htmlFor="pt-allergies" error={errors.allergies} hint="แสดงเป็นแถบเตือนสีแดงทุกครั้งที่เปิดการตรวจ">
        <Textarea id="pt-allergies" value={v.allergies} onChange={(e) => set("allergies", e.target.value)} rows={2} maxLength={2000} placeholder="เช่น แพ้ยาเพนิซิลลิน, แพ้อาหารทะเล" />
      </Field>
      <Field label="โรคประจำตัว" htmlFor="pt-conditions" error={errors.chronicConditions}>
        <Textarea id="pt-conditions" value={v.chronicConditions} onChange={(e) => set("chronicConditions", e.target.value)} rows={2} maxLength={2000} placeholder="เช่น ความดันโลหิตสูง, เบาหวาน" />
      </Field>
      {full && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label="ยาที่ใช้ประจำ" htmlFor="pt-meds" error={errors.currentMedications}>
            <Textarea id="pt-meds" value={v.currentMedications} onChange={(e) => set("currentMedications", e.target.value)} rows={2} maxLength={2000} />
          </Field>
          <Field label="กรุ๊ปเลือด" htmlFor="pt-blood" error={errors.bloodType}>
            <NativeSelect id="pt-blood" value={v.bloodType} onChange={(e) => set("bloodType", e.target.value)}>
              <option value="">ไม่ทราบ</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      )}
    </div>
  );
}

export function PatientEditForm({ slug, patientId, initial }: { slug: string; patientId: string; initial: PatientFormValues }) {
  const router = useRouter();
  const [v, setV] = React.useState<PatientFormValues>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set: SetFn = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = patientFormToInput(v);
    const parsed = patientSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await updatePatientAction(slug, patientId, input);
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
    <form onSubmit={submit} className="space-y-6" data-testid="patient-form">
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลส่วนตัว</CardTitle>
          <CardDescription>ข้อมูลระบุตัวตนและช่องทางติดต่อ</CardDescription>
        </CardHeader>
        <CardContent>
          <IdentityFields v={v} set={set} errors={errors} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลทางการแพทย์</CardTitle>
          <CardDescription>แพ้ยา โรคประจำตัว และยาที่ใช้อยู่</CardDescription>
        </CardHeader>
        <CardContent>
          <MedicalFields v={v} set={set} errors={errors} full />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ผู้ติดต่อฉุกเฉิน และหมายเหตุ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ชื่อผู้ติดต่อ" htmlFor="pt-em-name" error={errors.emergencyName}>
              <Input id="pt-em-name" value={v.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} maxLength={120} />
            </Field>
            <Field label="เบอร์โทร" htmlFor="pt-em-phone" error={errors.emergencyPhone}>
              <Input id="pt-em-phone" type="tel" inputMode="tel" value={v.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} maxLength={20} />
            </Field>
            <Field label="ความสัมพันธ์" htmlFor="pt-em-rel" error={errors.emergencyRelation}>
              <Input id="pt-em-rel" value={v.emergencyRelation} onChange={(e) => set("emergencyRelation", e.target.value)} placeholder="เช่น มารดา, คู่สมรส" maxLength={60} />
            </Field>
          </div>
          <Field label="แท็ก" htmlFor="pt-tags" error={errors.tags} hint="คั่นด้วยจุลภาค เช่น VIP, ผิวแพ้ง่าย">
            <Input id="pt-tags" value={v.tags} onChange={(e) => set("tags", e.target.value)} maxLength={400} />
          </Field>
          <Field label="หมายเหตุภายใน" htmlFor="pt-notes" error={errors.notes} hint="เห็นเฉพาะทีมคลินิก">
            <Textarea id="pt-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={5000} />
          </Field>
        </CardContent>
      </Card>
      <div className={cn("flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-background/95 p-3", dirty && "sticky bottom-3 z-10 shadow-lg backdrop-blur")}>
        <p className="mr-auto text-xs text-muted-foreground">{dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "ข้อมูลเป็นปัจจุบัน"}</p>
        <Button type="button" variant="ghost" onClick={() => setV(initial)} disabled={!dirty || pending}>
          คืนค่า
        </Button>
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกประวัติ
        </Button>
      </div>
    </form>
  );
}
