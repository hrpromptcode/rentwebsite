import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronRight, ClipboardList, Eye, UserRound } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { isUuid } from "@rentweb/core";
import { getAdminDb, patients } from "@rentweb/db";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { getPatientAdmin, listPackagesAdmin, logRecordAccess, userNames } from "@rentweb/module-booking/admin";
import { GENDER_LABEL, VISIT_PAYMENT, VISIT_STATUS } from "@rentweb/module-booking/admin/labels";
import { Avatar, StatusPill, formatBkkTime, formatThaiDate } from "@rentweb/module-booking/admin/ui";
import { fmtNumber, fmtRelative, thb } from "@/lib/format";
import { getTenantCtx, tenantTx } from "@/lib/tenant";
import { ageFrom, avatarColor, patientToForm } from "../../form-values";
import { PatientEditForm } from "../patient-form";
import { ConsentsCard, OpenVisitButton, PatientPackages } from "./patient-panels";

export const metadata: Metadata = { title: "ประวัติผู้ป่วย" };

const ACCESS_LABEL: Record<string, string> = { view: "เปิดดู", edit: "แก้ไข", export: "ส่งออก", print: "พิมพ์" };
const RESOURCE_LABEL: Record<string, string> = { patient: "ประวัติ", visit: "การตรวจ", photo: "รูปภาพ" };

export default async function PatientDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const tid = ctx.tenant.id;
  const data = await tenantTx(tid, async (tx) => {
    const [exists] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.tenantId, tid), eq(patients.id, id))).limit(1);
    if (!exists) return null;
    // PDPA: every view of a medical record is logged
    await logRecordAccess(tx, tid, { patientId: id, userId: ctx.userId, action: "view", resource: "patient", resourceId: id });
    const [detail, pkgs] = await Promise.all([getPatientAdmin(tx, tid, id), listPackagesAdmin(tx, tid)]);
    return detail ? { detail, pkgs } : null;
  });
  if (!data) notFound();
  const { detail, pkgs } = data;
  const p = detail.patient;
  const consentBy = Object.values(p.consents ?? {}).map((c) => c.by ?? "");
  const names = await userNames(getAdminDb(), [...detail.recentAccess.map((a) => a.userId), ...consentBy]);
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
  const age = ageFrom(p.birthDate);
  const base = `/t/${slug}/clinic`;
  const openVisit = detail.visits.find((v) => v.status === "open");
  const paidTotal = detail.visits.filter((v) => v.paymentStatus === "paid").reduce((s, v) => s + v.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายชื่อผู้ป่วย">
            <Link href={`${base}/patients`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <Avatar name={p.firstName} color={p.active ? avatarColor(p.id) : "#94a3b8"} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
              {p.nickname && <span className="text-lg text-muted-foreground">({p.nickname})</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="font-mono text-sm" data-testid="patient-hn">
                {p.hn}
              </Badge>
              {!p.active && <Badge variant="muted">ปิดใช้งาน</Badge>}
              <span>{[p.gender ? GENDER_LABEL[p.gender] : null, age != null ? `${age} ปี` : null, p.phone].filter(Boolean).join(" · ") || "ยังไม่มีข้อมูลติดต่อ"}</span>
              {p.tags.map((t) => (
                <Badge key={t} variant="soft">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {detail.customer && (
            <Button asChild variant="outline">
              <Link href={`/t/${slug}/customers/${detail.customer.id}`}>
                <UserRound aria-hidden /> บัญชีลูกค้า
              </Link>
            </Button>
          )}
          {openVisit ? (
            <Button asChild>
              <Link href={`${base}/visits/${openVisit.id}`}>
                <ClipboardList aria-hidden /> การตรวจที่เปิดอยู่
              </Link>
            </Button>
          ) : (
            p.active && <OpenVisitButton slug={slug} patientId={p.id} />
          )}
        </div>
      </div>

      {(p.allergies || p.chronicConditions) && (
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
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-muted-foreground">มาตรวจทั้งหมด</p>
          <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{fmtNumber(detail.visits.length)} ครั้ง</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted-foreground">มาล่าสุด</p>
          <p className="mt-1 font-heading text-xl font-semibold">{detail.visits[0] ? fmtRelative(detail.visits[0].visitedAt) : "—"}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted-foreground">ยอดชำระสะสม</p>
          <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{thb(paidTotal)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted-foreground">คอร์สคงเหลือ</p>
          <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{fmtNumber(detail.packages.filter((x) => x.status === "active" && !x.isExpired).reduce((s, x) => s + x.sessionsLeft, 0))} ครั้ง</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <Card data-testid="visit-history">
            <CardHeader>
              <CardTitle>ประวัติการตรวจ</CardTitle>
              <CardDescription>{detail.visits.length ? `${detail.visits.length} ครั้งล่าสุด` : "ยังไม่มีประวัติการตรวจ"}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {detail.visits.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">เมื่อเปิดการตรวจ ประวัติจะแสดงที่นี่พร้อมการวินิจฉัยและค่าใช้จ่าย</p>
              ) : (
                <ul className="divide-y">
                  {detail.visits.map((v) => (
                    <li key={v.id}>
                      <Link href={`${base}/visits/${v.id}`} className="flex items-start gap-3 px-6 py-3 hover:bg-muted/40">
                        <div className="w-16 shrink-0 text-xs text-muted-foreground">
                          <span className="block font-medium text-foreground">{formatThaiDate(v.visitedAt, { short: true })}</span>
                          {formatBkkTime(v.visitedAt)} น.
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{v.diagnosis || v.chiefComplaint || "ไม่ได้ระบุอาการ"}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {v.doctorName ?? "ไม่ระบุแพทย์"}
                            {v.procedureCount > 0 && ` · หัตถการ ${v.procedureCount} รายการ`}
                            {v.diagnosis && v.chiefComplaint && ` · อาการ: ${v.chiefComplaint}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusPill map={VISIT_STATUS} status={v.status} />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {thb(v.total)} · {VISIT_PAYMENT[v.paymentStatus]?.label ?? v.paymentStatus}
                          </span>
                        </div>
                        <ChevronRight className="mt-1 hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <PatientEditForm slug={slug} patientId={p.id} initial={patientToForm(p)} />
        </div>

        <div className="min-w-0 space-y-6">
          <PatientPackages
            slug={slug}
            patientId={p.id}
            packages={detail.packages.map((x) => ({
              id: x.id,
              packageName: x.packageName,
              serviceName: x.serviceName,
              sessionsTotal: x.sessionsTotal,
              sessionsUsed: x.sessionsUsed,
              sessionsLeft: x.sessionsLeft,
              status: x.status,
              isExpired: x.isExpired,
              purchasedAt: x.purchasedAt.toISOString(),
              expiresAt: x.expiresAt?.toISOString() ?? null,
              pricePaid: x.pricePaid,
              usages: x.usages.map((u) => ({ id: u.id, usedAt: u.usedAt.toISOString(), note: u.note, visitId: u.visitId })),
            }))}
            forSale={pkgs.filter((k) => k.active).map((k) => ({ id: k.id, name: k.name, sessions: k.sessions, price: k.price }))}
          />
          <ConsentsCard slug={slug} patientId={p.id} consents={p.consents ?? {}} byNames={names} />
          <Card data-testid="access-log">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="size-5 text-muted-foreground" aria-hidden /> ประวัติการเข้าถึงข้อมูล
              </CardTitle>
              <CardDescription>ทุกการเปิดดูและแก้ไขถูกบันทึกตาม PDPA · ทั้งหมด {fmtNumber(detail.accessLogCount)} ครั้ง</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm">
                {detail.recentAccess.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{a.userId === ctx.userId ? "คุณ" : (names[a.userId] ?? "ผู้ใช้")}</span> {ACCESS_LABEL[a.action] ?? a.action}
                      {RESOURCE_LABEL[a.resource] ?? a.resource}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                ลงทะเบียน {formatThaiDate(p.createdAt, { short: true })}
                {p.source && ` · ที่มา ${p.source === "admin" ? "หน้าร้าน" : p.source === "online" ? "จองออนไลน์" : p.source}`}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
