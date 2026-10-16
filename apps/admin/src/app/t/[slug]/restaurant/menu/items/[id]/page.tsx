import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Button } from "@rentweb/ui/components/button";
import { getItemAdmin, listCategoriesAdmin, listMenusAdmin, listModifierGroupsAdmin } from "@rentweb/module-restaurant/admin";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { ItemForm } from "./item-form";

export const metadata: Metadata = { title: "รายการอาหาร" };

export default async function MenuItemPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  if (!isNew && !isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("restaurant")) notFound();

  const data = await tenantTx(ctx.tenant.id, async (tx) => {
    const item = isNew ? null : await getItemAdmin(tx, ctx.tenant.id, id);
    if (!isNew && !item) return null;
    const menus = await listMenusAdmin(tx, ctx.tenant.id);
    const menuId = item?.menuId ?? (menus.find((m) => m.id === sp.menu) ?? menus.find((m) => m.active) ?? menus[0])?.id ?? null;
    const categories = menuId ? await listCategoriesAdmin(tx, ctx.tenant.id, menuId) : [];
    const groups = await listModifierGroupsAdmin(tx, ctx.tenant.id);
    return { item, categories, groups, menuId };
  });
  if (!data) notFound();
  if (isNew && data.categories.length === 0) notFound();

  const back = `/t/${slug}/restaurant/menu${data.menuId ? `?menu=${data.menuId}` : ""}`;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับไปหน้าเมนู">
          <Link href={back}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">{isNew ? "เพิ่มเมนูอาหาร" : data.item!.name}</h1>
          <p className="text-sm text-muted-foreground">{isNew ? "ชื่อ ราคา รูป และตัวเลือกจะแสดงบนหน้าเมนูของลูกค้าทันทีที่บันทึก" : `${data.item!.categoryName} · แก้ไขล่าสุด ${new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(data.item!.updatedAt))}`}</p>
        </div>
      </div>
      <ItemForm slug={slug} item={data.item} categories={data.categories} groups={data.groups} defaultCategoryId={data.categories.some((c) => c.id === sp.category) ? sp.category! : (data.categories[0]?.id ?? "")} canEdit={hasRole(ctx, "manager")} backHref={back} />
    </div>
  );
}
