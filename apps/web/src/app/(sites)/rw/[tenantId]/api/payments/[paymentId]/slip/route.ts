import { isUuid } from "@rentweb/core";
import { attachSlip, canAccessPayment, getPayment, isOpenPaymentStatus, isPaymentStateError, isStrongPaymentAccess, paymentSettings } from "@rentweb/core/payments";
import { getStorage, MAX_SLIP_BYTES, objectKey, SLIP_IMAGE_KINDS, sniffImage } from "@rentweb/core/storage";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { paymentProof } from "../../_proof";

const NO_STORE = { "cache-control": "no-store" };
const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: NO_STORE });
const closed = (status: string) => json({ error: "รายการชำระเงินนี้ปิดแล้ว ไม่สามารถแนบสลิปได้", status }, 409);

/**
 * Multipart upload of a bank-transfer slip (field "slip").
 *  - only the payer: customer session, ?k= access key, table session or ?p= phone (see canAccessPayment)
 *  - only open payments (pending / pending_verification) → 409 otherwise; paid → 200 { status: "paid" }
 *  - the file must really be a JPG / PNG / WebP (magic bytes); the stored extension and content type come
 *    from the sniffed type, never from the client
 *  - auto-approval (tenant setting, or DEV_AUTO_APPROVE_SLIPS outside production) only for strong proofs
 */
export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string; paymentId: string }> }) {
  const { tenantId, paymentId } = await params;
  if (!isUuid(tenantId) || !isUuid(paymentId)) return json({ error: "not found" }, 404);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_SLIP_BYTES + 64 * 1024) return json({ error: "ไฟล์ใหญ่เกิน 8MB" }, 413);

  const runtime = await getRuntime(tenantId);
  if (!runtime) return json({ error: "not found" }, 404);

  const form = await req.formData().catch(() => null);
  const file = form?.get("slip");
  if (!(file instanceof File)) return json({ error: "ไม่พบไฟล์สลิป" }, 400);
  if (file.size > MAX_SLIP_BYTES) return json({ error: "ไฟล์ใหญ่เกิน 8MB" }, 400);

  const proof = await paymentProof(req, tenantId, form);
  const access = await tenantTx(tenantId, async (tx) => {
    const payment = await getPayment(tx, tenantId, paymentId);
    if (!payment) return null;
    return { payment, via: await canAccessPayment(tx, payment, proof) };
  });
  if (!access) return json({ error: "not found" }, 404);
  if (!access.via) return json({ error: "ไม่มีสิทธิ์แนบสลิปสำหรับรายการนี้ กรุณาเปิดจากลิงก์คำสั่งซื้อ/การจอง หรือเข้าสู่ระบบ" }, 403);
  if (access.payment.status === "paid") return json({ status: "paid", slipUrl: access.payment.slipUrl });
  if (!isOpenPaymentStatus(access.payment.status)) return closed(access.payment.status);

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf, SLIP_IMAGE_KINDS);
  if (!kind) return json({ error: "รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WebP" }, 400);

  const settings = paymentSettings(runtime.config.settings);
  const devAuto = process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_APPROVE_SLIPS === "true";
  const autoApprove = isStrongPaymentAccess(access.via) && (settings.autoApproveSlips ?? devAuto);

  const storage = getStorage();
  const stored = await storage.put(objectKey(tenantId, "slips", `slip.${kind.ext}`), buf, kind.mime);
  try {
    const updated = await tenantTx(tenantId, (tx) => attachSlip(tx, tenantId, paymentId, { url: stored.url }, { autoApprove }));
    return json({ status: updated.status, slipUrl: updated.slipUrl });
  } catch (err) {
    await storage.delete(stored.key).catch(() => {});
    if (isPaymentStateError(err)) return closed(err.status);
    throw err;
  }
}
