import { isUuid } from "@rentweb/core";
import { canAccessPayment, getPayment } from "@rentweb/core/payments";
import { tenantTx } from "@/lib/tenant";
import { paymentProof } from "../_proof";

const NO_STORE = { "cache-control": "no-store" };
const notFound = () => Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });

/**
 * Payment status polled by PaymentPanel. Only the payer may read it (customer session, ?k= access key,
 * table session or ?p= phone — same gate as the page that shows the payment); anyone else gets 404.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string; paymentId: string }> }) {
  const { tenantId, paymentId } = await params;
  if (!isUuid(tenantId) || !isUuid(paymentId)) return notFound();
  const proof = await paymentProof(req, tenantId);
  const p = await tenantTx(tenantId, async (tx) => {
    const payment = await getPayment(tx, tenantId, paymentId);
    if (!payment) return null;
    return (await canAccessPayment(tx, payment, proof)) ? payment : null;
  });
  if (!p) return notFound();
  const expired = p.status === "expired" || (p.status === "pending" && !!p.expiresAt && p.expiresAt < new Date());
  return Response.json({ id: p.id, status: expired ? "expired" : p.status, amount: p.amount, slipUrl: p.slipUrl, paidAt: p.paidAt, expiresAt: p.expiresAt }, { headers: NO_STORE });
}
