import "../load-env";
import { pathToFileURL } from "node:url";
import { and, desc, eq, getDb, orders, payments, withTenant } from "@rentweb/db";
import { tenantIdBySlug } from "./stock";

/** Order + payment rows for an order number (RLS on): tsx qa/order-state.ts demo-shop "#1001" */
export async function orderState(slug: string, number: string) {
  const tenantId = await tenantIdBySlug(slug);
  return withTenant(getDb(), tenantId, async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.number, number))).limit(1);
    if (!o) return { error: "order not found" };
    const pays = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "order"), eq(payments.refId, o.id))).orderBy(desc(payments.createdAt));
    return {
      order: { id: o.id, number: o.number, status: o.status, paymentStatus: o.paymentStatus, paidAt: o.paidAt, total: o.total, discountTotal: o.discountTotal, shippingTotal: o.shippingTotal, couponCode: o.couponCode, customerId: o.customerId, metadata: o.metadata },
      payments: pays.map((p) => ({ id: p.id, method: p.method, provider: p.provider, status: p.status, amount: p.amount, slipUrl: p.slipUrl, verifiedBy: p.verifiedBy, paidAt: p.paidAt, hasQr: !!p.qrPayload })),
    };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  const [slug = "demo-shop", number = "#1001"] = process.argv.slice(2);
  orderState(slug, number)
    .then((r) => {
      console.log(JSON.stringify(r, null, 1));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
