"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Flame, ImageOff, Loader2, Save, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Checkbox } from "@rentweb/ui/components/checkbox";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import type { CategoryRow, ItemRow, ModifierGroupRow } from "@rentweb/module-restaurant/admin";
import { ALLERGEN_SUGGESTIONS, STATION_LABEL, STATIONS, TAG_LABEL, TAG_SUGGESTIONS } from "@rentweb/module-restaurant/admin/labels";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { deleteItemAction, saveItemAction, uploadItemImageAction } from "../../actions";

interface FormState {
  categoryId: string;
  name: string;
  nameEn: string;
  description: string;
  image: string;
  price: string;
  compareAtPrice: string;
  tags: string[];
  allergens: string[];
  spicyLevel: number;
  prepMinutes: string;
  station: string;
  available: boolean;
  soldOut: boolean;
  featured: boolean;
  sort: string;
  modifierGroupIds: string[];
}

function fromItem(item: ItemRow | null, defaultCategoryId: string): FormState {
  return {
    categoryId: item?.categoryId ?? defaultCategoryId,
    name: item?.name ?? "",
    nameEn: item?.nameEn ?? "",
    description: item?.description ?? "",
    image: item?.image ?? "",
    price: item ? String(item.price / 100) : "",
    compareAtPrice: item?.compareAtPrice ? String(item.compareAtPrice / 100) : "",
    tags: item?.tags ?? [],
    allergens: item?.allergens ?? [],
    spicyLevel: item?.spicyLevel ?? 0,
    prepMinutes: item?.prepMinutes ? String(item.prepMinutes) : "",
    station: item?.station ?? "kitchen",
    available: item?.available ?? true,
    soldOut: item?.soldOut ?? false,
    featured: item?.featured ?? false,
    sort: item ? String(item.sort) : "",
    modifierGroupIds: item?.modifierGroupIds ?? [],
  };
}

const num = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export function ItemForm({ slug, item, categories, groups, defaultCategoryId, canEdit, backHref }: { slug: string; item: ItemRow | null; categories: CategoryRow[]; groups: ModifierGroupRow[]; defaultCategoryId: string; canEdit: boolean; backHref: string }) {
  const router = useRouter();
  const [f, setF] = React.useState<FormState>(() => fromItem(item, defaultCategoryId));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [tagInput, setTagInput] = React.useState("");
  const [allergenInput, setAllergenInput] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const price = num(f.price);
  const compareAt = num(f.compareAtPrice);

  function clientValidate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "กรุณากรอกชื่อเมนู";
    if (!f.categoryId) e.categoryId = "กรุณาเลือกหมวด";
    if (price === null || Number.isNaN(price) || price < 0) e.price = "กรุณากรอกราคาเป็นตัวเลข";
    if (compareAt !== null && (Number.isNaN(compareAt) || compareAt < 0)) e.compareAtPrice = "ราคาไม่ถูกต้อง";
    else if (compareAt !== null && price !== null && compareAt <= price) e.compareAtPrice = "ต้องมากกว่าราคาขาย";
    const prep = num(f.prepMinutes);
    if (prep !== null && (Number.isNaN(prep) || prep < 0 || prep > 240)) e.prepMinutes = "0–240 นาที";
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ce = clientValidate();
    setErrors(ce);
    if (Object.keys(ce).length) {
      toast.error("กรุณาตรวจสอบข้อมูลที่กรอก");
      return;
    }
    setPending(true);
    try {
      const r = await saveItemAction(slug, {
        id: item?.id ?? null,
        categoryId: f.categoryId,
        name: f.name,
        nameEn: f.nameEn || null,
        description: f.description || null,
        image: f.image || null,
        price: price!,
        compareAtPrice: compareAt,
        tags: f.tags,
        allergens: f.allergens,
        spicyLevel: f.spicyLevel,
        prepMinutes: num(f.prepMinutes),
        station: f.station as (typeof STATIONS)[number],
        available: f.available,
        soldOut: f.soldOut,
        featured: f.featured,
        ...(f.sort.trim() ? { sort: Number(f.sort) } : {}),
        modifierGroupIds: f.modifierGroupIds,
      });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      if (!item) router.push(`/t/${slug}/restaurant/menu/items/${(r.data as { id: string }).id}`);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadItemImageAction(slug, fd);
      if (!r.ok) toast.error(r.error);
      else {
        set("image", r.url ?? "");
        toast.success("อัปโหลดรูปแล้ว กดบันทึกเพื่อยืนยัน");
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const addChip = (list: "tags" | "allergens", raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!v) return;
    if (!f[list].includes(v)) set(list, [...f[list], v]);
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" noValidate>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลหลัก</CardTitle>
            <CardDescription>ชื่อและราคาที่ลูกค้าเห็นบนหน้าเมนู ราคาเป็นบาท (รวมภาษี)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อเมนู (ไทย)" htmlFor="name" error={errors.name} className="sm:col-span-2">
              <Input id="name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น ผัดกะเพราเนื้อโคขุน" maxLength={120} disabled={!canEdit} aria-invalid={!!errors.name} autoFocus={!item} />
            </Field>
            <Field label="ชื่ออังกฤษ" htmlFor="nameEn" error={errors.nameEn}>
              <Input id="nameEn" value={f.nameEn} onChange={(e) => set("nameEn", e.target.value)} placeholder="Stir-fried basil beef" maxLength={120} disabled={!canEdit} />
            </Field>
            <Field label="หมวด" htmlFor="categoryId" error={errors.categoryId}>
              <select id="categoryId" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} disabled={!canEdit} className="h-11 w-full rounded-xl border bg-background px-3 text-sm" aria-invalid={!!errors.categoryId}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ราคาขาย (บาท)" htmlFor="price" error={errors.price} hint={price !== null && !Number.isNaN(price) ? `= ${thb(Math.round(price * 100))}` : undefined}>
              <Input id="price" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0" disabled={!canEdit} aria-invalid={!!errors.price} />
            </Field>
            <Field label="ราคาก่อนลด (ไม่บังคับ)" htmlFor="compareAtPrice" error={errors.compareAtPrice} hint="แสดงขีดฆ่าเพื่อโชว์ส่วนลด">
              <Input id="compareAtPrice" inputMode="decimal" value={f.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} placeholder="—" disabled={!canEdit} aria-invalid={!!errors.compareAtPrice} />
            </Field>
            <Field label="คำอธิบาย" htmlFor="description" error={errors.description} className="sm:col-span-2">
              <Textarea id="description" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="วัตถุดิบเด่น รสชาติ หรือวิธีเสิร์ฟ" className="min-h-20" maxLength={1000} disabled={!canEdit} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดครัว</CardTitle>
            <CardDescription>สถานีกำหนดว่าตั๋วจะขึ้นจอครัวไหน</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="สถานี" htmlFor="station">
              <select id="station" value={f.station} onChange={(e) => set("station", e.target.value)} disabled={!canEdit} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                {STATIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATION_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="เวลาเตรียม (นาที)" htmlFor="prepMinutes" error={errors.prepMinutes}>
              <Input id="prepMinutes" inputMode="numeric" value={f.prepMinutes} onChange={(e) => set("prepMinutes", e.target.value)} placeholder="15" disabled={!canEdit} />
            </Field>
            <Field label="ลำดับในหมวด" htmlFor="sort" hint="เลขน้อยขึ้นก่อน">
              <Input id="sort" inputMode="numeric" value={f.sort} onChange={(e) => set("sort", e.target.value)} placeholder="อัตโนมัติ" disabled={!canEdit} />
            </Field>
            <div className="grid gap-2 sm:col-span-3">
              <Label>ระดับความเผ็ด</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="ระดับความเผ็ด">
                {[0, 1, 2, 3, 4, 5].map((lv) => (
                  <button key={lv} type="button" role="radio" aria-checked={f.spicyLevel === lv} disabled={!canEdit} onClick={() => set("spicyLevel", lv)} className={cn("inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-xl border px-3 text-sm font-medium transition-colors", f.spicyLevel === lv ? "border-red-500 bg-red-500/10 text-red-700" : "hover:bg-muted")}>
                    {lv === 0 ? (
                      "ไม่เผ็ด"
                    ) : (
                      <>
                        {Array.from({ length: lv }).map((_, i) => (
                          <Flame key={i} className="size-3.5" aria-hidden />
                        ))}
                        <span className="sr-only">ระดับ {lv}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <ChipField className="sm:col-span-3" label="แท็ก" hint="แสดงเป็นป้ายบนการ์ดเมนู" values={f.tags} suggestions={TAG_SUGGESTIONS} labelOf={(t) => TAG_LABEL[t] ?? t} input={tagInput} setInput={setTagInput} onAdd={(v) => addChip("tags", v)} onRemove={(v) => set("tags", f.tags.filter((x) => x !== v))} disabled={!canEdit} error={errors.tags} />
            <ChipField className="sm:col-span-3" label="สารก่อภูมิแพ้" hint="ลูกค้าเห็นก่อนสั่ง" values={f.allergens} suggestions={ALLERGEN_SUGGESTIONS} labelOf={(t) => t} input={allergenInput} setInput={setAllergenInput} onAdd={(v) => addChip("allergens", v)} onRemove={(v) => set("allergens", f.allergens.filter((x) => x !== v))} disabled={!canEdit} error={errors.allergens} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>กลุ่มตัวเลือก</CardTitle>
            <CardDescription>เช่น ระดับความเผ็ด ท็อปปิ้ง ขนาด · จัดการกลุ่มได้ที่หน้า “กลุ่มตัวเลือก”</CardDescription>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีกลุ่มตัวเลือก</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {groups.map((g) => {
                  const checked = f.modifierGroupIds.includes(g.id);
                  return (
                    <li key={g.id}>
                      <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors", checked ? "border-primary bg-primary-soft" : "hover:bg-muted")}>
                        <Checkbox checked={checked} disabled={!canEdit} onCheckedChange={(v) => set("modifierGroupIds", v ? [...f.modifierGroupIds, g.id] : f.modifierGroupIds.filter((x) => x !== g.id))} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block font-medium">{g.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {g.required ? "จำเป็น" : "ไม่บังคับ"} · เลือกได้ {g.minSelect}–{g.maxSelect} · {g.modifiers.map((m) => m.name).join(", ") || "ยังไม่มีตัวเลือก"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {errors.modifierGroupIds && <p className="mt-2 text-xs text-destructive">{errors.modifierGroupIds}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>รูปภาพ</CardTitle>
            <CardDescription>อัตราส่วน 4:3 หรือ 1:1 ขนาดไม่เกิน 10 MB</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
              {f.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.image} alt="" className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-muted-foreground">
                  <ImageOff className="size-8" aria-hidden />
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 grid place-items-center bg-background/70">
                  <Loader2 className="size-6 animate-spin" aria-hidden />
                </div>
              )}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="image-file" onChange={(e) => upload(e.target.files?.[0])} />
                <Button type="button" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload aria-hidden /> อัปโหลดรูป
                </Button>
                {f.image && (
                  <Button type="button" variant="ghost" onClick={() => set("image", "")} aria-label="ลบรูป">
                    <X aria-hidden />
                  </Button>
                )}
              </div>
            )}
            <Field label="หรือวาง URL รูป" htmlFor="image" error={errors.image}>
              <Input id="image" value={f.image} onChange={(e) => set("image", e.target.value)} placeholder="https://…" disabled={!canEdit} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>การแสดงผล</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">แสดงบนเมนู</span>
                <span className="block text-xs text-muted-foreground">ปิดเพื่อซ่อนชั่วคราวโดยไม่ลบ</span>
              </span>
              <Switch checked={f.available} onCheckedChange={(v) => set("available", v)} disabled={!canEdit} />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">หมดชั่วคราว</span>
                <span className="block text-xs text-muted-foreground">ลูกค้าเห็นแต่สั่งไม่ได้</span>
              </span>
              <Switch checked={f.soldOut} onCheckedChange={(v) => set("soldOut", v)} disabled={!canEdit} className="data-[state=checked]:bg-destructive" />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">เมนูแนะนำ</span>
                <span className="block text-xs text-muted-foreground">ขึ้นส่วน “แนะนำ” บนหน้าแรกและหน้าเมนู</span>
              </span>
              <Switch checked={f.featured} onCheckedChange={(v) => set("featured", v)} disabled={!canEdit} />
            </label>
          </CardContent>
        </Card>

        {canEdit && (
          <div className="sticky bottom-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {item ? "บันทึกการแก้ไข" : "เพิ่มเมนู"}
            </Button>
            <Button asChild type="button" variant="ghost">
              <a href={backHref}>ยกเลิก</a>
            </Button>
            {item && (
              <ConfirmButton variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="ลบเมนู" title={`ลบเมนู “${item.name}”?`} description="ลบถาวร ออเดอร์เก่ายังเก็บชื่อและราคาไว้" confirmLabel="ลบเมนู" action={async () => {
                const r = await deleteItemAction(slug, item.id);
                if (r.ok) router.push(backHref);
                return r;
              }}>
                <Trash2 aria-hidden />
              </ConfirmButton>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

function ChipField({ label, hint, values, suggestions, labelOf, input, setInput, onAdd, onRemove, disabled, error, className }: { label: string; hint?: string; values: string[]; suggestions: string[]; labelOf: (v: string) => string; input: string; setInput: (v: string) => void; onAdd: (v: string) => void; onRemove: (v: string) => void; disabled: boolean; error?: string; className?: string }) {
  const id = React.useId();
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 pr-1">
            {labelOf(v)}
            {!disabled && (
              <button type="button" onClick={() => onRemove(v)} className="grid size-5 place-items-center rounded-full hover:bg-foreground/10" aria-label={`ลบ ${labelOf(v)}`}>
                <X className="size-3" aria-hidden />
              </button>
            )}
          </Badge>
        ))}
        {suggestions
          .filter((s) => !values.includes(s))
          .map((s) => (
            <button key={s} type="button" disabled={disabled} onClick={() => onAdd(s)} className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-50">
              + {labelOf(s)}
            </button>
          ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            id={id}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd(input);
                setInput("");
              }
            }}
            placeholder="พิมพ์แล้วกด Enter"
            maxLength={30}
            className="max-w-xs"
          />
          <Button type="button" variant="outline" onClick={() => { onAdd(input); setInput(""); }}>
            เพิ่ม
          </Button>
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
