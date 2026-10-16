import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kitchenSnapshot } from "@rentweb/module-restaurant/admin";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { absolutizeSnapshot } from "../_components/urls";
import { KitchenDisplay } from "./kds";

export const metadata: Metadata = { title: "จอครัว (KDS)" };

export default async function KitchenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("restaurant")) notFound();
  const snap = absolutizeSnapshot(await tenantTx(ctx.tenant.id, (tx) => kitchenSnapshot(tx, ctx.tenant.id)));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">จอครัวอัปเดตทุก 4 วินาที · แตะรายการเพื่อติ๊กว่าเสร็จ · กดเต็มจอเพื่อใช้บนแท็บเล็ตในครัว</p>
      <KitchenDisplay slug={slug} initial={snap} canWrite={hasRole(ctx, "staff")} tenantName={ctx.tenant.name} />
    </div>
  );
}
