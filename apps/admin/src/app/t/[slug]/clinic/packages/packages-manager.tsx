"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { bahtToSatang, clinicPackageSchema, fieldErrors, satangToBaht, type ClinicPackageInput } from "@rentweb/module-booking/admin/schemas";
import { ImageField, MoneyInput, NativeSelect } from "@rentweb/module-booking/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { uploadBookingImageAction } from "../../services/actions";
import { deletePackageAction, savePackageAction, setPackageActiveAction } from "../actions";
import { EMPTY_PACKAGE, type PackageFormValues } from "../form-values";

export interface PackageVM {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  serviceId: string | null;
  serviceName: string | null;
  sessions: number;
  price: number;
  compareAtPrice: number | null;
  validityDays: number;
  active: boolean;
  sort: number;
  sold: number;
  activeOwners: number;
}

function toForm(p: PackageVM): PackageFormValues {
  return {
    name: p.name,
    description: p.description ?? "",
    image: p.image,
    serviceId: p.serviceId ?? "",
    sessions: String(p.sessions),
    price: satangToBaht(p.price),
    compareAtPrice: p.compareAtPrice ? satangToBaht(p.compareAtPrice) : "",
    validityDays: String(p.validityDays),
    active: p.active,
    sort: String(p.sort),
  };
}

function validityLabel(days: number): string {
  if (days % 365 === 0) return `${days / 365} ปี`;
  if (days % 30 === 0) return `${days / 30} เดือน`;
  return `${days} วัน`;
}

export function PackagesManager({ slug, rows, services, canWrite, assetBase }: { slug: string; rows: PackageVM[]; services: Array<{ id: string; name: string }>; canWrite: boolean; assetBase: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<PackageVM | "new" | null>(null);
  const [toggling, setToggling] = React.useState<string | null>(null);
  const src = (u: string | null) => (u ? (u.startsWith("/") ? `${assetBase}${u}` : u) : null);

  async function toggle(p: PackageVM, active: boolean) {
    setToggling(p.id);
    try {
      const r = await setPackageActiveAction(slug, p.id, active);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
    } finally {
      setToggling(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} แพ็กเกจ · เปิดขาย {rows.filter((r) => r.active).length} · ผู้ป่วยกำลังใช้ {rows.reduce((s, r) => s + r.activeOwners, 0)} ราย
        </p>
        {canWrite && (
          <Button type="button" onClick={() => setEditing("new")} data-testid="new-package">
            <Plus aria-hidden /> เพิ่มแพ็กเกจ
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={PackageCheck} title="ยังไม่มีคอร์ส / แพ็กเกจ" description="สร้างคอร์สแบบหลายครั้ง เช่น เลเซอร์ 10 ครั้ง เพื่อขายให้ผู้ป่วยและตัดครั้งเมื่อมาใช้บริการ" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="packages-grid">
          {rows.map((p) => {
            const perSession = Math.round(p.price / Math.max(1, p.sessions));
            return (
              <article key={p.id} className={cn("card flex min-w-0 flex-col overflow-hidden p-0", !p.active && "opacity-75")} data-package={p.name}>
                <div className="relative aspect-[16/7] bg-gradient-to-br from-primary-soft to-muted">
                  {p.image ? <img src={src(p.image)!} alt="" className="size-full object-cover" loading="lazy" /> : <PackageCheck className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-primary/40" aria-hidden />}
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    {!p.active && <Badge variant="muted">ปิดขาย</Badge>}
                    {p.compareAtPrice && p.compareAtPrice > p.price && <Badge variant="accent">ลด {Math.round((1 - p.price / p.compareAtPrice) * 100)}%</Badge>}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-semibold leading-snug">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {p.serviceName ?? "ไม่ผูกบริการ"} · ใช้ได้ {validityLabel(p.validityDays)}
                    </p>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-heading text-xl font-semibold tabular-nums">{thb(p.price)}</p>
                      {p.compareAtPrice ? <p className="text-xs tabular-nums text-muted-foreground line-through">{thb(p.compareAtPrice)}</p> : null}
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium tabular-nums">{p.sessions} ครั้ง</p>
                      <p className="text-xs text-muted-foreground">≈ {thb(perSession)} / ครั้ง</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ขายแล้ว {p.sold} · กำลังใช้ {p.activeOwners} ราย
                  </p>
                  <div className="mt-auto flex items-center gap-2 border-t pt-3">
                    <label className="mr-auto flex items-center gap-2 text-sm">
                      {toggling === p.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      <Switch checked={p.active} disabled={!canWrite || toggling !== null} onCheckedChange={(c) => toggle(p, c)} aria-label={p.active ? `ปิดการขาย ${p.name}` : `เปิดขาย ${p.name}`} />
                      {p.active ? "เปิดขาย" : "ปิดขาย"}
                    </label>
                    {canWrite && (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(p)} aria-label={`แก้ไข ${p.name}`}>
                          <Pencil aria-hidden /> แก้ไข
                        </Button>
                        <ConfirmButton
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`ลบ ${p.name}`}
                          title={`ลบแพ็กเกจ “${p.name}”?`}
                          description={p.sold ? "มีผู้ป่วยซื้อแพ็กเกจนี้แล้ว ระบบจะไม่ให้ลบ — แนะนำให้ปิดการขายแทน" : "ลบถาวร กู้คืนไม่ได้"}
                          confirmLabel="ลบแพ็กเกจ"
                          action={async () => {
                            const r = await deletePackageAction(slug, p.id);
                            if (r.ok) router.refresh();
                            return r;
                          }}
                        >
                          <Trash2 aria-hidden />
                        </ConfirmButton>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {editing && (
        <PackageDialog
          slug={slug}
          pkg={editing === "new" ? null : editing}
          services={services}
          assetBase={assetBase}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function PackageDialog({ slug, pkg, services, assetBase, onClose, onSaved }: { slug: string; pkg: PackageVM | null; services: Array<{ id: string; name: string }>; assetBase: string; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = React.useState<PackageFormValues>(pkg ? toForm(pkg) : EMPTY_PACKAGE);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof PackageFormValues>(k: K, val: PackageFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const sessions = Number(v.sessions) || 0;
  const price = bahtToSatang(v.price || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: ClinicPackageInput = {
      name: v.name,
      description: v.description || null,
      image: v.image,
      serviceId: v.serviceId || null,
      sessions: v.sessions,
      price,
      compareAtPrice: v.compareAtPrice ? bahtToSatang(v.compareAtPrice) : null,
      validityDays: v.validityDays,
      active: v.active,
      sort: v.sort || 0,
    };
    const parsed = clinicPackageSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await savePackageAction(slug, pkg?.id ?? null, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      onSaved();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pkg ? "แก้ไขแพ็กเกจ" : "เพิ่มแพ็กเกจ"}</DialogTitle>
          <DialogDescription>คอร์สที่ขายเป็นจำนวนครั้ง — ผู้ป่วยจะเห็นในหน้าร้านและใช้ได้ภายในอายุที่กำหนด</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} id="package-form" className="grid gap-4">
          <Field label="ชื่อแพ็กเกจ" htmlFor="pk-name" error={errors.name}>
            <Input id="pk-name" value={v.name} onChange={(e) => set("name", e.target.value)} required maxLength={160} placeholder="เช่น เลเซอร์หน้าใส 10 ครั้ง" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="บริการที่ใช้" htmlFor="pk-service" error={errors.serviceId} hint="ใช้ตัดครั้งเมื่อจองบริการนี้">
              <NativeSelect id="pk-service" value={v.serviceId} onChange={(e) => set("serviceId", e.target.value)}>
                <option value="">ไม่ผูกบริการ</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="จำนวนครั้ง" htmlFor="pk-sessions" error={errors.sessions}>
                <Input id="pk-sessions" value={v.sessions} onChange={(e) => set("sessions", e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="text-right tabular-nums" />
              </Field>
              <Field label="อายุ (วัน)" htmlFor="pk-validity" error={errors.validityDays}>
                <Input id="pk-validity" value={v.validityDays} onChange={(e) => set("validityDays", e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="text-right tabular-nums" />
              </Field>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ราคาขาย (บาท)" htmlFor="pk-price" error={errors.price} hint={sessions > 0 && price > 0 ? `เฉลี่ย ${thb(Math.round(price / sessions))} / ครั้ง` : undefined}>
              <MoneyInput id="pk-price" value={v.price} onChange={(e) => set("price", e.target.value)} placeholder="0" invalid={!!errors.price} />
            </Field>
            <Field label="ราคาเต็ม (บาท)" htmlFor="pk-compare" error={errors.compareAtPrice} hint="ไม่บังคับ — แสดงเป็นราคาขีดฆ่า">
              <MoneyInput id="pk-compare" value={v.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} placeholder="—" invalid={!!errors.compareAtPrice} />
            </Field>
          </div>
          <Field label="รายละเอียด" htmlFor="pk-desc" error={errors.description}>
            <Textarea id="pk-desc" value={v.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={3000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-2">
              <span className="text-sm font-medium">รูปปก</span>
              <ImageField value={v.image} onChange={(u) => set("image", u)} upload={(fd) => uploadBookingImageAction(slug, fd)} folder="clinic" assetBase={assetBase} label="รูปแพ็กเกจ" />
            </div>
            <div className="grid content-start gap-4 sm:w-40">
              <Field label="ลำดับ" htmlFor="pk-sort" error={errors.sort}>
                <Input id="pk-sort" value={v.sort} onChange={(e) => set("sort", e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="text-right tabular-nums" />
              </Field>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} aria-label="เปิดขาย" /> เปิดขาย
              </label>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form="package-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} {pkg ? "บันทึกแพ็กเกจ" : "สร้างแพ็กเกจ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
