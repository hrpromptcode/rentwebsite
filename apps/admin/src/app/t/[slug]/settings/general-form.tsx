"use client";

import * as React from "react";
import { Clock, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { Field, useAction } from "@/components/ui/form";
import { saveGeneral } from "./actions";
import type { GeneralInput } from "./shared";

type Contact = GeneralInput["contact"];

export function GeneralForm({ slug, initial, storefrontUrl, canEdit }: { slug: string; initial: GeneralInput; storefrontUrl: string; canEdit: boolean }) {
  const [form, setForm] = React.useState<GeneralInput>(initial);
  const [saved, setSaved] = React.useState(initial);
  const [run, pending] = useAction(saveGeneral, { onSuccess: () => setSaved(form) });
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const hours = form.contact.hours ?? [];

  const setContact = (patch: Partial<Contact>) => setForm((f) => ({ ...f, contact: { ...f.contact, ...patch } }));
  const setHour = (i: number, patch: Partial<{ day: string; time: string }>) => setContact({ hours: hours.map((h, j) => (j === i ? { ...h, ...patch } : h)) });

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void run(slug, form);
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลร้าน</CardTitle>
          <CardDescription>ชื่อและคำโปรยที่แสดงบนหน้าร้าน แท็บเบราว์เซอร์ และผลการค้นหา</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field label="ชื่อร้าน" htmlFor="g-name">
            <Input id="g-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required disabled={!canEdit} />
          </Field>
          <Field label="คำโปรย (tagline)" htmlFor="g-tagline" hint="ประโยคสั้นๆ ใต้ชื่อร้าน เช่น “เบเกอรี่โฮมเมด อบใหม่ทุกเช้า”">
            <Input id="g-tagline" value={form.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={160} disabled={!canEdit} />
          </Field>
          <p className="text-xs text-muted-foreground">
            ที่อยู่เว็บไซต์:{" "}
            <a href={storefrontUrl} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
              {storefrontUrl.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ช่องทางติดต่อ</CardTitle>
          <CardDescription>แสดงในส่วนท้ายเว็บ หน้าติดต่อ และใช้เป็น PromptPay สำรองเมื่อยังไม่ได้ตั้งค่า</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="เบอร์โทร" htmlFor="g-phone">
            <Input id="g-phone" inputMode="tel" value={form.contact.phone ?? ""} onChange={(e) => setContact({ phone: e.target.value })} placeholder="08x-xxx-xxxx" maxLength={30} disabled={!canEdit} />
          </Field>
          <Field label="อีเมล" htmlFor="g-email">
            <Input id="g-email" type="email" inputMode="email" value={form.contact.email ?? ""} onChange={(e) => setContact({ email: e.target.value })} placeholder="hello@myshop.com" maxLength={120} disabled={!canEdit} />
          </Field>
          <Field label="LINE ID" htmlFor="g-line" hint="เช่น @myshop ลูกค้ากดแล้วเปิดแชทได้ทันที">
            <Input id="g-line" value={form.contact.lineId ?? ""} onChange={(e) => setContact({ lineId: e.target.value })} placeholder="@myshop" maxLength={60} disabled={!canEdit} />
          </Field>
          <Field label="ลิงก์แผนที่ (Google Maps)" htmlFor="g-map">
            <Input id="g-map" inputMode="url" value={form.contact.mapUrl ?? ""} onChange={(e) => setContact({ mapUrl: e.target.value })} placeholder="https://maps.app.goo.gl/…" maxLength={300} disabled={!canEdit} />
          </Field>
          <Field label="ที่อยู่" htmlFor="g-address" className="sm:col-span-2">
            <Textarea id="g-address" value={form.contact.address ?? ""} onChange={(e) => setContact({ address: e.target.value })} className="min-h-20" maxLength={300} disabled={!canEdit} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>เวลาทำการ</CardTitle>
          <CardDescription>เพิ่มได้หลายแถว เช่น “จันทร์ – ศุกร์ 09:00 – 18:00”</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {hours.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" aria-hidden /> ยังไม่ได้ระบุเวลาทำการ
            </p>
          )}
          {hours.map((h, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input aria-label={`วัน แถวที่ ${i + 1}`} value={h.day} onChange={(e) => setHour(i, { day: e.target.value })} placeholder="จันทร์ – ศุกร์" maxLength={60} disabled={!canEdit} />
              <Input aria-label={`เวลา แถวที่ ${i + 1}`} value={h.time} onChange={(e) => setHour(i, { time: e.target.value })} placeholder="09:00 – 18:00" maxLength={60} disabled={!canEdit} />
              <Button type="button" variant="ghost" size="icon" aria-label="ลบแถว" onClick={() => setContact({ hours: hours.filter((_, j) => j !== i) })} disabled={!canEdit}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          {canEdit && hours.length < 14 && (
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => setContact({ hours: [...hours, { day: "", time: "" }] })}>
              <Plus aria-hidden /> เพิ่มแถว
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>โซเชียลมีเดีย</CardTitle>
          <CardDescription>ใส่ลิงก์เต็ม ไอคอนจะแสดงในส่วนท้ายเว็บโดยอัตโนมัติ</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {(
            [
              ["facebook", "Facebook", "https://facebook.com/myshop"],
              ["instagram", "Instagram", "https://instagram.com/myshop"],
              ["tiktok", "TikTok", "https://tiktok.com/@myshop"],
              ["youtube", "YouTube", "https://youtube.com/@myshop"],
            ] as const
          ).map(([key, label, ph]) => (
            <Field key={key} label={label} htmlFor={`g-${key}`}>
              <Input id={`g-${key}`} inputMode="url" value={form.contact[key] ?? ""} onChange={(e) => setContact({ [key]: e.target.value })} placeholder={ph} maxLength={300} disabled={!canEdit} />
            </Field>
          ))}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        {dirty && <span className="mr-auto text-xs text-muted-foreground">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span>}
        <Button type="button" variant="ghost" onClick={() => setForm(saved)} disabled={!dirty || pending}>
          คืนค่า
        </Button>
        <Button type="submit" disabled={!dirty || pending || !canEdit}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
        </Button>
      </div>
    </form>
  );
}
