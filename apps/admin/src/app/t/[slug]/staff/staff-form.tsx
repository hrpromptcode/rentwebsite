"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save, Search, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { STAFF_COLORS, STAFF_KIND } from "@rentweb/module-booking/admin/labels";
import { fieldErrors, staffSchema, type StaffInput } from "@rentweb/module-booking/admin/schemas";
import { Avatar, ImageField, NativeSelect } from "@rentweb/module-booking/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { uploadBookingImageAction } from "../services/actions";
import { deleteStaffAction, saveStaffAction, suggestStaffSlugAction } from "./actions";
import type { ServiceChoice, StaffFormValues } from "./form-values";

export function StaffForm({ slug, staffId, initial, services, assetBase, canDelete }: { slug: string; staffId: string | null; initial: StaffFormValues; services: ServiceChoice[]; assetBase: string; canDelete: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<StaffFormValues>(initial);
  const [slugTouched, setSlugTouched] = React.useState(!!staffId);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [svcQ, setSvcQ] = React.useState("");
  const set = <K extends keyof StaffFormValues>(k: K, val: StaffFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];

  React.useEffect(() => {
    if (slugTouched || !v.name.trim()) return;
    const t = setTimeout(() => {
      suggestStaffSlugAction(slug, v.name, staffId)
        .then((s) => setV((cur) => (slugTouched ? cur : { ...cur, slug: s })))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [v.name, slug, staffId, slugTouched]);

  const selected = new Set(v.serviceIds);
  const toggleService = (id: string) => set("serviceIds", selected.has(id) ? v.serviceIds.filter((x) => x !== id) : [...v.serviceIds, id]);
  const q = svcQ.trim().toLowerCase();
  const visible = services.filter((s) => (q ? s.name.toLowerCase().includes(q) || (s.categoryName ?? "").toLowerCase().includes(q) : true));
  const groups = new Map<string, ServiceChoice[]>();
  for (const s of visible) {
    const k = s.categoryName ?? "ไม่ระบุหมวดหมู่";
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  function toInput(): StaffInput {
    return {
      name: v.name,
      slug: v.slug,
      title: v.title || null,
      bio: v.bio || null,
      avatar: v.avatar,
      email: v.email || null,
      phone: v.phone || null,
      color: v.color,
      kind: v.kind,
      acceptsOnlineBooking: v.acceptsOnlineBooking,
      active: v.active,
      sort: Number(v.sort || 0),
      serviceIds: v.serviceIds,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = toInput();
    const parsed = staffSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await saveStaffAction(slug, staffId, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      if (!staffId && r.data) router.push(`/t/${slug}/staff/${r.data.id}`);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  const upload = (fd: FormData) => uploadBookingImageAction(slug, fd);

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลผู้ให้บริการ</CardTitle>
            <CardDescription>ชื่อ ตำแหน่ง และรูปที่ลูกค้าเห็นตอนเลือกช่าง/หมอ</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex items-center gap-4">
              <Avatar src={v.avatar ? (v.avatar.startsWith("/") ? `${assetBase}${v.avatar}` : v.avatar) : null} name={v.name || "?"} color={v.color} size="lg" />
              <div className="grid min-w-0 flex-1 gap-5 sm:grid-cols-2">
                <Field label="ชื่อ" htmlFor="st-name" error={err("name")}>
                  <Input id="st-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น ช่างแนน" required maxLength={120} autoFocus={!staffId} />
                </Field>
                <Field label="ตำแหน่ง" htmlFor="st-title" error={err("title")}>
                  <Input id="st-title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="เช่น สไตลิสต์อาวุโส" maxLength={120} />
                </Field>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="ประเภท" htmlFor="st-kind" error={err("kind")} hint="ห้อง/อุปกรณ์ ใช้กับบริการที่จองตามห้องหรือเครื่อง">
                <NativeSelect id="st-kind" value={v.kind} onChange={(e) => set("kind", e.target.value as StaffFormValues["kind"])}>
                  {Object.entries(STAFF_KIND).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="slug (ลิงก์)" htmlFor="st-slug" error={err("slug")} hint={`/staff/${v.slug || "…"}`}>
                <Input
                  id="st-slug"
                  value={v.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value);
                  }}
                  maxLength={80}
                />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="เบอร์โทร" htmlFor="st-phone" error={err("phone")}>
                <Input id="st-phone" type="tel" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08x-xxx-xxxx" maxLength={20} />
              </Field>
              <Field label="อีเมล" htmlFor="st-email" error={err("email")}>
                <Input id="st-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" />
              </Field>
            </div>
            <Field label="แนะนำตัว" htmlFor="st-bio" error={err("bio")}>
              <Textarea id="st-bio" value={v.bio} onChange={(e) => set("bio", e.target.value)} placeholder="ประสบการณ์ ความถนัด…" className="min-h-24" maxLength={3000} />
            </Field>
            <Field label="รูปโปรไฟล์" error={err("avatar")}>
              <ImageField value={v.avatar} onChange={(url) => set("avatar", url)} upload={upload} folder="staff" assetBase={assetBase} label="รูปโปรไฟล์" shape="square" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>บริการที่ให้ได้</CardTitle>
            <CardDescription>
              เลือกแล้ว {v.serviceIds.length} จาก {services.length} บริการ — ลูกค้าจะเลือกผู้ให้บริการนี้ได้เฉพาะบริการที่ติ๊กไว้
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={svcQ} onChange={(e) => setSvcQ(e.target.value)} placeholder="ค้นหาบริการ…" className="pl-9" aria-label="ค้นหาบริการ" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => set("serviceIds", [...new Set([...v.serviceIds, ...visible.map((s) => s.id)])])}>
                  เลือกทั้งหมด
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => set("serviceIds", v.serviceIds.filter((id) => !visible.some((s) => s.id === id)))}>
                  ล้าง
                </Button>
              </div>
            </div>
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีบริการ —{" "}
                <Link href={`/t/${slug}/services/new`} className="text-primary underline">
                  เพิ่มบริการ
                </Link>
              </p>
            ) : (
              <div className="space-y-4" data-testid="staff-services">
                {[...groups.entries()].map(([cat, list]) => (
                  <fieldset key={cat}>
                    <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{cat}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((s) => {
                        const on = selected.has(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => toggleService(s.id)}
                            className={cn("flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors", on ? "border-primary bg-primary-soft/50" : "hover:bg-muted")}
                          >
                            <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>{on && <Check className="size-3.5" aria-hidden />}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{s.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {s.durationMin} นาที{!s.active && " · ปิดอยู่"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                {visible.length === 0 && <p className="text-sm text-muted-foreground">ไม่พบบริการที่ค้นหา</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>การรับจอง</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">เปิดใช้งาน</span>
                <span className="block text-xs text-muted-foreground">แสดงในปฏิทินและรับคิวได้</span>
              </span>
              <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">รับจองออนไลน์</span>
                <span className="block text-xs text-muted-foreground">ปิด = รับเฉพาะคิวที่แอดมินจองให้ / walk-in</span>
              </span>
              <Switch checked={v.acceptsOnlineBooking} onCheckedChange={(c) => set("acceptsOnlineBooking", c)} />
            </label>
            <Field label="ลำดับการแสดง" htmlFor="st-sort" error={err("sort")} hint="น้อยไปมาก (ใช้เรียงคอลัมน์ในปฏิทิน)">
              <Input id="st-sort" type="number" inputMode="numeric" min={0} max={9999} value={v.sort} onChange={(e) => set("sort", e.target.value)} className="max-w-32" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>สีประจำตัว</CardTitle>
            <CardDescription>ใช้เป็นสีคอลัมน์และป้ายคิวในปฏิทิน</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="สีประจำตัว">
              {STAFF_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={v.color.toLowerCase() === c}
                  aria-label={`สี ${c}`}
                  onClick={() => set("color", c)}
                  className={cn("grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-background transition", v.color.toLowerCase() === c && "ring-2 ring-foreground")}
                  style={{ backgroundColor: c }}
                >
                  {v.color.toLowerCase() === c && <Check className="size-4 text-white" aria-hidden />}
                </button>
              ))}
              <label className="relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-full border text-[10px] text-muted-foreground" title="เลือกสีเอง">
                <input type="color" value={v.color} onChange={(e) => set("color", e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="เลือกสีเอง" />
                อื่น ๆ
              </label>
            </div>
            {err("color") && <p className="mt-2 text-xs text-destructive">{err("color")}</p>}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {staffId && canDelete ? (
            <ConfirmButton
              variant="ghost"
              className="text-destructive hover:text-destructive"
              title={`ลบ “${initial.name}”?`}
              description="ประวัติการจองเดิมยังอยู่ (จะแสดงเป็น “ไม่ระบุ”) แต่ลบไม่ได้ถ้ายังมีคิวล่วงหน้า — ปิดการใช้งานแทนได้"
              confirmLabel="ลบพนักงาน"
              action={async () => {
                const r = await deleteStaffAction(slug, staffId);
                if (r.ok) router.push(`/t/${slug}/staff`);
                return r;
              }}
            >
              <Trash2 aria-hidden /> ลบ
            </ConfirmButton>
          ) : (
            <Button asChild variant="ghost">
              <Link href={`/t/${slug}/staff`}>ยกเลิก</Link>
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {staffId ? "บันทึก" : "เพิ่มพนักงาน"}
          </Button>
        </div>
      </div>
    </form>
  );
}
