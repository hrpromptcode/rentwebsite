"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { CATEGORY_LABEL, FIELD_TYPE_LABEL } from "@rentweb/module-topup/admin/labels";
import { fieldErrors, gameSchema } from "@rentweb/module-topup/admin/schemas";
import { NativeSelect } from "@rentweb/module-topup/admin/ui";
import { Field } from "@/components/ui/form";
import { saveGameAction, uploadGameImageAction } from "./actions";
import { autoSlug, EMPTY_FIELD, normalizeSlug, toGameInput, type FieldRowVM, type GameFormValues } from "./form-values";

/** Upload-or-paste image picker (square icon / wide banner). */
export function ImageField({ id, label, hint, value, onChange, slug, wide, error }: { id: string; label: string; hint?: string; value: string; onChange: (url: string) => void; slug: string; wide?: boolean; error?: string }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadGameImageAction(slug, fd);
      if (!r.ok) toast.error(r.error);
      else {
        onChange(r.data!.url);
        toast.success("อัปโหลดรูปแล้ว");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="flex items-start gap-3">
        <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted text-muted-foreground", wide ? "h-16 w-28" : "size-16")}>
          {value ? <img src={value} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5" aria-hidden />}
        </span>
        <div className="grid min-w-0 flex-1 gap-2">
          <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… หรืออัปโหลด" aria-invalid={!!error} />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" data-testid={`${id}-file`} tabIndex={-1} onChange={(e) => upload(e.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} อัปโหลด
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
                <X aria-hidden /> เอาออก
              </Button>
            )}
          </div>
        </div>
      </div>
    </Field>
  );
}

export function GameForm({ slug, gameId, initial }: { slug: string; gameId: string | null; initial: GameFormValues }) {
  const router = useRouter();
  const [v, setV] = React.useState<GameFormValues>(initial);
  const [slugTouched, setSlugTouched] = React.useState(!!gameId);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof GameFormValues>(k: K, val: GameFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const setField = (i: number, patch: Partial<FieldRowVM>) => setV((s) => ({ ...s, fields: s.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const err = (k: string) => errors[k];

  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= v.fields.length) return;
    const arr = [...v.fields];
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    set("fields", arr);
  }

  async function submit() {
    const input = toGameInput(v);
    const parsed = gameSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      toast.error(parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("#game-form [aria-invalid=true]")?.focus());
      return;
    }
    const noOptions = parsed.data.fields.findIndex((f) => f.type === "select" && !(f.options?.length ?? 0));
    if (noOptions >= 0) {
      setErrors({ [`fields.${noOptions}.options`]: "ใส่ตัวเลือกอย่างน้อย 1 รายการ" });
      toast.error("ช่องแบบตัวเลือกต้องมีอย่างน้อย 1 ตัวเลือก");
      requestAnimationFrame(() => document.getElementById(`f-opt-${noOptions}`)?.focus());
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await saveGameAction(slug, gameId, input);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      if (!gameId) router.push(`/t/${slug}/topup/games/${r.data!.id}`);
      else {
        set("slug", r.data!.slug);
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      id="game-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลเกม</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="ชื่อเกม" htmlFor="g-name" error={err("name")}>
                <Input
                  id="g-name"
                  value={v.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setV((s) => ({ ...s, name, slug: slugTouched ? s.slug : autoSlug(name) }));
                  }}
                  placeholder="เช่น RoV (Arena of Valor)"
                  aria-invalid={!!err("name")}
                  autoFocus={!gameId}
                />
              </Field>
              <Field label="ลิงก์ (slug)" htmlFor="g-slug" error={err("slug")} hint={`หน้าร้าน: /games/${v.slug || "…"}`}>
                <Input
                  id="g-slug"
                  value={v.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", normalizeSlug(e.target.value));
                  }}
                  placeholder="rov"
                  aria-invalid={!!err("slug")}
                />
              </Field>
              <Field label="ผู้พัฒนา / ผู้จัดจำหน่าย" htmlFor="g-publisher" error={err("publisher")}>
                <Input id="g-publisher" value={v.publisher} onChange={(e) => set("publisher", e.target.value)} placeholder="เช่น Garena" />
              </Field>
              <Field label="หมวด" htmlFor="g-category" error={err("category")}>
                <NativeSelect id="g-category" value={v.category} onChange={(e) => set("category", e.target.value as GameFormValues["category"])}>
                  {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label="คำอธิบาย" htmlFor="g-description" error={err("description")}>
              <Textarea id="g-description" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="สั้น ๆ ว่าเติมอะไร ได้กี่นาที" maxLength={2000} />
            </Field>
            <Field label="วิธีหา UID / คำแนะนำก่อนเติม" htmlFor="g-instructions" error={err("instructions")} hint="แสดงใต้ฟอร์มกรอกข้อมูลผู้เล่นบนหน้าร้าน">
              <Textarea id="g-instructions" value={v.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="เช่น เปิดเกม → แตะรูปโปรไฟล์มุมซ้ายบน → UID อยู่ใต้ชื่อ" maxLength={2000} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ช่องข้อมูลผู้เล่น</CardTitle>
            <CardDescription>สิ่งที่ลูกค้าต้องกรอกก่อนสั่งเติม เช่น UID, เซิร์ฟเวอร์, โซน (สูงสุด 10 ช่อง)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {v.fields.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">ยังไม่มีช่อง — ลูกค้าสั่งได้โดยไม่ต้องกรอกข้อมูลผู้เล่น (เหมาะกับบัตรเติมเงิน / โค้ด)</p>}
            {v.fields.map((f, i) => (
              <div key={i} role="group" aria-label={`ช่องที่ ${i + 1}`} className="grid min-w-0 gap-3 rounded-xl border p-3" data-field-row={i}>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">
                    ช่องที่ {i + 1}
                    {f.label ? ` · ${f.label}` : ""}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveField(i, -1)} disabled={i === 0} aria-label={`เลื่อนช่องที่ ${i + 1} ขึ้น`}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveField(i, 1)} disabled={i === v.fields.length - 1} aria-label={`เลื่อนช่องที่ ${i + 1} ลง`}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => set("fields", v.fields.filter((_, j) => j !== i))} aria-label={`ลบช่องที่ ${i + 1}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
                  <Field label="key" htmlFor={`f-key-${i}`} error={err(`fields.${i}.key`)} hint="a-z 0-9 _ เช่น uid">
                    <Input id={`f-key-${i}`} value={f.key} onChange={(e) => setField(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="uid" className="font-mono" aria-invalid={!!err(`fields.${i}.key`)} />
                  </Field>
                  <Field label="ชื่อช่อง (ลูกค้าเห็น)" htmlFor={`f-label-${i}`} error={err(`fields.${i}.label`)}>
                    <Input id={`f-label-${i}`} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="UID / ไอดีผู้เล่น" aria-invalid={!!err(`fields.${i}.label`)} />
                  </Field>
                  <Field label="ชนิด" htmlFor={`f-type-${i}`}>
                    <NativeSelect id={`f-type-${i}`} value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldRowVM["type"] })}>
                      {Object.entries(FIELD_TYPE_LABEL).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="ข้อความตัวอย่าง" htmlFor={`f-ph-${i}`} className="sm:col-span-2 lg:col-span-1">
                    <Input id={`f-ph-${i}`} value={f.placeholder} onChange={(e) => setField(i, { placeholder: e.target.value })} placeholder="เช่น 123456789" />
                  </Field>
                  <Field label="รูปช่วยหา (URL)" htmlFor={`f-help-${i}`} className="sm:col-span-2" hint="ภาพหน้าจอบอกตำแหน่ง UID ในเกม">
                    <Input id={`f-help-${i}`} value={f.helpImage} onChange={(e) => setField(i, { helpImage: e.target.value })} placeholder="https://…" />
                  </Field>
                  {f.type === "select" && (
                    <Field label="ตัวเลือก (บรรทัดละ 1 ตัวเลือก)" htmlFor={`f-opt-${i}`} error={err(`fields.${i}.options`)} className="sm:col-span-2 lg:col-span-3">
                      <Textarea id={`f-opt-${i}`} value={f.options} onChange={(e) => setField(i, { options: e.target.value })} placeholder={"Asia\nAmerica\nEurope"} className="min-h-20" aria-invalid={!!err(`fields.${i}.options`)} />
                    </Field>
                  )}
                </div>
                <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm">
                  <Switch checked={f.required} onCheckedChange={(c) => setField(i, { required: c })} aria-label={`บังคับกรอกช่องที่ ${i + 1}`} />
                  บังคับกรอก
                </label>
              </div>
            ))}
            {v.fields.length < 10 && (
              <Button type="button" variant="outline" className="w-full border-dashed sm:w-fit" onClick={() => set("fields", [...v.fields, { ...EMPTY_FIELD, key: v.fields.length === 0 ? "uid" : "" }])}>
                <Plus aria-hidden /> เพิ่มช่อง
              </Button>
            )}
            {err("fields") && <p className="text-xs text-destructive">{err("fields")}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>รูปภาพ</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ImageField id="g-image" label="ไอคอน (สี่เหลี่ยมจัตุรัส)" hint="แนะนำ 512×512 px" value={v.image} onChange={(url) => set("image", url)} slug={slug} error={err("image")} />
            <ImageField id="g-banner" label="แบนเนอร์" hint="แนะนำ 1600×600 px" value={v.banner} onChange={(url) => set("banner", url)} slug={slug} wide error={err("banner")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>การแสดงผล</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">เปิดขาย</span>
                <span className="text-xs text-muted-foreground">ปิดไว้ = ซ่อนจากหน้าร้าน</span>
              </span>
              <Switch id="g-active" checked={v.active} onCheckedChange={(c) => set("active", c)} aria-label="เปิดขาย" />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">เกมแนะนำ</span>
                <span className="text-xs text-muted-foreground">ขึ้นเป็นเกมเด่นบนหน้าแรก</span>
              </span>
              <Switch id="g-featured" checked={v.featured} onCheckedChange={(c) => set("featured", c)} aria-label="เกมแนะนำ" />
            </label>
            <Field label="ลำดับการแสดง" htmlFor="g-sort" error={err("sort")} hint="น้อย = แสดงก่อน">
              <Input id="g-sort" type="number" inputMode="numeric" min={0} max={9999} value={v.sort} onChange={(e) => set("sort", e.target.value)} className="w-32" aria-invalid={!!err("sort")} />
            </Field>
          </CardContent>
        </Card>

      </div>

      <div className="sticky bottom-4 z-10 flex justify-end lg:col-span-2">
        <Button type="submit" size="lg" disabled={pending} className="w-full shadow-lg sm:w-auto">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {gameId ? "บันทึกเกม" : "สร้างเกม"}
        </Button>
      </div>
    </form>
  );
}
