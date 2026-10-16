"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { PROVIDER_LABEL } from "@rentweb/module-topup/admin/labels";
import { fieldErrors, supplierSchema } from "@rentweb/module-topup/admin/schemas";
import { NativeSelect } from "@rentweb/module-topup/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { deleteSupplierAction, saveSupplierAction } from "./actions";

export interface SupplierVM {
  id: string;
  name: string;
  provider: "generic_http" | "manual";
  config: string;
  active: boolean;
}

const EMPTY: SupplierVM = { id: "", name: "", provider: "generic_http", config: '{\n  "baseUrl": "https://api.example.com",\n  "timeoutMs": 15000\n}', active: true };

export function SupplierDialogButton({ slug, supplier }: { slug: string; supplier?: SupplierVM }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<SupplierVM>(supplier ?? EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof SupplierVM>(k: K, val: SupplierVM[K]) => setV((s) => ({ ...s, [k]: val }));
  const editing = !!supplier;

  function openDialog() {
    setV(supplier ?? EMPTY);
    setErrors({});
    setOpen(true);
  }

  async function submit() {
    const input = { id: v.id || null, name: v.name, provider: v.provider, config: v.config, active: v.active };
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await saveSupplierAction(slug, input);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="icon-sm" onClick={openDialog} aria-label={`แก้ไข ${supplier.name}`}>
          <Pencil aria-hidden />
        </Button>
      ) : (
        <Button onClick={openDialog}>
          <Plus aria-hidden /> เพิ่ม supplier
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข ${supplier.name}` : "เพิ่ม supplier"}</DialogTitle>
            <DialogDescription>ผู้ให้บริการเติมเกมที่ระบบส่งคำสั่งไปให้ (แพ็กเกจแบบอัตโนมัติ)</DialogDescription>
          </DialogHeader>
          <form
            id="supplier-form"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="ชื่อ" htmlFor="sup-name" error={errors.name}>
              <Input id="sup-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น GameKey API" aria-invalid={!!errors.name} autoFocus />
            </Field>
            <Field label="ชนิดการเชื่อมต่อ" htmlFor="sup-provider" error={errors.provider}>
              <NativeSelect id="sup-provider" value={v.provider} onChange={(e) => set("provider", e.target.value as SupplierVM["provider"])}>
                {Object.entries(PROVIDER_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="config (JSON)" htmlFor="sup-config" error={errors.config} hint="ค่าที่ไม่ใช่ความลับ เช่น baseUrl, timeoutMs — ห้ามใส่ API key / รหัสผ่าน">
              <Textarea id="sup-config" value={v.config} onChange={(e) => set("config", e.target.value)} className="min-h-36 font-mono text-sm" spellCheck={false} aria-invalid={!!errors.config} />
            </Field>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} aria-label="เปิดใช้งาน supplier" />
              เปิดใช้งาน
            </label>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="supplier-form" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteSupplierButton({ slug, id, name, packageCount }: { slug: string; id: string; name: string; packageCount: number }) {
  return (
    <ConfirmButton
      variant="ghost"
      size="icon-sm"
      className="text-destructive hover:text-destructive"
      title={`ลบ supplier “${name}”?`}
      description={packageCount > 0 ? `ยังมี ${packageCount} แพ็กเกจที่ใช้ supplier นี้ — ระบบจะไม่ยอมให้ลบจนกว่าจะเปลี่ยน supplier ของแพ็กเกจ` : "ลบถาวร ย้อนกลับไม่ได้"}
      confirmLabel="ลบ"
      action={() => deleteSupplierAction(slug, id)}
      aria-label={`ลบ ${name}`}
    >
      <Trash2 aria-hidden />
    </ConfirmButton>
  );
}
