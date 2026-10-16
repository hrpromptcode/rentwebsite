"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { bahtToSatang, fieldErrors, serviceSchema, type ServiceInput } from "@rentweb/module-booking/admin/schemas";
import { ImageField, MoneyInput, NativeSelect } from "@rentweb/module-booking/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { deleteServiceAction, saveServiceAction, suggestServiceSlugAction, uploadBookingImageAction } from "./actions";
import type { ServiceFormValues } from "./form-values";

/**
 * Slug while typing: same contract as typingSlug() in @/lib/slug (lower-case, invalid → "-", no doubled / leading
 * "-", a trailing "-" is KEPT so "hair-cut" can be typed) but Thai / Unicode letters stay allowed, as in the
 * service slug schema. finalizeSlug() trims the trailing "-" on blur / submit / when derived from the name.
 */
function typingSlug(input: string, max = 80): string {
  return input
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .slice(0, max);
}

function finalizeSlug(input: string, max = 80): string {
  return typingSlug(input.trim(), max).replace(/-+$/, "");
}

const autoSlug = (name: string) => finalizeSlug(name);

export function ServiceForm({ slug, serviceId, initial, categories, assetBase, canDelete }: { slug: string; serviceId: string | null; initial: ServiceFormValues; categories: Array<{ id: string; name: string }>; assetBase: string; canDelete: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<ServiceFormValues>(initial);
  const [slugTouched, setSlugTouched] = React.useState(!!serviceId);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof ServiceFormValues>(k: K, val: ServiceFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];

  React.useEffect(() => {
    if (slugTouched || !v.name.trim()) return;
    const t = setTimeout(() => {
      suggestServiceSlugAction(slug, v.name, serviceId).then((s) => setV((cur) => (slugTouched ? cur : { ...cur, slug: s }))).catch(() => setV((cur) => ({ ...cur, slug: autoSlug(v.name) })));
    }, 400);
    return () => clearTimeout(t);
  }, [v.name, slug, serviceId, slugTouched]);

  function toInput(): ServiceInput {
    return {
      categoryId: v.categoryId || null,
      name: v.name,
      slug: finalizeSlug(v.slug, 80),
      description: v.description || null,
      image: v.image,
      durationMin: Number(v.durationMin),
      bufferBeforeMin: Number(v.bufferBeforeMin || 0),
      bufferAfterMin: Number(v.bufferAfterMin || 0),
      price: bahtToSatang(v.price || 0),
      priceNote: v.priceNote || null,
      depositRequired: v.depositRequired,
      depositAmount: v.depositRequired ? bahtToSatang(v.depositAmount || 0) : 0,
      capacity: Number(v.capacity || 1),
      requiresStaff: v.requiresStaff,
      seatsPerBooking: Number(v.capacity || 1) > 1 && v.seatsPerBooking ? Number(v.seatsPerBooking) : null,
      active: v.active,
      featured: v.featured,
      sort: Number(v.sort || 0),
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = toInput();
    const parsed = serviceSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await saveServiceAction(slug, serviceId, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      if (!serviceId && r.data) router.push(`/t/${slug}/services/${r.data.id}`);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  const upload = (fd: FormData) => uploadBookingImageAction(slug, fd);

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลบริการ</CardTitle>
            <CardDescription>ชื่อและรายละเอียดที่ลูกค้าเห็นบนหน้าร้าน</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field label="ชื่อบริการ" htmlFor="svc-name" error={err("name")}>
              <Input id="svc-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น ตัดผม + สระ" required maxLength={160} autoFocus={!serviceId} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="slug (ลิงก์)" htmlFor="svc-slug" error={err("slug")} hint={`/services/${v.slug || "…"}`}>
                <Input
                  id="svc-slug"
                  value={v.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    // keep a trailing "-" while typing ("hair-" → "hair-cut"); trimmed on blur / submit
                    set("slug", typingSlug(e.target.value, 80));
                  }}
                  onBlur={() => set("slug", finalizeSlug(v.slug, 80))}
                  placeholder="hair-cut"
                  maxLength={80}
                />
              </Field>
              <Field label="หมวดหมู่" htmlFor="svc-cat" error={err("categoryId")}>
                <NativeSelect id="svc-cat" value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                  <option value="">ไม่ระบุหมวดหมู่</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label="รายละเอียด" htmlFor="svc-desc" error={err("description")}>
              <Textarea id="svc-desc" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="อธิบายขั้นตอน สิ่งที่รวมอยู่ในบริการ ข้อควรเตรียมตัว…" className="min-h-28" maxLength={5000} />
            </Field>
            <Field label="รูปภาพ" error={err("image")}>
              <ImageField value={v.image} onChange={(url) => set("image", url)} upload={upload} folder="services" assetBase={assetBase} label="รูปบริการ" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>เวลาและราคา</CardTitle>
            <CardDescription>ระยะเวลาใช้คำนวณช่องเวลาว่าง เวลาเตรียม/พักจะถูกกันไว้รอบ ๆ คิว</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="ระยะเวลา (นาที)" htmlFor="svc-dur" error={err("durationMin")}>
                <Input id="svc-dur" type="number" inputMode="numeric" min={5} max={1440} step={5} value={v.durationMin} onChange={(e) => set("durationMin", e.target.value)} required />
              </Field>
              <Field label="เตรียมก่อน (นาที)" htmlFor="svc-bb" error={err("bufferBeforeMin")}>
                <Input id="svc-bb" type="number" inputMode="numeric" min={0} max={240} step={5} value={v.bufferBeforeMin} onChange={(e) => set("bufferBeforeMin", e.target.value)} />
              </Field>
              <Field label="พักหลัง (นาที)" htmlFor="svc-ba" error={err("bufferAfterMin")}>
                <Input id="svc-ba" type="number" inputMode="numeric" min={0} max={240} step={5} value={v.bufferAfterMin} onChange={(e) => set("bufferAfterMin", e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="ราคา (บาท)" htmlFor="svc-price" error={err("price")}>
                <MoneyInput id="svc-price" value={v.price} onChange={(e) => set("price", e.target.value)} placeholder="0" invalid={!!err("price")} />
              </Field>
              <Field label="หมายเหตุราคา" htmlFor="svc-pnote" error={err("priceNote")} hint="เช่น “เริ่มต้น”, “ขึ้นกับความยาวผม”">
                <Input id="svc-pnote" value={v.priceNote} onChange={(e) => set("priceNote", e.target.value)} maxLength={60} />
              </Field>
            </div>
            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">ต้องชำระมัดจำเพื่อยืนยันคิว</p>
                  <p className="text-xs text-muted-foreground">ลูกค้าออนไลน์ต้องชำระมัดจำก่อน คิวถึงจะยืนยัน (Walk-in ไม่ต้อง)</p>
                </div>
                <Switch checked={v.depositRequired} onCheckedChange={(c) => set("depositRequired", c)} aria-label="ต้องชำระมัดจำ" />
              </div>
              {v.depositRequired && (
                <Field label="ยอดมัดจำ (บาท)" htmlFor="svc-dep" error={err("depositAmount")} className="mt-4 max-w-xs">
                  <MoneyInput id="svc-dep" value={v.depositAmount} onChange={(e) => set("depositAmount", e.target.value)} placeholder="0" invalid={!!err("depositAmount")} />
                </Field>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>การแสดงผล</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">เปิดใช้งาน</span>
                <span className="block text-xs text-muted-foreground">แสดงบนหน้าร้านและจองได้</span>
              </span>
              <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">บริการแนะนำ</span>
                <span className="block text-xs text-muted-foreground">ปักหมุดในส่วน “บริการแนะนำ” ของหน้าแรก</span>
              </span>
              <Switch checked={v.featured} onCheckedChange={(c) => set("featured", c)} />
            </label>
            <Field label="ลำดับการแสดง" htmlFor="svc-sort" error={err("sort")} hint="น้อยไปมาก">
              <Input id="svc-sort" type="number" inputMode="numeric" min={0} max={9999} value={v.sort} onChange={(e) => set("sort", e.target.value)} className="max-w-32" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รูปแบบการจอง</CardTitle>
            <CardDescription>ค่าเริ่มต้นเหมาะกับบริการ 1 ต่อ 1 (ช่าง/หมอ 1 คนต่อลูกค้า 1 คิว)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">ต้องเลือกผู้ให้บริการ</span>
                <span className="block text-xs text-muted-foreground">ปิดเมื่อเป็นคลาส/ห้องที่ไม่ผูกกับพนักงาน</span>
              </span>
              <Switch checked={v.requiresStaff} onCheckedChange={(c) => set("requiresStaff", c)} />
            </label>
            <Field
              label="จำนวนที่รับต่อรอบ"
              htmlFor="svc-cap"
              error={err("capacity")}
              hint={v.requiresStaff ? "จำนวนลูกค้าที่รับพร้อมกันได้ — ลูกค้าแต่ละท่านใช้ผู้ให้บริการ 1 คน (เช่น นวดคู่ = 2)" : "มากกว่า 1 = คลาส / ห้อง ที่หลายคนจองช่องเวลาเดียวกันได้"}
            >
              <Input id="svc-cap" type="number" inputMode="numeric" min={1} max={500} value={v.capacity} onChange={(e) => set("capacity", e.target.value)} className="max-w-32" />
            </Field>
            {Number(v.capacity || 1) > 1 && (
              <Field
                label="การจอง 1 ครั้ง"
                htmlFor="svc-seats"
                error={err("seatsPerBooking")}
                hint={v.seatsPerBooking ? `แพ็กเกจสำหรับ ${v.seatsPerBooking} ท่าน — ราคาคิดต่อการจอง` : "ลูกค้าเลือกจำนวนท่านเอง — ราคาและมัดจำคิดต่อท่าน"}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect id="svc-seats" value={v.seatsPerBooking ? "fixed" : "per_person"} onChange={(e) => set("seatsPerBooking", e.target.value === "fixed" ? v.capacity : "")} className="max-w-64">
                    <option value="per_person">คิดราคาต่อท่าน</option>
                    <option value="fixed">แพ็กเกจจำนวนท่านคงที่</option>
                  </NativeSelect>
                  {v.seatsPerBooking && (
                    <Input aria-label="จำนวนท่านต่อการจอง" type="number" inputMode="numeric" min={1} max={Number(v.capacity || 1)} value={v.seatsPerBooking} onChange={(e) => set("seatsPerBooking", e.target.value)} className="max-w-24" />
                  )}
                </div>
              </Field>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {serviceId && canDelete ? (
            <ConfirmButton variant="ghost" className="text-destructive hover:text-destructive" title="ลบบริการนี้?" description="ลบได้เฉพาะบริการที่ยังไม่เคยมีการจอง หากมีประวัติแล้วให้ปิดการใช้งานแทน" confirmLabel="ลบบริการ" action={async () => {
              const r = await deleteServiceAction(slug, serviceId);
              if (r.ok) router.push(`/t/${slug}/services`);
              return r;
            }}>
              <Trash2 aria-hidden /> ลบ
            </ConfirmButton>
          ) : (
            <Button asChild variant="ghost">
              <Link href={`/t/${slug}/services`}>ยกเลิก</Link>
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {serviceId ? "บันทึก" : "สร้างบริการ"}
          </Button>
        </div>
      </div>
    </form>
  );
}
