"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { CATEGORY_SUGGESTIONS } from "@rentweb/module-events/admin/labels";
import { eventInputSchema, fieldErrors, type EventInput } from "@rentweb/module-events/admin/schemas";
import { GalleryField } from "@rentweb/module-events/admin/ui";
import { Field } from "@/components/ui/form";
import { saveEventAction, uploadEventImageAction } from "./actions";
import type { EventFormValues } from "./form-values";

function typingSlug(input: string, max = 80): string {
  return input
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9ก-๙-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .slice(0, max);
}
const finalizeSlug = (s: string) => typingSlug(s.trim()).replace(/-+$/, "");

export function EventForm({ slug, eventId, initial, assetBase, canWrite }: { slug: string; eventId: string | null; initial: EventFormValues; assetBase: string; canWrite: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<EventFormValues>(initial);
  const [slugTouched, setSlugTouched] = React.useState(!!eventId);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof EventFormValues>(k: K, val: EventFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  React.useEffect(() => {
    if (slugTouched) return;
    setV((cur) => ({ ...cur, slug: finalizeSlug(cur.title) }));
  }, [v.title, slugTouched]);

  function toInput(): EventInput {
    const [cover, ...gallery] = v.images;
    return {
      title: v.title,
      slug: finalizeSlug(v.slug) || undefined,
      summary: v.summary || null,
      description: v.description || null,
      cover: cover ?? null,
      gallery,
      category: v.category || null,
      venueName: v.venueName || null,
      venueAddress: v.venueAddress || null,
      venueMapUrl: v.venueMapUrl || null,
      organizer: v.organizer || null,
      featured: v.featured,
      sort: Number(v.sort || 0),
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = toInput();
    const parsed = eventInputSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await saveEventAction(slug, eventId, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      if (!eventId && r.data) router.push(`/t/${slug}/events/${r.data.id}`);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  const upload = (fd: FormData) => uploadEventImageAction(slug, fd);
  const ro = !canWrite;

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-testid="event-form">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลงาน</CardTitle>
            <CardDescription>ชื่อและรายละเอียดที่ลูกค้าเห็นบนหน้าร้านและบนบัตร</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field label="ชื่องาน" htmlFor="e-title" error={err("title")}>
              <Input id="e-title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="เช่น Jazz Night ริมน้ำ 2569" required maxLength={200} autoFocus={!eventId} disabled={ro} data-testid="event-title" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="slug (ลิงก์)" htmlFor="e-slug" error={err("slug")} hint={`/events/${v.slug || "…"}`}>
                <Input
                  id="e-slug"
                  value={v.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", typingSlug(e.target.value));
                  }}
                  onBlur={() => set("slug", finalizeSlug(v.slug))}
                  placeholder="jazz-night-2569"
                  maxLength={80}
                  disabled={ro}
                />
              </Field>
              <Field label="หมวดหมู่" htmlFor="e-cat" error={err("category")}>
                <Input id="e-cat" list="event-categories" value={v.category} onChange={(e) => set("category", e.target.value)} placeholder="คอนเสิร์ต, เวิร์กช็อป…" maxLength={60} disabled={ro} />
                <datalist id="event-categories">
                  {CATEGORY_SUGGESTIONS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field label="คำโปรย" htmlFor="e-summary" error={err("summary")} hint={`${v.summary.length}/500 · แสดงบนการ์ดและใต้ชื่องาน`}>
              <Textarea id="e-summary" value={v.summary} onChange={(e) => set("summary", e.target.value)} placeholder="สรุปงานใน 1–2 ประโยค" rows={2} maxLength={500} disabled={ro} />
            </Field>
            <Field label="รายละเอียดงาน" htmlFor="e-desc" error={err("description")} hint="เว้นบรรทัดว่างเพื่อขึ้นย่อหน้าใหม่ รองรับ HTML พื้นฐาน (p, b, ul, a) — ระบบกรองโค้ดที่ไม่ปลอดภัยออกให้">
              <Textarea id="e-desc" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="กำหนดการ ศิลปิน/วิทยากร สิ่งที่รวมในบัตร เงื่อนไขการเข้างาน…" className="min-h-40" maxLength={50000} disabled={ro} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รูปภาพ</CardTitle>
            <CardDescription>รูปแรกคือรูปหน้าปก แนะนำสัดส่วน 16:9 อย่างน้อย 1600px · รูปถัดไปเป็นแกลเลอรี</CardDescription>
          </CardHeader>
          <CardContent>
            <GalleryField value={v.images} onChange={(g) => set("images", g)} upload={canWrite ? upload : undefined} assetBase={assetBase} max={21} disabled={ro} />
            {(err("cover") || err("gallery")) && <p className="mt-2 text-xs text-destructive">{err("cover") ?? err("gallery")}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>สถานที่และผู้จัด</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field label="ชื่อสถานที่" htmlFor="e-venue" error={err("venueName")}>
              <Input id="e-venue" value={v.venueName} onChange={(e) => set("venueName", e.target.value)} placeholder="เช่น ลานกิจกรรมริมน้ำ" maxLength={200} disabled={ro} data-testid="event-venue" />
            </Field>
            <Field label="ที่อยู่" htmlFor="e-addr" error={err("venueAddress")}>
              <Textarea id="e-addr" value={v.venueAddress} onChange={(e) => set("venueAddress", e.target.value)} rows={2} maxLength={500} disabled={ro} />
            </Field>
            <Field label="ลิงก์แผนที่" htmlFor="e-map" error={err("venueMapUrl")} hint="Google Maps / Apple Maps">
              <Input id="e-map" inputMode="url" value={v.venueMapUrl} onChange={(e) => set("venueMapUrl", e.target.value)} placeholder="https://maps.google.com/…" maxLength={2000} disabled={ro} />
            </Field>
            <Field label="ผู้จัดงาน" htmlFor="e-org" error={err("organizer")}>
              <Input id="e-org" value={v.organizer} onChange={(e) => set("organizer", e.target.value)} placeholder="ชื่อผู้จัด / ทีมงาน" maxLength={200} disabled={ro} />
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
                <span className="block font-medium">งานแนะนำ</span>
                <span className="block text-xs text-muted-foreground">ปักหมุดไว้บนสุดของหน้าอีเวนต์และหน้าแรก</span>
              </span>
              <Switch checked={v.featured} onCheckedChange={(c) => set("featured", c)} aria-label="งานแนะนำ" disabled={ro} />
            </label>
            <Field label="ลำดับการแสดง" htmlFor="e-sort" error={err("sort")} hint="น้อยมาก่อน (ใช้เมื่อวันเดียวกัน)">
              <Input id="e-sort" type="number" inputMode="numeric" min={-1000} max={1000} value={v.sort} onChange={(e) => set("sort", e.target.value)} disabled={ro} />
            </Field>
          </CardContent>
        </Card>

        {canWrite && (
          <div className="flex items-center justify-end gap-2">
            <Button type="submit" disabled={pending || (!!eventId && !dirty)} data-testid="event-save">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {eventId ? "บันทึก" : "สร้างอีเวนต์"}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
