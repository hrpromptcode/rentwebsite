import { z } from "zod";
import { cartSchema, priceCart, restaurantConfigOf } from "@rentweb/module-restaurant/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const bodySchema = z.object({ items: cartSchema, type: z.enum(["dine_in", "pickup"]).default("pickup") });
const NO_STORE = { "cache-control": "no-store" };

/** POST { items, type } → server-priced lines + totals (service charge applies to dine-in only). */
export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) return Response.json({ ok: false, error: "not found" }, { status: 404, headers: NO_STORE });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "ข้อมูลออเดอร์ไม่ถูกต้อง", code: "invalid" }, { status: 400, headers: NO_STORE });
  const cfg = restaurantConfigOf(runtime.config);
  const result = await tenantTx(tenantId, (tx) => priceCart(tx, tenantId, parsed.data.items, { serviceChargePercent: parsed.data.type === "dine_in" ? cfg.serviceChargePercent : 0 }));
  if (!result.ok) return Response.json({ ok: false, error: result.error, code: result.code ?? null }, { status: 400, headers: NO_STORE });
  return Response.json({ ok: true, ...result.value }, { headers: NO_STORE });
}
