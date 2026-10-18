import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, CalendarRange, Plus, Users } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { listExtrasAdmin, listUnitTypesAdmin } from "@rentweb/module-rental/admin";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { rentalBase } from "../_lib";
import { ExtrasManager } from "./extras-manager";
import { UnitToggles } from "./unit-toggles";

export const metadata: Metadata = { title: "ประเภทห้องพัก" };

export default async function UnitsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("rental")) notFound();
  const canWrite = hasRole(ctx, "manager");
  const base = `${rentalBase(slug)}/units`;
  const { types, extras } = await tenantTx(ctx.tenant.id, async (tx) => ({ types: await listUnitTypesAdmin(tx, ctx.tenant.id), extras: await listExtrasAdmin(tx, ctx.tenant.id) }));
  const units = types.filter((t) => t.active).reduce((s, t) => s + t.quantity, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="ประเภทห้องพัก"
        description={`${fmtNumber(types.filter((t) => t.active).length)} ประเภทเปิดขาย · รวม ${fmtNumber(units)} ห้อง · บริการเสริม ${fmtNumber(extras.length)} รายการ`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${rentalBase(slug)}/calendar`}>
                <CalendarRange aria-hidden /> ปฏิทินห้องว่าง
              </Link>
            </Button>
            {canWrite && (
              <Button asChild>
                <Link href={`${base}/new`} data-testid="unit-new">
                  <Plus aria-hidden /> เพิ่มประเภทห้อง
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {types.length === 0 ? (
            <EmptyState
              icon={BedDouble}
              title="ยังไม่มีประเภทห้องพัก"
              description="สร้างประเภทห้อง เช่น ดีลักซ์ วิลล่าริมสระ พร้อมจำนวนห้องและราคาต่อคืน ลูกค้าจึงจะจองได้"
              action={
                canWrite ? (
                  <Button asChild>
                    <Link href={`${base}/new`}>
                      <Plus aria-hidden /> เพิ่มประเภทห้อง
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2" data-testid="unit-list">
              {types.map((t) => (
                <li key={t.id} className="card flex flex-col overflow-hidden p-0" data-testid="unit-card">
                  <Link href={`${base}/${t.id}`} className="relative block aspect-[16/9] bg-muted" aria-label={t.name}>
                    {t.gallery[0] ? <img src={assetUrl(t.gallery[0])} alt={t.name} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-muted-foreground"><BedDouble className="size-8" aria-hidden /></span>}
                    <span className="absolute left-3 top-3 flex gap-1.5">
                      {!t.active && <Badge variant="muted">ปิดขาย</Badge>}
                      {t.featured && <Badge>แนะนำ</Badge>}
                    </span>
                  </Link>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-heading text-lg font-semibold">
                          <Link href={`${base}/${t.id}`} className="hover:text-primary">
                            {t.name}
                          </Link>
                        </h2>
                        <p className="text-xs text-muted-foreground">/rooms/{t.slug}</p>
                      </div>
                      <p className="shrink-0 text-right">
                        <span className="block font-semibold tabular-nums">{thb(t.basePrice)}</span>
                        <span className="block text-xs text-muted-foreground">ต่อคืน</span>
                      </p>
                    </div>
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{t.quantity} ห้อง</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3" aria-hidden /> {t.baseGuests}–{t.maxGuests} ท่าน
                      </span>
                      {t.minNights > 1 && <span>ขั้นต่ำ {t.minNights} คืน</span>}
                      <span>{t.upcomingStays ? `${fmtNumber(t.upcomingStays)} การจองที่จะถึง` : "ยังไม่มีการจอง"}</span>
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <UnitToggles slug={slug} id={t.id} active={t.active} featured={t.featured} canWrite={canWrite} />
                      <Button asChild variant="outline" size="sm">
                        <Link href={`${base}/${t.id}`}>แก้ไข</Link>
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <ExtrasManager slug={slug} canEdit={canWrite} extras={extras.map((e) => ({ id: e.id, name: e.name, description: e.description, price: e.price, pricing: e.pricing, active: e.active, sort: e.sort }))} />
        </div>
      </div>
    </div>
  );
}
