import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChefHat, ExternalLink, History, LayoutGrid } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { boardSnapshot } from "@rentweb/module-restaurant/admin";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { absolutizeSnapshot } from "../_components/urls";
import { OrdersBoard } from "./board";
import { OrdersHistory } from "./history";

export const metadata: Metadata = { title: "ออเดอร์ร้าน" };

export default async function RestaurantOrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("restaurant")) notFound();
  const tab = sp.tab === "history" ? "history" : "board";
  const base = `/t/${slug}/restaurant/orders`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="ออเดอร์ร้าน"
        description={tab === "board" ? "บอร์ดสด อัปเดตอัตโนมัติทุก 5 วินาที · ลากดูแต่ละคอลัมน์บนมือถือ" : "ประวัติออเดอร์ย้อนหลัง ค้นหาและกรองตามวัน"}
        actions={
          <>
            <nav aria-label="มุมมอง" className="inline-flex rounded-xl border bg-card p-1">
              <Link href={base} aria-current={tab === "board" ? "page" : undefined} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors", tab === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <LayoutGrid className="size-4" aria-hidden /> บอร์ดสด
              </Link>
              <Link href={`${base}?tab=history`} aria-current={tab === "history" ? "page" : undefined} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors", tab === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <History className="size-4" aria-hidden /> ประวัติ
              </Link>
            </nav>
            <Button asChild variant="outline">
              <Link href={`/t/${slug}/restaurant/kitchen`}>
                <ChefHat aria-hidden /> จอครัว
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="เปิดหน้าสั่งอาหารของร้าน">
              <a href={`${ctx.storefrontUrl}/order`} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
              </a>
            </Button>
          </>
        }
      />
      {tab === "board" ? <BoardLoader slug={slug} tenantId={ctx.tenant.id} canWrite={hasRole(ctx, "staff")} canMoney={hasRole(ctx, "manager")} /> : <OrdersHistory slug={slug} ctx={ctx} sp={sp} />}
    </div>
  );
}

async function BoardLoader({ slug, tenantId, canWrite, canMoney }: { slug: string; tenantId: string; canWrite: boolean; canMoney: boolean }) {
  const snap = absolutizeSnapshot(await tenantTx(tenantId, (tx) => boardSnapshot(tx, tenantId)));
  return <OrdersBoard slug={slug} initial={snap} canWrite={canWrite} canMoney={canMoney} />;
}
