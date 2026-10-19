import { getOrderByNumber, getOrderForCustomer, reconcileTopupOrder, toPublicOrder } from "@rentweb/module-topup/services";
import { parseTopupOrderNumber } from "@rentweb/module-topup/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { decodeSlug } from "@/lib/slug";

const NO_STORE = { "cache-control": "no-store" };
const notFound = () => Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });

/**
 * Order status for the tracker. Public by number (masked); `?k=<access key>` or the signed-in owner
 * additionally gets `authorised: true`. Never returns the delivered code.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string; number: string }> }) {
  const { tenantId, number: raw } = await params;
  // only TP-<digits> can exist; anything else (NUL bytes, garbage) is a 404 without a query
  const number = parseTopupOrderNumber(decodeSlug(raw));
  if (!number) return notFound();
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) return notFound();
  const key = new URL(req.url).searchParams.get("k");
  const customer = await getCurrentCustomer(tenantId);
  const data = await tenantTx(tenantId, async (tx) => {
    const found = await getOrderForCustomer(tx, tenantId, { number, customerId: customer?.id, accessKey: key });
    if (found) return { authorised: true, order: toPublicOrder(await reconcileTopupOrder(tx, tenantId, found)) };
    const pub = await getOrderByNumber(tx, tenantId, number);
    return pub ? { authorised: false, order: pub } : null;
  });
  if (!data) return notFound();
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
    { headers: NO_STORE },
  );
}
