"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { AMENITY_SUGGESTIONS } from "@rentweb/module-rental/admin/labels";
import { bahtToSatang, fieldErrors, satangToBaht, unitTypeSchema, type UnitTypeInput } from "@rentweb/module-rental/admin/schemas";
import { ChipsInput, GalleryField, MoneyInput } from "@rentweb/module-rental/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { deleteUnitTypeAction, saveUnitTypeAction, suggestUnitSlugAction, uploadRentalImageAction } from "./actions";

export interface UnitFormValues {
  name: string;
  slug: string;
  description: string;
  gallery: string[];
  baseGuests: string;
  maxGuests: string;
  beds: string;
  sizeSqm: string;
  amenities: string[];
  quantity: string;
  basePrice: string;
  extraGuestPrice: string;
  minNights: string;
  active: boolean;
  featured: boolean;
  sort: string;
}

export const EMPTY_UNIT: UnitFormValues = { name: "", slug: "", description: "", gallery: [], baseGuests: "2", maxGuests: "2", beds: "", sizeSqm: "", amenities: [], quantity: "1", basePrice: "", extraGuestPrice: "", minNights: "1", active: true, featured: false, sort: "0" };

export function unitToForm(t: { name: string; slug: string; description: string | null; gallery: string[]; baseGuests: number; maxGuests: number; beds: string | null; sizeSqm: number | null; amenities: string[]; quantity: number; basePrice: number; extraGuestPrice: number; minNights: number; active: boolean; featured: boolean; sort: number }): UnitFormValues {
  return { name: t.name, slug: t.slug, description: t.description ?? "", gallery: t.gallery, baseGuests: String(t.baseGuests), maxGuests: String(t.maxGuests), beds: t.beds ?? "", sizeSqm: t.sizeSqm ? String(t.sizeSqm) : "", amenities: t.amenities, quantity: String(t.quantity), basePrice: satangToBaht(t.basePrice), extraGuestPrice: satangToBaht(t.extraGuestPrice), minNights: String(t.minNights), active: t.active, featured: t.featured, sort: String(t.sort) };
}

function typingSlug(input: string, max = 80): string {
  return input
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .slice(0, max);
}
const finalizeSlug = (s: string) => typingSlug(s.trim()).replace(/-+$/, "");

export function UnitTypeForm({ slug, unitId, initial, assetBase, canDelete }: { slug: string; unitId: string | null; initial: UnitFormValues; assetBase: string; canDelete: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<UnitFormValues>(initial);
  const [slugTouched, setSlugTouched] = React.useState(!!unitId);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof UnitFormValues>(k: K, val: UnitFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];

  React.useEffect(() => {
    if (slugTouched || !v.name.trim()) return;
    const t = setTimeout(() => {
      suggestUnitSlugAction(slug, v.name, unitId).then((s) => setV((cur) => (slugTouched ? cur : { ...cur, slug: s }))).catch(() => setV((cur) => ({ ...cur, slug: finalizeSlug(v.name) })));
    }, 400);
    return () => clearTimeout(t);
  }, [v.name, slug, unitId, slugTouched]);

  function toInput(): UnitTypeInput {
    return {
      name: v.name,
      slug: finalizeSlug(v.slug),
      description: v.description || null,
      gallery: v.gallery,
      baseGuests: Number(v.baseGuests || 1),
      maxGuests: Number(v.maxGuests || 1),
      beds: v.beds || null,
      sizeSqm: v.sizeSqm ? Number(v.sizeSqm) : null,
      amenities: v.amenities,
      quantity: Number(v.quantity || 1),
      basePrice: bahtToSatang(v.basePrice || 0),
      extraGuestPrice: bahtToSatang(v.extraGuestPrice || 0),
      minNights: Number(v.minNights || 1),
      active: v.active,
      featured: v.featured,
      sort: Number(v.sort || 0),
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = toInput();
    const parsed = unitTypeSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await saveUnitTypeAction(slug, unitId, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      if (!unitId && r.data) router.push(`/t/${slug}/rental/units/${r.data.id}`);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  const upload = (fd: FormData) => uploadRentalImageAction(slug, fd);

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-testid="unit-form">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลห้องพัก</CardTitle>
            <CardDescription>ชื่อและรายละเอียดที่ลูกค้าเห็นบนหน้าร้าน</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field label="ชื่อประเภทห้อง" htmlFor="u-name" error={err("name")}>
              <Input id="u-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น ดีลักซ์วิวทะเล" required maxLength={160} autoFocus={!unitId} data-testid="unit-name" />
            </Field>
            <Field label="slug (ลิงก์)" htmlFor="u-slug" error={err("slug")} hint={`/rooms/${v.slug || "…"}`}>
              <Input
                id="u-slug"
                value={v.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", typingSlug(e.target.value));
                }}
                onBlur={() => set("slug", finalizeSlug(v.slug))}
                placeholder="deluxe-sea-view"
                maxLength={80}
              />
            </Field>
            <Field label="รายละเอียด" htmlFor="u-desc" error={err("description")}>
              <Textarea id="u-desc" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="บรรยากาศ วิว จุดเด่นของห้อง สิ่งที่รวมในราคา…" className="min-h-28" maxLength={5000} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="เตียง" htmlFor="u-beds" error={err("beds")}>
                <Input id="u-beds" value={v.beds} onChange={(e) => set("beds", e.target.value)} placeholder="เตียงคิงไซส์ 1 เตียง" maxLength={120} />
              </Field>
              <Field label="ขนาด (ตร.ม.)" htmlFor="u-size" error={err("sizeSqm")}>
                <Input id="u-size" type="number" inputMode="numeric" min={1} value={v.sizeSqm} onChange={(e) => set("sizeSqm", e.target.value)} />
              </Field>
              <Field label="จำนวนห้องประเภทนี้" htmlFor="u-qty" error={err("quantity")} hint="ห้องที่เหมือนกันและขายพร้อมกันได้">
                <Input id="u-qty" type="number" inputMode="numeric" min={1} max={500} value={v.quantity} onChange={(e) => set("quantity", e.target.value)} required data-testid="unit-quantity" />
              </Field>
            </div>
            <Field label="สิ่งอำนวยความสะดวก" htmlFor="u-amen" error={err("amenities")}>
              <ChipsInput id="u-amen" value={v.amenities} onChange={(a) => set("amenities", a)} suggestions={AMENITY_SUGGESTIONS} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รูปภาพ</CardTitle>
            <CardDescription>รูปแรกคือรูปหน้าปก แนะนำสัดส่วน 4:3 อย่างน้อย 1200px</CardDescription>
          </CardHeader>
          <CardContent>
            <GalleryField value={v.gallery} onChange={(g) => set("gallery", g)} upload={upload} assetBase={assetBase} />
            {err("gallery") && <p className="mt-2 text-xs text-destructive">{err("gallery")}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ราคาและผู้เข้าพัก</CardTitle>
            <CardDescription>ราคาฐานต่อคืน กฎราคาตามฤดูกาลปรับจากราคานี้</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field label="ราคาต่อคืน (บาท)" htmlFor="u-price" error={err("basePrice")}>
              <MoneyInput id="u-price" value={v.basePrice} onChange={(e) => set("basePrice", e.target.value)} placeholder="3,500" required invalid={!!err("basePrice")} data-testid="unit-price" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="ผู้เข้าพักที่รวมในราคา" htmlFor="u-base" error={err("baseGuests")}>
                <Input id="u-base" type="number" inputMode="numeric" min={1} max={50} value={v.baseGuests} onChange={(e) => set("baseGuests", e.target.value)} />
              </Field>
              <Field label="ผู้เข้าพักสูงสุด" htmlFor="u-max" error={err("maxGuests")}>
                <Input id="u-max" type="number" inputMode="numeric" min={1} max={50} value={v.maxGuests} onChange={(e) => set("maxGuests", e.target.value)} />
              </Field>
            </div>
            <Field label="ราคาผู้เข้าพักเพิ่ม (ต่อท่าน/คืน)" htmlFor="u-extra" error={err("extraGuestPrice")} hint="คิดเมื่อผู้เข้าพักมากกว่าจำนวนที่รวมในราคา">
              <MoneyInput id="u-extra" value={v.extraGuestPrice} onChange={(e) => set("extraGuestPrice", e.target.value)} placeholder="0" />
            </Field>
            <Field label="จำนวนคืนขั้นต่ำ" htmlFor="u-min" error={err("minNights")}>
              <Input id="u-min" type="number" inputMode="numeric" min={1} max={30} value={v.minNights} onChange={(e) => set("minNights", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>การแสดงผล</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-medium">เปิดขาย</span>
                <span className="block text-xs text-muted-foreground">ปิดเพื่อซ่อนจากหน้าร้านชั่วคราว</span>
              </span>
              <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} aria-label="เปิดขาย" />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-medium">ห้องแนะนำ</span>
                <span className="block text-xs text-muted-foreground">แสดงในส่วน “ห้องแนะนำ” ของหน้าแรก</span>
              </span>
              <Switch checked={v.featured} onCheckedChange={(c) => set("featured", c)} aria-label="ห้องแนะนำ" />
            </label>
            <Field label="ลำดับการแสดง" htmlFor="u-sort" error={err("sort")}>
              <Input id="u-sort" type="number" inputMode="numeric" min={0} value={v.sort} onChange={(e) => set("sort", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {unitId && canDelete ? (
            <ConfirmButton type="button" variant="ghost" className="text-destructive hover:text-destructive" title="ลบประเภทห้องพักนี้?" description="ลบได้เฉพาะประเภทที่ยังไม่มีการจอง มิฉะนั้นให้ปิดการขายแทน" confirmLabel="ลบ" action={async () => {
              const r = await deleteUnitTypeAction(slug, unitId);
              if (r.ok) router.push(`/t/${slug}/rental/units`);
              return r;
            }}>
              <Trash2 aria-hidden /> ลบ
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={pending} data-testid="unit-save">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {unitId ? "บันทึก" : "สร้างประเภทห้อง"}
          </Button>
        </div>
      </div>
    </form>
  );
}
