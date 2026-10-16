"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button, type ButtonProps } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { toast } from "@rentweb/ui/components/sonner";
import { fieldErrors, patientSchema } from "@rentweb/module-booking/admin/schemas";
import { createPatientAction } from "../actions";
import { EMPTY_PATIENT, patientFormToInput, type PatientFormValues } from "../form-values";
import { IdentityFields, MedicalFields } from "./patient-form";

export function CreatePatientDialog({ slug, defaultOpen = false, label = "เพิ่มผู้ป่วย", variant = "default" }: { slug: string; defaultOpen?: boolean; label?: string; variant?: ButtonProps["variant"] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(defaultOpen);
  const [v, setV] = React.useState<PatientFormValues>({ ...EMPTY_PATIENT });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof PatientFormValues>(k: K, val: PatientFormValues[K]) => setV((s) => ({ ...s, [k]: val }));

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
      const r = await createPatientAction(slug, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "ลงทะเบียนแล้ว");
      setOpen(false);
      setV({ ...EMPTY_PATIENT });
      if (r.data) router.push(`/t/${slug}/clinic/patients/${r.data.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        <UserPlus aria-hidden /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>ลงทะเบียนผู้ป่วยใหม่</DialogTitle>
            <DialogDescription>ระบบออกเลข HN ให้อัตโนมัติ — กรอกเท่าที่ทราบ แก้ไขเพิ่มเติมได้ภายหลัง</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-5" id="create-patient-form">
            <IdentityFields v={v} set={set} errors={errors} autoFocus />
            <MedicalFields v={v} set={set} errors={errors} />
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="create-patient-form" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} สร้างประวัติผู้ป่วย
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
