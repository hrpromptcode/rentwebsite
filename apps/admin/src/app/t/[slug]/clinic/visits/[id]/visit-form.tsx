"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, ImagePlus, Loader2, Lock, PackageCheck, Pill, Plus, Save, Syringe, Trash2, Upload, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { CLINIC_PAY_METHOD } from "@rentweb/module-booking/admin/labels";
import { bahtToSatang, fieldErrors, visitSchema, visitTotals, type VisitInput } from "@rentweb/module-booking/admin/schemas";
import { MoneyInput, NativeSelect } from "@rentweb/module-booking/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { uploadBookingImageAction } from "../../../services/actions";
import { cancelVisitAction, completeVisitAction, saveVisitAction, usePackageSessionAction } from "../../actions";
import { rowKey, type VisitFormValues } from "../../form-values";

const VITALS: Array<{ key: keyof VisitFormValues["vitals"]; label: string; unit: string; placeholder: string }> = [
  { key: "bp", label: "ความดัน", unit: "mmHg", placeholder: "120/80" },
  { key: "hr", label: "ชีพจร", unit: "ครั้ง/นาที", placeholder: "72" },
  { key: "temp", label: "อุณหภูมิ", unit: "°C", placeholder: "36.8" },
  { key: "weight", label: "น้ำหนัก", unit: "กก.", placeholder: "55" },
  { key: "height", label: "ส่วนสูง", unit: "ซม.", placeholder: "160" },
];

export interface VisitFormProps {
  slug: string;
  visitId: string;
  patientId: string;
  status: string;
  paymentStatus: string;
  initial: VisitFormValues;
  doctors: Array<{ id: string; name: string; title: string | null }>;
  procedureOptions: Array<{ id: string; name: string; price: number }>;
  packages: Array<{ id: string; packageName: string; sessionsLeft: number; expiresAt: string | null }>;
  photoConsent: boolean;
  assetBase: string;
}

function toInput(v: VisitFormValues): VisitInput {
  return {
    doctorId: v.doctorId || null,
    chiefComplaint: v.chiefComplaint || null,
    vitals: v.vitals,
    notes: v.notes || null,
    diagnosis: v.diagnosis || null,
    procedures: v.procedures.map((p) => ({ serviceId: p.serviceId, name: p.name, price: bahtToSatang(p.price || 0), staffId: p.staffId })),
    prescriptions: v.prescriptions.map((p) => ({ name: p.name, dose: p.dose || null, qty: Number(p.qty || 1), price: bahtToSatang(p.price || 0) })),
    photosBefore: v.photosBefore,
    photosAfter: v.photosAfter,
    discount: bahtToSatang(v.discount || 0),
    nextVisitNote: v.nextVisitNote || null,
  };
}

export function VisitForm({ slug, visitId, patientId, status, paymentStatus, initial, doctors, procedureOptions, packages, photoConsent, assetBase }: VisitFormProps) {
  const router = useRouter();
  const [v, setV] = React.useState<VisitFormValues>(initial);
  const [saved, setSaved] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<"save" | "complete" | null>(null);
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [method, setMethod] = React.useState<"cash" | "transfer" | "none">("cash");
  const [addSvc, setAddSvc] = React.useState("");
  React.useEffect(() => {
    setV(initial);
    setSaved(initial);
  }, [initial]);

  const set = <K extends keyof VisitFormValues>(k: K, val: VisitFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const cancelled = status === "cancelled";
  const completed = status === "completed";
  const billingLocked = cancelled || completed;
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const input = toInput(v);
  const totals = visitTotals({
    procedures: v.procedures.map((p) => ({ price: bahtToSatang(p.price || 0) || 0 })),
    prescriptions: v.prescriptions.map((p) => ({ price: bahtToSatang(p.price || 0) || 0, qty: Number(p.qty || 1) })),
    discount: bahtToSatang(v.discount || 0) || 0,
  });

  async function save(silent = false): Promise<boolean> {
    const parsed = visitSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return false;
    }
    setErrors({});
    const r = await saveVisitAction(slug, visitId, input);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      toast.error(r.error);
      return false;
    }
    if (!silent) toast.success(r.message ?? "บันทึกแล้ว");
    setSaved(v);
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending("save");
    try {
      if (await save()) router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function complete() {
    setPending("complete");
    try {
      if (dirty && !(await save(true))) return;
      const r = await completeVisitAction(slug, visitId, totals.total > 0 ? method : "none");
      if (!r.ok) return toast.error(r.error);
      toast.success(r.message ?? "ปิดการตรวจแล้ว");
      setCompleteOpen(false);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  function addProcedure(serviceId: string) {
    const s = procedureOptions.find((o) => o.id === serviceId);
    set("procedures", [...v.procedures, { key: rowKey(), serviceId: s?.id ?? null, name: s?.name ?? "", price: s ? String(s.price / 100) : "", staffId: v.doctorId || null }]);
    setAddSvc("");
  }
  const updProc = (key: string, patch: Partial<VisitFormValues["procedures"][number]>) => set("procedures", v.procedures.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const updRx = (key: string, patch: Partial<VisitFormValues["prescriptions"][number]>) => set("prescriptions", v.prescriptions.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const upload = (fd: FormData) => uploadBookingImageAction(slug, fd);

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-testid="visit-form">
      <fieldset disabled={cancelled} className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ซักประวัติและสัญญาณชีพ</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Field label="แพทย์ / ผู้ตรวจ" htmlFor="v-doctor" error={errors.doctorId}>
                <NativeSelect id="v-doctor" value={v.doctorId} onChange={(e) => set("doctorId", e.target.value)}>
                  <option value="">ยังไม่ระบุ</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.title ? ` — ${d.title}` : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="อาการสำคัญ" htmlFor="v-complaint" error={errors.chiefComplaint}>
                <Input id="v-complaint" value={v.chiefComplaint} onChange={(e) => set("chiefComplaint", e.target.value)} maxLength={1000} placeholder="เช่น ผื่นแดงที่แขน 3 วัน" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {VITALS.map((f) => (
                <Field key={f.key} label={f.label} htmlFor={`v-${f.key}`} hint={f.unit} error={errors[`vitals.${f.key}`]}>
                  <Input id={`v-${f.key}`} value={v.vitals[f.key]} onChange={(e) => set("vitals", { ...v.vitals, [f.key]: e.target.value })} placeholder={f.placeholder} inputMode={f.key === "bp" ? "text" : "decimal"} maxLength={f.key === "bp" ? 20 : 10} className="tabular-nums" />
                </Field>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              บันทึกแพทย์ <Lock className="size-4 text-emerald-600" aria-hidden />
            </CardTitle>
            <CardDescription>บันทึกการตรวจเข้ารหัส (AES-256) ก่อนเก็บลงฐานข้อมูล และถูกบันทึกการเข้าถึงทุกครั้ง</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="บันทึกการตรวจ (SOAP)" htmlFor="v-notes" error={errors.notes}>
              <Textarea id="v-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={6} maxLength={20000} placeholder={"S: อาการที่ผู้ป่วยเล่า\nO: ผลตรวจร่างกาย\nA: การประเมิน\nP: แผนการรักษา"} />
            </Field>
            <Field label="การวินิจฉัย" htmlFor="v-diagnosis" error={errors.diagnosis}>
              <Textarea id="v-diagnosis" value={v.diagnosis} onChange={(e) => set("diagnosis", e.target.value)} rows={2} maxLength={2000} />
            </Field>
            <Field label="นัดครั้งถัดไป / คำแนะนำ" htmlFor="v-next" error={errors.nextVisitNote}>
              <Input id="v-next" value={v.nextVisitNote} onChange={(e) => set("nextVisitNote", e.target.value)} maxLength={1000} placeholder="เช่น นัดติดตามผล 2 สัปดาห์" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Syringe className="size-5 text-primary" aria-hidden /> หัตถการ / บริการ
            </CardTitle>
            {billingLocked && <CardDescription>ปิดบิลแล้ว — แก้ไขรายการค่าใช้จ่ายไม่ได้</CardDescription>}
          </CardHeader>
          <CardContent className="grid gap-3" data-testid="procedures">
            {v.procedures.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">ยังไม่มีหัตถการ</p>}
            {v.procedures.map((p, i) => (
              <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_7.5rem_auto] items-start gap-2">
                <Input value={p.name} onChange={(e) => updProc(p.key, { name: e.target.value })} disabled={billingLocked} aria-label={`ชื่อหัตถการ ${i + 1}`} aria-invalid={!!errors[`procedures.${i}.name`] || undefined} maxLength={160} />
                <MoneyInput value={p.price} onChange={(e) => updProc(p.key, { price: e.target.value })} disabled={billingLocked} aria-label={`ราคาหัตถการ ${i + 1}`} invalid={!!errors[`procedures.${i}.price`]} />
                <Button type="button" variant="ghost" size="icon" onClick={() => set("procedures", v.procedures.filter((x) => x.key !== p.key))} disabled={billingLocked} aria-label={`ลบ ${p.name || "หัตถการ"}`}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            {!billingLocked && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <NativeSelect value={addSvc} onChange={(e) => e.target.value && addProcedure(e.target.value)} aria-label="เพิ่มหัตถการจากรายการบริการ" className="min-w-0 flex-1">
                  <option value="">+ เลือกจากรายการบริการ…</option>
                  {procedureOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {thb(o.price)}
                    </option>
                  ))}
                </NativeSelect>
                <Button type="button" variant="outline" onClick={() => addProcedure("")}>
                  <Plus aria-hidden /> รายการอื่น
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="size-5 text-primary" aria-hidden /> ยา / เวชภัณฑ์
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3" data-testid="prescriptions">
            {v.prescriptions.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">ยังไม่มีรายการยา</p>}
            {v.prescriptions.map((p, i) => (
              <div key={p.key} className="grid grid-cols-2 gap-2 rounded-xl border p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_4.5rem_7rem_auto] sm:border-0 sm:p-0">
                <Input value={p.name} onChange={(e) => updRx(p.key, { name: e.target.value })} disabled={billingLocked} placeholder="ชื่อยา" aria-label={`ชื่อยา ${i + 1}`} aria-invalid={!!errors[`prescriptions.${i}.name`] || undefined} maxLength={160} className="col-span-2 sm:col-span-1" />
                <Input value={p.dose} onChange={(e) => updRx(p.key, { dose: e.target.value })} disabled={billingLocked} placeholder="วิธีใช้ เช่น 1x3 หลังอาหาร" aria-label={`วิธีใช้ยา ${i + 1}`} maxLength={120} className="col-span-2 sm:col-span-1" />
                <Input value={p.qty} onChange={(e) => updRx(p.key, { qty: e.target.value.replace(/\D/g, "") })} disabled={billingLocked} inputMode="numeric" aria-label={`จำนวนยา ${i + 1}`} aria-invalid={!!errors[`prescriptions.${i}.qty`] || undefined} className="text-right tabular-nums" />
                <div className="flex gap-1 sm:contents">
                  <MoneyInput value={p.price} onChange={(e) => updRx(p.key, { price: e.target.value })} disabled={billingLocked} aria-label={`ราคาต่อหน่วย ${i + 1}`} className="min-w-0 flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => set("prescriptions", v.prescriptions.filter((x) => x.key !== p.key))} disabled={billingLocked} aria-label={`ลบ ${p.name || "ยา"}`}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
            {!billingLocked && (
              <Button type="button" variant="outline" className="justify-self-start" onClick={() => set("prescriptions", [...v.prescriptions, { key: rowKey(), name: "", dose: "", qty: "1", price: "" }])}>
                <Plus aria-hidden /> เพิ่มยา
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImagePlus className="size-5 text-primary" aria-hidden /> รูปก่อน / หลังการรักษา
            </CardTitle>
            {!photoConsent && <CardDescription className="text-amber-700 dark:text-amber-300">ผู้ป่วยยังไม่ได้ให้ความยินยอมถ่ายภาพ — ขอความยินยอมในหน้าประวัติผู้ป่วยก่อน</CardDescription>}
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <PhotoList label="ก่อนการรักษา" photos={v.photosBefore} onChange={(x) => set("photosBefore", x)} upload={upload} assetBase={assetBase} disabled={cancelled} />
            <PhotoList label="หลังการรักษา" photos={v.photosAfter} onChange={(x) => set("photosAfter", x)} upload={upload} assetBase={assetBase} disabled={cancelled} />
          </CardContent>
        </Card>
      </fieldset>

      <div className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card data-testid="visit-summary">
          <CardHeader>
            <CardTitle>สรุปค่าใช้จ่าย</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">หัตถการ ({v.procedures.length})</span>
              <span className="tabular-nums">{thb(totals.procedures)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ยา / เวชภัณฑ์ ({v.prescriptions.length})</span>
              <span className="tabular-nums">{thb(totals.prescriptions)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="v-discount" className="text-muted-foreground">
                ส่วนลด
              </label>
              <MoneyInput id="v-discount" value={v.discount} onChange={(e) => set("discount", e.target.value)} disabled={billingLocked} className="w-32" invalid={!!errors.discount} />
            </div>
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="font-medium">ยอดสุทธิ</span>
              <span className="font-heading text-2xl font-semibold tabular-nums" data-testid="visit-total">
                {thb(totals.total)}
              </span>
            </div>
            {!cancelled && (
              <Button type="submit" disabled={pending !== null || !dirty} className="mt-1 w-full">
                {pending === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกการตรวจ
              </Button>
            )}
            {dirty && !cancelled && <p className="text-center text-xs text-amber-700 dark:text-amber-300">มีการแก้ไขที่ยังไม่บันทึก</p>}
            {status === "open" && (
              <>
                <Button type="button" variant="secondary" className="w-full" onClick={() => setCompleteOpen(true)} disabled={pending !== null} data-testid="complete-visit">
                  <CheckCircle2 aria-hidden /> ปิดการตรวจ / รับชำระ
                </Button>
                <ConfirmButton
                  type="button"
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive"
                  title="ยกเลิกการตรวจนี้?"
                  description="ใช้เมื่อเปิดแฟ้มผิดหรือผู้ป่วยไม่ได้รับการตรวจ — ข้อมูลยังเก็บไว้แต่แก้ไขไม่ได้"
                  confirmLabel="ยกเลิกการตรวจ"
                  action={async () => {
                    const r = await cancelVisitAction(slug, visitId);
                    if (r.ok) router.refresh();
                    return r;
                  }}
                >
                  <Ban aria-hidden /> ยกเลิกการตรวจ
                </ConfirmButton>
              </>
            )}
            {completed && paymentStatus !== "paid" && <p className="text-xs text-muted-foreground">ปิดการตรวจแล้ว{paymentStatus === "waived" ? " (ไม่คิดค่าใช้จ่าย)" : " — ยังไม่ได้รับชำระ"}</p>}
          </CardContent>
        </Card>

        {packages.length > 0 && !cancelled && (
          <Card data-testid="visit-packages">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageCheck className="size-5 text-primary" aria-hidden /> คอร์สที่ใช้ได้
              </CardTitle>
              <CardDescription>ตัดครั้งจากคอร์สของผู้ป่วยและผูกกับการตรวจนี้</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {packages.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.packageName}</span>
                    <span className="block text-xs text-muted-foreground">เหลือ {p.sessionsLeft} ครั้ง</span>
                  </span>
                  <ConfirmButton
                    size="sm"
                    variant="outline"
                    title={`ใช้ “${p.packageName}” 1 ครั้ง?`}
                    description={`หลังตัดครั้งจะเหลือ ${p.sessionsLeft - 1} ครั้ง`}
                    confirmLabel="ใช้ 1 ครั้ง"
                    action={async () => {
                      const r = await usePackageSessionAction(slug, p.id, { patientId, visitId });
                      if (r.ok) router.refresh();
                      return r;
                    }}
                  >
                    ใช้ 1 ครั้ง
                  </ConfirmButton>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปิดการตรวจ</DialogTitle>
            <DialogDescription>{totals.total > 0 ? `ยอดสุทธิ ${thb(totals.total)} — เลือกวิธีรับชำระ ระบบจะบันทึกรายการรับเงินให้อัตโนมัติ` : "ไม่มีค่าใช้จ่าย — ปิดการตรวจได้ทันที"}</DialogDescription>
          </DialogHeader>
          {totals.total > 0 && (
            <div className="grid gap-2" role="radiogroup" aria-label="วิธีรับชำระ">
              {(["cash", "transfer", "none"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                  className={cn("flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left text-sm transition-colors", method === m ? "border-primary bg-primary-soft/50 font-medium" : "hover:bg-muted")}
                >
                  <span className={cn("grid size-4 place-items-center rounded-full border", method === m && "border-primary")}>{method === m && <span className="size-2 rounded-full bg-primary" />}</span>
                  {CLINIC_PAY_METHOD[m]}
                  {m === "transfer" && <span className="ml-auto text-xs text-muted-foreground">ตรวจยอดเข้าบัญชีแล้ว</span>}
                  {m === "none" && <span className="ml-auto text-xs text-muted-foreground">ค้างชำระ</span>}
                </button>
              ))}
            </div>
          )}
          {dirty && <p className="text-xs text-muted-foreground">ระบบจะบันทึกการแก้ไขล่าสุดก่อนปิดการตรวจ</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCompleteOpen(false)} disabled={pending !== null}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={complete} disabled={pending !== null} data-testid="confirm-complete">
              {pending === "complete" && <Loader2 className="animate-spin" aria-hidden />}
              {totals.total > 0 && method !== "none" ? `รับชำระ ${thb(totals.total)} และปิด` : "ปิดการตรวจ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function PhotoList({ label, photos, onChange, upload, assetBase, disabled }: { label: string; photos: string[]; onChange: (p: string[]) => void; upload: (fd: FormData) => Promise<{ ok: true; data?: { url: string } } | { ok: false; error: string }>; assetBase: string; disabled?: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);
  const src = (u: string) => (u.startsWith("/") ? `${assetBase}${u}` : u);
  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const f of Array.from(files).slice(0, 20 - photos.length)) {
        const fd = new FormData();
        fd.set("file", f);
        fd.set("folder", "clinic");
        const r = await upload(fd);
        if (!r.ok) toast.error(r.error);
        else if (r.data?.url) added.push(r.data.url);
      }
      if (added.length) onChange([...photos, ...added]);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  function addUrl() {
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) return toast.error("กรุณาใส่ลิงก์รูปที่ขึ้นต้นด้วย http(s)://");
    onChange([...photos, u]);
    setUrl("");
  }
  return (
    <div className="grid min-w-0 gap-2">
      <p className="text-sm font-medium">
        {label} <span className="font-normal text-muted-foreground">({photos.length})</span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <div key={`${p}-${i}`} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
            <a href={src(p)} target="_blank" rel="noreferrer">
              <img src={src(p)} alt={`${label} ${i + 1}`} className="size-full object-cover" loading="lazy" />
            </a>
            {!disabled && (
              <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid size-7 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80" aria-label={`ลบรูป${label} ${i + 1}`}>
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="grid aspect-square place-items-center rounded-lg border border-dashed text-muted-foreground hover:bg-muted" aria-label={`อัปโหลดรูป${label}`}>
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => pick(e.target.files)} tabIndex={-1} aria-hidden />
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
            placeholder="หรือวางลิงก์รูป https://…"
            className="h-9 min-w-0"
            aria-label={`ลิงก์รูป${label}`}
          />
          <Button type="button" variant="secondary" size="sm" onClick={addUrl} disabled={!url.trim()}>
            เพิ่ม
          </Button>
        </div>
      )}
    </div>
  );
}
