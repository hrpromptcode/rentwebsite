import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Gamepad2, Star, Trash2 } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { getAdminGame, listStockCodes, stockSummary } from "@rentweb/module-topup/admin";
import { CATEGORY_LABEL } from "@rentweb/module-topup/admin/labels";
import { FilterTabs } from "@rentweb/module-topup/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { assetUrl, fmtDate, fmtNumber } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { deleteGameAction } from "../actions";
import { toGameFormValues, toPackageFormValues } from "../form-values";
import { GameForm } from "../game-form";
import { assetBase } from "../../_shared";
import { PackagesManager } from "./packages-manager";
import { StockPanel } from "./stock-panel";

export const metadata: Metadata = { title: "แก้ไขเกม" };

type Tab = "packages" | "stock" | "info";

export default async function TopupGamePage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ tab?: string; stock?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const tenantId = ctx.tenant.id;
  const data = await tenantTx(tenantId, (tx) => getAdminGame(tx, tenantId, id));
  if (!data) notFound();
  const { game, packages, suppliers } = data;
  const canWrite = hasRole(ctx, "manager");
  const stockPkgs = packages.filter((p) => p.fulfillment === "stock");
  const tab: Tab = sp.tab === "stock" && stockPkgs.length ? "stock" : sp.tab === "info" ? "info" : "packages";
  const selectedStock = stockPkgs.find((p) => p.id === sp.stock) ?? stockPkgs[0] ?? null;
  const stock =
    tab === "stock" && selectedStock
      ? await tenantTx(tenantId, async (tx) => ({ summary: await stockSummary(tx, tenantId, selectedStock.id), codes: await listStockCodes(tx, tenantId, selectedStock.id, { limit: 100 }) }))
      : null;
  const base = `/t/${slug}/topup/games/${game.id}`;
  const totalOrders = packages.reduce((n, p) => n + p.orderCount, 0);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const stockTotal = stockPkgs.reduce((n, p) => n + (p.available ?? 0), 0);

  const tabs = [
    { key: "packages", label: "แพ็กเกจ", count: packages.length, href: base },
    ...(stockPkgs.length ? [{ key: "stock", label: "สต็อกโค้ด", count: stockTotal, href: `${base}?tab=stock` }] : []),
    { key: "info", label: "ข้อมูลเกม", href: `${base}?tab=info` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการเกม">
            <Link href={`/t/${slug}/topup/games`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          {game.image ? <img src={assetUrl(game.image)} alt="" className="size-12 shrink-0 rounded-xl object-cover sm:size-14" /> : <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground sm:size-14"><Gamepad2 className="size-5" aria-hidden /></span>}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{game.name}</h1>
              {game.active ? <Badge variant="success">เปิดขาย</Badge> : <Badge variant="muted">ปิดอยู่</Badge>}
              {game.featured && (
                <Badge variant="accent" className="gap-1">
                  <Star className="fill-current" aria-hidden /> แนะนำ
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {CATEGORY_LABEL[game.category] ?? game.category}
              {game.publisher ? ` · ${game.publisher}` : ""} · สั่งแล้ว {fmtNumber(totalOrders)} รายการ · แก้ไขล่าสุด {fmtDate(game.updatedAt, { withTime: true })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <a href={`${ctx.storefrontUrl}/games/${encodeURIComponent(game.slug)}`} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> ดูบนหน้าร้าน
            </a>
          </Button>
          {canWrite && totalOrders === 0 && (
            <ConfirmButton variant="ghost" className="text-destructive hover:text-destructive" title={`ลบเกม “${game.name}”?`} description={stockTotal > 0 ? `เกมนี้ยังมีโค้ดพร้อมขาย ${fmtNumber(stockTotal)} โค้ด — ระบบจะไม่ลบจนกว่าจะยกเลิก (void) โค้ดทั้งหมด แนะนำให้ปิดขายแทน` : "ลบเกมและแพ็กเกจทั้งหมดถาวร (เกมที่เคยมีรายการสั่ง หรือยังมีโค้ดที่ยังไม่ขาย จะลบไม่ได้ ให้ปิดขายแทน)"} confirmLabel="ลบเกม" action={deleteGameAction.bind(null, slug, game.id)}>
              <Trash2 aria-hidden /> ลบเกม
            </ConfirmButton>
          )}
        </div>
      </div>

      <FilterTabs active={tab} tabs={tabs} />

      {tab === "packages" && (
        <PackagesManager
          slug={slug}
          gameId={game.id}
          canWrite={canWrite}
          suppliers={suppliers}
          stockHref={`${base}?tab=stock&stock=`}
          packages={packages.map((p) => ({
            id: p.id,
            name: p.name,
            badge: p.badge,
            price: p.price,
            costPrice: p.costPrice,
            tierPrices: p.tierPrices ?? {},
            fulfillment: p.fulfillment,
            supplierName: p.supplierId ? (supplierName.get(p.supplierId) ?? null) : null,
            supplierProductCode: p.supplierProductCode,
            estimatedMinutes: p.estimatedMinutes,
            active: p.active,
            available: p.available,
            sold: p.sold,
            orderCount: p.orderCount,
            form: toPackageFormValues(p),
          }))}
        />
      )}

      {tab === "stock" &&
        (selectedStock && stock ? (
          <StockPanel
            slug={slug}
            gameId={game.id}
            canWrite={canWrite}
            hrefFor={`${base}?tab=stock&stock=`}
            packages={stockPkgs.map((p) => ({ id: p.id, name: p.name, available: p.available ?? 0 }))}
            selectedId={selectedStock.id}
            summary={stock.summary}
            codes={stock.codes.map((c) => ({ id: c.id, masked: c.masked, serial: c.serial, status: c.status, createdAt: c.createdAt.toISOString(), soldAt: c.soldAt?.toISOString() ?? null, soldOrderNumber: c.soldOrderNumber, soldOrderId: c.soldOrderId, expiresAt: c.expiresAt?.toISOString() ?? null }))}
          />
        ) : (
          <EmptyState icon={Gamepad2} title="เกมนี้ไม่มีแพ็กเกจแบบสต็อกโค้ด" description="ตั้งวิธีเติมของแพ็กเกจเป็น “รับโค้ดทันที” ก่อน" />
        ))}

      {tab === "info" &&
        (canWrite ? (
          <GameForm slug={slug} gameId={game.id} initial={toGameFormValues(game)} assetBase={assetBase()} />
        ) : (
          <p className="card p-6 text-sm text-muted-foreground">คุณมีสิทธิ์ดูอย่างเดียว — ติดต่อผู้จัดการร้านเพื่อแก้ไขเกม</p>
        ))}
    </div>
  );
}
