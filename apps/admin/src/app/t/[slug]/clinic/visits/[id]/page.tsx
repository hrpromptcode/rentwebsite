import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarDays, FileLock2, Receipt, UserRound } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { bkkDateString, getVisitAdmin, listDoctors, listProcedureOptions, logRecordAccess } from "@rentweb/module-booking/admin";
import { CLINIC_PAY_METHOD, GENDER_LABEL, METHOD_LABELS, VISIT_PAYMENT, VISIT_STATUS } from "@rentweb/module-booking/admin/labels";
import { satangToBaht } from "@rentweb/module-booking/admin/schemas";
import { StatusPill, formatBkkTime, formatThaiDate } from "@rentweb/module-booking/admin/ui";
import { assetUrl, thb } from "@/lib/format";
import { getTenantCtx, tenantTx } from "@/lib/tenant";
import { ageFrom, rowKey, type VisitFormValues } from "../../form-values";
import { VisitForm } from "./visit-form";

export const metadata: Metadata = { title: "การตรวจ" };

export default async function VisitDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const tid = ctx.tenant.id;
  const data = await tenantTx(tid, async (tx) => {
    const d = await getVisitAdmin(tx, tid, id);
    if (!d) return null;
    // PDPA: log every view of the visit record (notes are decrypted for this request)
    await logRecordAccess(tx, tid, { patientId: d.visit.patientId, userId: ctx.userId, action: "view", resource: "visit", resourceId: id });
    const [doctors, procs] = await Promise.all([listDoctors(tx, tid), listProcedureOptions(tx, tid)]);
    return { d, doctors, procs };
  });
  if (!data) notFound();
  const { d, doctors, procs } = data;
  const { visit: v, patient: p } = d;
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
  const age = ageFrom(p.birthDate);
  const vit = (v.vitals ?? {}) as Record<string, string | number>;
  const initial: VisitFormValues = {
    doctorId: v.doctorId ?? "",
    chiefComplaint: v.chiefComplaint ?? "",
    vitals: { bp: String(vit.bp ?? ""), hr: String(vit.hr ?? ""), weight: String(vit.weight ?? ""), temp: String(vit.temp ?? ""), height: String(vit.height ?? "") },
    notes: d.notes ?? "",
    diagnosis: v.diagnosis ?? "",
    procedures: (v.procedures ?? []).map((x) => ({ key: rowKey(), serviceId: x.serviceId ?? null, name: x.name, price: satangToBaht(x.price), staffId: x.staffId ?? null })),
    prescriptions: (v.prescriptions ?? []).map((x) => ({ key: rowKey(), name: x.name, dose: x.dose ?? "", qty: String(x.qty ?? 1), price: satangToBaht(x.price ?? 0) })),
    photosBefore: v.photosBefore ?? [],
    photosAfter: v.photosAfter ?? [],
    discount: satangToBaht(v.discount),
    nextVisitNote: v.nextVisitNote ?? "",
  };
  const day = bkkDateString(v.visitedAt);
  const backHref = `/t/${slug}/clinic/visits${day !== bkkDateString(new Date()) ? `?date=${day}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการการตรวจ">
            <Link href={backHref}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">การตรวจ · {formatThaiDate(v.visitedAt, { weekday: true })} {formatBkkTime(v.visitedAt)} น.</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                <Link href={`/t/${slug}/clinic/patients/${p.id}`} className="hover:text-primary">
                  {name}
                </Link>
              </h1>
              <span data-testid="visit-status">
                <StatusPill map={VISIT_STATUS} status={v.status} />
              </span>
              <StatusPill map={VISIT_PAYMENT} status={v.paymentStatus} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <Badge variant="outline" className="font-mono">
                {p.hn}
              </Badge>
              <span>{[p.nickname ? `“${p.nickname}”` : null, p.gender ? GENDER_LABEL[p.gender] : null, age != null ? `${age} ปี` : null, p.bloodType ? `เลือด ${p.bloodType}` : null, p.phone].filter(Boolean).join(" · ")}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {d.booking && (
            <Button asChild variant="outline">
              <Link href={`/t/${slug}/bookings/${d.booking.id}`}>
                <CalendarDays aria-hidden /> {d.booking.number}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/t/${slug}/clinic/patients/${p.id}`}>
              <UserRound aria-hidden /> ประวัติผู้ป่วย
            </Link>
          </Button>
        </div>
      </div>

      {(p.allergies || p.chronicConditions || p.currentMedications) && (
        <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert" data-testid="allergy-alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="grid min-w-0 gap-1">
            {p.allergies && (
              <p className="break-words">
                <strong className="text-destructive">แพ้:</strong> {p.allergies}
              </p>
            )}
            {p.chronicConditions && (
              <p className="break-words">
                <strong>โรคประจำตัว:</strong> {p.chronicConditions}
              </p>
            )}
            {p.currentMedications && (
              <p className="break-words">
                <strong>ยาที่ใช้ประจำ:</strong> {p.currentMedications}
              </p>
            )}
          </div>
        </div>
      )}

      {d.notes === null && (
        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <FileLock2 className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <p>ถอดรหัสบันทึกแพทย์ไม่สำเร็จ (คีย์เข้ารหัสไม่ตรงกัน) — การบันทึกใหม่จะเขียนทับบันทึกเดิม</p>
        </div>
      )}

      {d.payment && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-emerald-500/5 px-4 py-3 text-sm">
          <Receipt className="size-4 text-emerald-600" aria-hidden />
          <span>
            รับชำระ <strong className="tabular-nums">{thb(d.payment.amount)}</strong> · {d.payment.method === "cash" ? CLINIC_PAY_METHOD.cash : d.payment.method === "slip" ? CLINIC_PAY_METHOD.transfer : (METHOD_LABELS[d.payment.method]?.label ?? d.payment.method)}
          </span>
          {d.payment.paidAt && <span className="text-muted-foreground">{formatThaiDate(d.payment.paidAt, { short: true, time: true })}</span>}
          <Link href={`/t/${slug}/payments`} className="ml-auto text-primary hover:underline">
            ดูรายการรับเงิน
          </Link>
        </div>
      )}

      <VisitForm
        slug={slug}
        visitId={v.id}
        patientId={p.id}
        status={v.status}
        paymentStatus={v.paymentStatus}
        initial={initial}
        doctors={doctors.map((x) => ({ id: x.id, name: x.name, title: x.title }))}
        procedureOptions={procs}
        packages={d.packages.filter((x) => x.sessionsLeft > 0 && (!x.expiresAt || x.expiresAt > new Date())).map((x) => ({ id: x.id, packageName: x.packageName, sessionsLeft: x.sessionsLeft, expiresAt: x.expiresAt?.toISOString() ?? null }))}
        photoConsent={!!p.consents?.photo}
        assetBase={assetUrl("/").replace(/\/$/, "")}
      />
    </div>
  );
}
