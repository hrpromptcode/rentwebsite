import { getOrderByNumber, getOrderForCustomer, toPublicOrder } from "@rentweb/module-topup/services";
import { tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

/**
 * Order status for the tracker. Public by number (masked); `?k=<access key>` or the signed-in owner
 * additionally gets `authorised: true`. Never returns the delivered code.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string; number: string }> }) {
  const { tenantId, number } = await params;
  const key = new URL(req.url).searchParams.get("k");
  const customer = await getCurrentCustomer(tenantId);
  const data = await tenantTx(tenantId, async (tx) => {
    const full = await getOrderForCustomer(tx, tenantId, { number, customerId: customer?.id, accessKey: key });
    if (full) return { authorised: true, order: toPublicOrder(full) };
    const pub = await getOrderByNumber(tx, tenantId, number);
    return pub ? { authorised: false, order: pub } : null;
  });
  if (!data) return Response.json({ error: "not found" }, { status: 404, headers: { "cache-control": "no-store" } });
  const o = data.order;
  return Response.json(
    {
      number: o.number,
      status: o.status,
      gameName: o.gameName,
      packageName: o.packageName,
      player: o.player,
      price: o.price,
      fulfillment: o.fulfillment,
      failureReason: o.failureReason,
      placedAt: o.placedAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
      fulfilledAt: o.fulfilledAt?.toISOString() ?? null,
      authorised: data.authorised,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
