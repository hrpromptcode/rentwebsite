import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Star, Users } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { getAdminDb } from "@rentweb/db";
import { depositSetupStatus, getServiceById, listCategoriesAdmin, listClassSessionRules, listStaff, listStaffForServiceAdmin, loadModuleConfig } from "@rentweb/module-booking/admin";
import { Avatar } from "@rentweb/module-booking/admin/ui";
import { assetUrl, fmtDate } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { durationLabel, serviceToForm } from "../form-values";
import { DepositSetupNotice } from "../deposit-setup-notice";
import { ServiceForm } from "../service-form";
import { ClassSessionsCard } from "../class-sessions";

export const metadata: Metadata = { title: "แก้ไขบริการ" };

export default async function EditServicePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const { svc, cats, staff, sessions, instructors } = await tenantTx(ctx.tenant.id, async (tx) => ({
    svc: await getServiceById(tx, ctx.tenant.id, id),
    cats: await listCategoriesAdmin(tx, ctx.tenant.id),
    staff: await listStaffForServiceAdmin(tx, ctx.tenant.id, id),
    sessions: await listClassSessionRules(tx, ctx.tenant.id, id),
    instructors: await listStaff(tx, ctx.tenant.id),
  }));
  if (!svc) notFound();
  const isClass = svc.capacity > 1 && !svc.requiresStaff;
  const canWrite = hasRole(ctx, "manager");
  const depositSetup = depositSetupStatus((ctx.tenant.settings ?? {}) as Record<string, unknown>, (await loadModuleConfig(getAdminDb(), ctx.tenant.id)).booking);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการบริการ">
            <Link href={`/t/${slug}/services`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{svc.name}</h1>
              {svc.active ? <Badge variant="success">เปิดใช้งาน</Badge> : <Badge variant="muted">ปิดอยู่</Badge>}
              {svc.featured && <Star className="size-4 fill-amber-400 text-amber-400" aria-label="บริการแนะนำ" />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {svc.categoryName ?? "ไม่ระบุหมวดหมู่"} · {durationLabel(svc.durationMin)} · แก้ไขล่าสุด {fmtDate(svc.updatedAt, { withTime: true })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <a href={`${ctx.storefrontUrl}/services/${encodeURIComponent(svc.slug)}`} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> ดูบนหน้าร้าน
            </a>
          </Button>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="flex shrink-0 items-center gap-2 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" aria-hidden /> {isClass ? "ครูผู้สอน" : "ผู้ให้บริการ"} ({staff.length})
        </span>
        {staff.length ? (
          <ul className="flex min-w-0 flex-wrap gap-2">
            {staff.map((s) => (
              <li key={s.id}>
                <Link href={`/t/${slug}/staff/${s.id}`} className="flex min-h-9 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm hover:bg-muted">
                  <Avatar name={s.name} color={s.color} size="sm" className="size-7" />
                  {s.name}
                  {!s.acceptsOnlineBooking && <span className="text-xs text-muted-foreground">(ไม่รับออนไลน์)</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{svc.requiresStaff ? "ยังไม่มีพนักงานที่ให้บริการนี้ — ลูกค้าจะจองไม่ได้จนกว่าจะเลือกบริการนี้ในหน้าพนักงาน" : isClass ? "ยังไม่ได้ระบุครูผู้สอน — เลือกคลาสนี้ในหน้าพนักงานของครู หรือกำหนดครูต่อรอบด้านล่าง" : "บริการนี้ไม่ผูกกับพนักงาน"}</p>
        )}
        <Button asChild variant="ghost" size="sm" className="self-start sm:ml-auto sm:self-auto">
          <Link href={`/t/${slug}/staff`}>จัดการพนักงาน</Link>
        </Button>
      </div>

      {isClass && (
        <ClassSessionsCard
          slug={slug}
          serviceId={svc.id}
          durationMin={svc.durationMin}
          capacity={svc.capacity}
          initial={sessions.map((s) => ({ weekday: s.weekday, start: s.startTime, staffId: s.staffId ?? "" }))}
          instructors={instructors.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, color: i.color }))}
          canEdit={canWrite}
        />
      )}

      {canWrite ? (
        <ServiceForm slug={slug} serviceId={svc.id} initial={serviceToForm(svc)} categories={cats.map((c) => ({ id: c.id, name: c.name }))} assetBase={assetUrl("/").replace(/\/$/, "")} canDelete depositNotice={<DepositSetupNotice slug={slug} status={depositSetup} count={1} compact />} />
      ) : (
        <p className="card p-6 text-sm text-muted-foreground">คุณมีสิทธิ์ดูอย่างเดียว — ติดต่อผู้จัดการร้านเพื่อแก้ไขบริการ</p>
      )}
    </div>
  );
}
