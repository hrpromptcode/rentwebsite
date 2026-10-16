import type { Metadata } from "next";
import Link from "next/link";
import { FolderTree, Package, Plus, Search, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { listAdminCategories, listAdminProducts, productStatusCounts } from "@rentweb/module-commerce/admin";
import { FilterTabs, NativeSelect, Pagination, qs } from "@rentweb/module-commerce/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { ProductsTable } from "./products-table";

export const metadata: Metadata = { title: "สินค้า" };

type SP = { q?: string; status?: string; category?: string; page?: string };

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const status = ["all", "active", "draft", "archived"].includes(sp.status ?? "") ? sp.status! : "all";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const q = sp.q?.trim() ?? "";
  const category = sp.category ?? "";
  const base = `/t/${slug}/products`;
  const canWrite = hasRole(ctx, "manager");

  const { list, counts, cats } = await tenantTx(ctx.tenant.id, async (tx) => ({
    list: await listAdminProducts(tx, ctx.tenant.id, { q, status: status === "all" ? null : status, categoryId: category || null, page, perPage: 25 }),
    counts: await productStatusCounts(tx, ctx.tenant.id),
    cats: await listAdminCategories(tx, ctx.tenant.id),
  }));
  const params_ = { q, status: status === "all" ? "" : status, category };
  const hasFilters = !!(q || category);

  return (
    <div className="space-y-6">
      <PageHeader
        title="สินค้า"
        description={`${fmtNumber(list.total)} รายการ · หมวดหมู่ ${fmtNumber(cats.length)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${base}/categories`}>
                <FolderTree aria-hidden /> หมวดหมู่
              </Link>
            </Button>
            {canWrite && (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <Plus aria-hidden /> เพิ่มสินค้า
                </Link>
              </Button>
            )}
          </>
        }
      />

      <FilterTabs
        active={status}
        tabs={[
          { key: "all", label: "ทั้งหมด", count: counts.all, href: `${base}${qs(params_, { status: "" })}` },
          { key: "active", label: "เผยแพร่", count: counts.active, href: `${base}${qs(params_, { status: "active" })}` },
          { key: "draft", label: "ฉบับร่าง", count: counts.draft, href: `${base}${qs(params_, { status: "draft" })}` },
          { key: "archived", label: "เก็บถาวร", count: counts.archived, href: `${base}${qs(params_, { status: "archived" })}` },
        ]}
      />

      <form className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]" action={base}>
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ค้นหาชื่อสินค้า หรือ SKU…" className="pl-9" aria-label="ค้นหาสินค้า" />
        </div>
        <NativeSelect name="category" defaultValue={category} aria-label="หมวดหมู่">
          <option value="">ทุกหมวดหมู่</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.productCount})
            </option>
          ))}
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

      {list.rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title={hasFilters || status !== "all" ? "ไม่พบสินค้าตามเงื่อนไข" : "ยังไม่มีสินค้า"}
          description={hasFilters || status !== "all" ? "ลองเปลี่ยนคำค้นหรือตัวกรอง" : "เพิ่มสินค้าชิ้นแรกเพื่อเริ่มขายบนหน้าร้าน"}
          action={
            canWrite && !hasFilters && status === "all" ? (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <Plus aria-hidden /> เพิ่มสินค้า
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="card py-0">
          <ProductsTable slug={slug} canWrite={canWrite} rows={list.rows.map((r) => ({ ...r, image: r.image ? assetUrl(r.image) : null, updatedAt: r.updatedAt.toISOString() }))} />
          <Pagination page={list.page} pages={list.pages} total={list.total} baseHref={base} params={params_} label="สินค้า" />
        </div>
      )}
    </div>
  );
}
