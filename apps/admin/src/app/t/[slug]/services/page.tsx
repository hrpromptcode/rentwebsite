import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Plus, Search, Sparkles, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { listCategoriesAdmin, listServicesAdmin } from "@rentweb/module-booking/admin";
import { FilterTabs, NativeSelect, qs } from "@rentweb/module-booking/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { CategoriesManager } from "./categories-manager";
import { ServicesTable } from "./services-table";

export const metadata: Metadata = { title: "บริการ" };

type SP = { q?: string; status?: string; category?: string };

export default async function ServicesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const status = sp.status === "active" || sp.status === "inactive" ? sp.status : "all";
  const q = sp.q?.trim() ?? "";
  const category = sp.category ?? "";
  const base = `/t/${slug}/services`;
  const canWrite = hasRole(ctx, "manager");

  const { all, cats } = await tenantTx(ctx.tenant.id, async (tx) => ({
    all: await listServicesAdmin(tx, ctx.tenant.id),
    cats: await listCategoriesAdmin(tx, ctx.tenant.id),
  }));
  const ql = q.toLowerCase();
  const rows = all
    .filter((s) => (status === "active" ? s.active : status === "inactive" ? !s.active : true))
    .filter((s) => (category ? (category === "none" ? !s.categoryId : s.categoryId === category) : true))
    .filter((s) => (ql ? s.name.toLowerCase().includes(ql) || s.slug.includes(ql) || (s.categoryName ?? "").toLowerCase().includes(ql) : true));
  const counts = { all: all.length, active: all.filter((s) => s.active).length, inactive: all.filter((s) => !s.active).length };
  const params_ = { q, status: status === "all" ? "" : status, category };
  const hasFilters = !!(q || category);

  return (
    <div className="space-y-6">
      <PageHeader
        title="บริการ"
        description={`${fmtNumber(counts.active)} บริการเปิดจองอยู่ · ทั้งหมด ${fmtNumber(counts.all)} · หมวดหมู่ ${fmtNumber(cats.length)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/t/${slug}/bookings`}>
                <CalendarClock aria-hidden /> ปฏิทินการจอง
              </Link>
            </Button>
            {canWrite && (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <Plus aria-hidden /> เพิ่มบริการ
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <FilterTabs
            active={status}
            tabs={[
              { key: "all", label: "ทั้งหมด", count: counts.all, href: `${base}${qs(params_, { status: "" })}` },
              { key: "active", label: "เปิดใช้งาน", count: counts.active, href: `${base}${qs(params_, { status: "active" })}` },
              { key: "inactive", label: "ปิดอยู่", count: counts.inactive, href: `${base}${qs(params_, { status: "inactive" })}` },
            ]}
          />
          <form className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]" action={base}>
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input name="q" defaultValue={q} placeholder="ค้นหาชื่อบริการ…" className="pl-9" aria-label="ค้นหาบริการ" />
            </div>
            <NativeSelect name="category" defaultValue={category} aria-label="หมวดหมู่">
              <option value="">ทุกหมวดหมู่</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.serviceCount})
                </option>
              ))}
              <option value="none">ไม่ระบุหมวดหมู่</option>
            </NativeSelect>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
                ค้นหา
              </Button>
              {hasFilters && (
                <Button asChild variant="ghost">
                  <Link href={`${base}${qs({ status: status === "all" ? "" : status })}`}>
                    <X aria-hidden /> ล้าง
                  </Link>
                </Button>
              )}
            </div>
          </form>

          {rows.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title={hasFilters || status !== "all" ? "ไม่พบบริการตามเงื่อนไข" : "ยังไม่มีบริการ"}
              description={hasFilters || status !== "all" ? "ลองเปลี่ยนคำค้นหรือตัวกรอง" : "เพิ่มบริการแรก เช่น ตัดผม ทำเล็บ นวด เพื่อให้ลูกค้าจองคิวออนไลน์ได้"}
              action={
                canWrite && !hasFilters && status === "all" ? (
                  <Button asChild>
                    <Link href={`${base}/new`}>
                      <Plus aria-hidden /> เพิ่มบริการ
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="card py-0">
              <ServicesTable
                slug={slug}
                canWrite={canWrite}
                rows={rows.map((s) => ({
                  id: s.id,
                  name: s.name,
                  slug: s.slug,
                  image: s.image ? assetUrl(s.image) : null,
                  categoryName: s.categoryName,
                  durationMin: s.durationMin,
                  bufferBeforeMin: s.bufferBeforeMin,
                  bufferAfterMin: s.bufferAfterMin,
                  price: s.price,
                  priceNote: s.priceNote,
                  depositRequired: s.depositRequired,
                  depositAmount: s.depositAmount,
                  capacity: s.capacity,
                  requiresStaff: s.requiresStaff,
                  active: s.active,
                  featured: s.featured,
                  staffCount: s.staffCount,
                  upcomingBookings: s.upcomingBookings,
                }))}
              />
              <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                แสดง {fmtNumber(rows.length)} จาก {fmtNumber(counts.all)} บริการ
              </p>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <CategoriesManager slug={slug} canEdit={canWrite} categories={cats} />
        </div>
      </div>
    </div>
  );
}
