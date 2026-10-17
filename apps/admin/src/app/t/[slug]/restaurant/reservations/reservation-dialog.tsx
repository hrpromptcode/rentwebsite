"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@rentweb/ui/components/button";
import { Checkbox } from "@rentweb/ui/components/checkbox";
import { Dialog, DialogDescription, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { Field } from "@/components/ui/form";
import { focusFirstInvalid, SCROLL_DIALOG_FORM, ScrollDialogBody, ScrollDialogContent, ScrollDialogFooter, ScrollDialogHeader } from "../_components/scroll-dialog";
import { createReservationAction } from "./actions";

const OCCASIONS = ["วันเกิด", "ครบรอบ", "นัดธุรกิจ", "ครอบครัว", "อื่น ๆ"];

/** Date picker that jumps straight to that day's list. */
export function DateJump({ base, date }: { base: string; date: string }) {
  const router = useRouter();
  return <input type="date" value={date} onChange={(e) => e.target.value && router.push(`${base}?date=${e.target.value}`)} className="hidden h-11 rounded-xl border bg-background px-3 text-sm sm:block" aria-label="ไปยังวันที่" />;
}

/** Staff adds a phone / walk-in reservation. Confirmed immediately, no deposit. */
export function NewReservationDialog({ slug, zones, defaultDate, children, ...btn }: ButtonProps & { slug: string; zones: Array<{ zone: string; tables: number; maxSeats: number }>; defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [f, setF] = React.useState({ name: "", phone: "", partySize: "2", date: defaultDate, time: "18:00", zone: "", occasion: "", note: "", force: false });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const formRef = React.useRef<HTMLFormElement>(null);
  // the body scrolls on phones: bring the first invalid field back into view after a rejected submit
  React.useEffect(() => {
    if (Object.keys(errors).length) focusFirstInvalid(formRef.current);
  }, [errors]);

  function reset() {
    setF({ name: "", phone: "", partySize: "2", date: defaultDate, time: "18:00", zone: "", occasion: "", note: "", force: false });
    setErrors({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    try {
      const r = await createReservationAction(slug, { name: f.name, phone: f.phone, partySize: Number(f.partySize), date: f.date, time: f.time, zone: f.zone || null, occasion: f.occasion || null, note: f.note || null, force: f.force });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setOpen(false);
      reset();
      router.push(`/t/${slug}/restaurant/reservations?date=${f.date}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" {...btn} onClick={() => { reset(); setOpen(true); }}>
        {children ?? (
          <>
            <CalendarPlus aria-hidden /> เพิ่มการจอง
          </>
        )}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <ScrollDialogContent className="sm:max-w-lg">
          <form ref={formRef} onSubmit={submit} className={SCROLL_DIALOG_FORM} noValidate>
            <ScrollDialogHeader>
              <DialogTitle>เพิ่มการจอง</DialogTitle>
              <DialogDescription>สำหรับลูกค้าที่โทรจองหรือ walk-in · ยืนยันทันที ไม่ต้องมัดจำ</DialogDescription>
            </ScrollDialogHeader>
            <ScrollDialogBody className="grid content-start gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ชื่อลูกค้า" htmlFor="r-name" error={errors.name}>
                  <Input id="r-name" autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} aria-invalid={!!errors.name} />
                </Field>
                <Field label="เบอร์โทรศัพท์" htmlFor="r-phone" error={errors.phone}>
                  <Input id="r-phone" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08x-xxx-xxxx" maxLength={20} aria-invalid={!!errors.phone} />
                </Field>
                <Field label="จำนวนคน" htmlFor="r-party" error={errors.partySize}>
                  <Input id="r-party" inputMode="numeric" value={f.partySize} onChange={(e) => set("partySize", e.target.value)} aria-invalid={!!errors.partySize} />
                </Field>
                <Field label="โซน" htmlFor="r-zone" error={errors.zone}>
                  <select id="r-zone" value={f.zone} onChange={(e) => set("zone", e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                    <option value="">ไม่ระบุ</option>
                    {zones.map((z) => (
                      <option key={z.zone} value={z.zone}>
                        {z.zone} ({z.tables} โต๊ะ, สูงสุด {z.maxSeats} คน/โต๊ะ)
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="วันที่" htmlFor="r-date" error={errors.date}>
                  <Input id="r-date" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} aria-invalid={!!errors.date} />
                </Field>
                <Field label="เวลา" htmlFor="r-time" error={errors.time}>
                  <Input id="r-time" type="time" step={900} value={f.time} onChange={(e) => set("time", e.target.value)} aria-invalid={!!errors.time} />
                </Field>
                <Field label="โอกาสพิเศษ" htmlFor="r-occasion" error={errors.occasion} className="sm:col-span-2">
                  <div className="flex flex-wrap gap-1.5">
                    {OCCASIONS.map((o) => (
                      <button key={o} type="button" onClick={() => set("occasion", f.occasion === o ? "" : o)} aria-pressed={f.occasion === o} className={`h-9 rounded-full border px-3 text-sm ${f.occasion === o ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted"}`}>
                        {o}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="หมายเหตุ" htmlFor="r-note" error={errors.note} className="sm:col-span-2">
                  <Textarea id="r-note" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="เช่น ขอโต๊ะริมหน้าต่าง, มีเด็กเล็ก" className="min-h-16" maxLength={500} />
                </Field>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={f.force} onCheckedChange={(v) => set("force", !!v)} className="mt-0.5" />
                <span>
                  ข้ามการตรวจสอบที่ว่าง
                  <span className="block text-xs text-muted-foreground">ใช้เมื่อยืนยันกับลูกค้าแล้วว่ารับได้แม้โซนเต็ม</span>
                  {errors.force && <span className="block text-xs text-destructive">{errors.force}</span>}
                </span>
              </label>
            </ScrollDialogBody>
            <ScrollDialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึกการจอง
              </Button>
            </ScrollDialogFooter>
          </form>
        </ScrollDialogContent>
      </Dialog>
    </>
  );
}
