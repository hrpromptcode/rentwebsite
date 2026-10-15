import { getPayment } from "@rentweb/core/payments";
import { tenantTx } from "@/lib/tenant";

/** Public payment status (polled by PaymentPanel). Exposes no sensitive data. */
export async function GET(_req: Request, { params }: { params: Promise<{ tenantId: string; paymentId: string }> }) {
  const { tenantId, paymentId } = await params;
  const p = await tenantTx(tenantId, (tx) => getPayment(tx, tenantId, paymentId));
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  const expired = p.status === "pending" && p.expiresAt && p.expiresAt < new Date();
  return Response.json({ id: p.id, status: expired ? "expired" : p.status, amount: p.amount, slipUrl: p.slipUrl, paidAt: p.paidAt, refType: p.refType, refId: p.refId });
}
