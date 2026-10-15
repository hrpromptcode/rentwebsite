import { attachSlip, getPayment, paymentSettings } from "@rentweb/core/payments";
import { getStorage, IMAGE_MIMES, MAX_UPLOAD_BYTES, objectKey } from "@rentweb/core/storage";
import { getRuntime, tenantTx } from "@/lib/tenant";

/** Multipart upload of a bank-transfer slip. Auto-approves when the tenant enables it (or in dev). */
export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string; paymentId: string }> }) {
  const { tenantId, paymentId } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("slip");
  if (!(file instanceof File)) return Response.json({ error: "ไม่พบไฟล์สลิป" }, { status: 400 });
  if (!IMAGE_MIMES.has(file.type)) return Response.json({ error: "รองรับเฉพาะไฟล์รูปภาพ" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "ไฟล์ใหญ่เกิน 10MB" }, { status: 400 });

  const runtime = await getRuntime(tenantId);
  if (!runtime) return Response.json({ error: "not found" }, { status: 404 });
  const settings = paymentSettings(runtime.config.settings);
  const autoApprove = settings.autoApproveSlips ?? process.env.DEV_AUTO_APPROVE_SLIPS === "true";

  const existing = await tenantTx(tenantId, (tx) => getPayment(tx, tenantId, paymentId));
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });
  if (existing.status === "paid") return Response.json({ status: "paid", slipUrl: existing.slipUrl });

  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await getStorage().put(objectKey(tenantId, "slips", file.name || "slip.jpg"), buf, file.type);

  const updated = await tenantTx(tenantId, (tx) => attachSlip(tx, tenantId, paymentId, { url: stored.url }, { autoApprove }));
  return Response.json({ status: updated.status, slipUrl: updated.slipUrl });
}
