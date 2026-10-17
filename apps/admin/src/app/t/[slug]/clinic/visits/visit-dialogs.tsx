"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, Stethoscope, UserPlus, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import type { PatientHit } from "@rentweb/module-booking/admin";
import { Avatar, NativeSelect } from "@rentweb/module-booking/admin/ui";
import { Field } from "@/components/ui/form";
import { useReturnFocus } from "@/lib/use-return-focus";
import { createVisitAction, openVisitFromBookingAction, searchPatientsAction } from "../actions";

export function CreateVisitDialog({ slug, doctors }: { slug: string; doctors: Array<{ id: string; name: string; title: string | null }> }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // RESPONSIVE_B2-11: controlled dialog (no DialogTrigger) — give focus back to the opener on close
  const openerRef = React.useRef<HTMLButtonElement>(null);
  const returnFocus = useReturnFocus(openerRef);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<PatientHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [patient, setPatient] = React.useState<PatientHit | null>(null);
  const [doctorId, setDoctorId] = React.useState("");
  const [complaint, setComplaint] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      searchPatientsAction(slug, term)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, slug]);

  function reset() {
    setQ("");
    setHits([]);
    setPatient(null);
    setComplaint("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patient) {
      setError("กรุณาเลือกผู้ป่วย");
      return;
    }
    setPending(true);
    try {
      const r = await createVisitAction(slug, { patientId: patient.id, bookingId: null, doctorId: doctorId || null, chiefComplaint: complaint || null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "เปิดการตรวจแล้ว");
      setOpen(false);
      reset();
      if (r.data) router.push(`/t/${slug}/clinic/visits/${r.data.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button ref={openerRef} type="button" onClick={() => setOpen(true)} data-testid="open-visit">
        <Stethoscope aria-hidden /> เปิดการตรวจใหม่
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent {...returnFocus} className="max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>เปิดการตรวจ (walk-in)</DialogTitle>
            <DialogDescription>ค้นหาผู้ป่วยเดิม หรือ ลงทะเบียนผู้ป่วยใหม่ก่อนเปิดการตรวจ</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} id="create-visit-form" className="grid gap-4">
            <Field label="ผู้ป่วย" error={error}>
              {patient ? (
                <div className="flex items-center gap-3 rounded-xl border bg-primary-soft/40 p-3 text-sm">
                  <Avatar name={patient.name} size="sm" color="#0ea5e9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{patient.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {patient.hn}
                      {patient.phone && ` · ${patient.phone}`}
                    </span>
                  </span>
                  <Button type="button" size="icon-sm" variant="ghost" onClick={() => setPatient(null)} aria-label="เปลี่ยนผู้ป่วย">
                    <X aria-hidden />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setError(null);
                    }}
                    placeholder="ค้นหาผู้ป่วย (HN / ชื่อ / เบอร์)"
                    className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-9 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
                    aria-label="ค้นหาผู้ป่วย"
                    autoFocus
                    autoComplete="off"
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
                  {hits.length > 0 && (
                    <ul className="mt-1 max-h-64 overflow-auto rounded-xl border bg-popover p-1 shadow-md" role="listbox" aria-label="ผลการค้นหาผู้ป่วย">
                      {hits.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => {
                              setPatient(h);
                              setQ("");
                              setHits([]);
                            }}
                            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                          >
                            <Avatar name={h.name} size="sm" color="#0ea5e9" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{h.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {h.hn}
                                {h.phone && ` · ${h.phone}`}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.trim().length >= 2 && !searching && hits.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      ไม่พบผู้ป่วย —{" "}
                      <Link href={`/t/${slug}/clinic/patients?new=1`} className="font-medium text-primary hover:underline">
                        <UserPlus className="inline size-3.5" aria-hidden /> ลงทะเบียนผู้ป่วยใหม่
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </Field>
            <Field label="แพทย์ / ผู้ตรวจ" htmlFor="vc-doctor">
              <NativeSelect id="vc-doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">ยังไม่ระบุ</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.title ? ` — ${d.title}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="อาการสำคัญ" htmlFor="vc-complaint" hint="บันทึกเพิ่มเติมได้ในหน้าการตรวจ">
              <Textarea id="vc-complaint" value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2} maxLength={1000} placeholder="เช่น ผื่นแดงที่แขน 3 วัน" />
            </Field>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="create-visit-form" disabled={pending || !patient}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} เปิดการตรวจ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OpenFromBookingButton({ slug, bookingId, isNew }: { slug: string; bookingId: string; isNew: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  async function run() {
    setPending(true);
    try {
      const r = await openVisitFromBookingAction(slug, bookingId);
      if (!r.ok) return toast.error(r.error);
      toast.success(r.message ?? "เปิดการตรวจแล้ว");
      if (r.data) router.push(`/t/${slug}/clinic/visits/${r.data.id}`);
    } finally {
      setPending(false);
    }
  }
  return (
    <Button type="button" size="sm" variant={isNew ? "outline" : "secondary"} onClick={run} disabled={pending} className="shrink-0">
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : isNew ? <UserPlus aria-hidden /> : <Stethoscope aria-hidden />}
      {isNew ? "ลงทะเบียน + ตรวจ" : "รับเข้าตรวจ"}
    </Button>
  );
}
