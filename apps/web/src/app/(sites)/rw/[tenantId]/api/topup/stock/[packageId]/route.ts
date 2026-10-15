import { isUuid } from "@rentweb/core";
import { countAvailableStock, getPackage } from "@rentweb/module-topup/services";
import { tenantTx } from "@/lib/tenant";

/** Live stock count for a stock-fulfilled package: { available: n } (null for api/manual packages). */
export async function GET(_req: Request, { params }: { params: Promise<{ tenantId: string; packageId: string }> }) {
  const { tenantId, packageId } = await params;
  if (!isUuid(packageId)) return Response.json({ error: "not found" }, { status: 404 });
  const data = await tenantTx(tenantId, async (tx) => {
    const pkg = await getPackage(tx, tenantId, packageId);
    if (!pkg || !pkg.active) return null;
    const available = pkg.fulfillment === "stock" ? await countAvailableStock(tx, tenantId, packageId) : null;
    return { packageId: pkg.id, fulfillment: pkg.fulfillment, available, inStock: pkg.fulfillment !== "stock" || (available ?? 0) > 0 };
  });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}
