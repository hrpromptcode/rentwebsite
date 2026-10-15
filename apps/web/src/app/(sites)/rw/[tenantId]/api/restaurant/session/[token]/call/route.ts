import { z } from "zod";
import { resolvePromptpayId } from "@rentweb/core/payments";
import { callStaff, getSessionByToken, requestBill } from "@rentweb/module-restaurant/services";
import { loadSessionDto } from "@rentweb/module-restaurant/dto";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("staff"), note: z.string().trim().max(200).optional() }),
  z.object({ kind: z.literal("bill"), method: z.enum(["promptpay_qr", "counter"]) }),
]);
const NO_STORE = { "cache-control": "no-store" };

/** POST { kind: "staff" } | { kind: "bill", method } – call staff or ask for the bill (PromptPay QR / at the counter). */
export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string; token: string }> }) {
  const { tenantId, token } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) return Response.json({ ok: false, error: "not found" }, { status: 404, headers: NO_STORE });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "คำขอไม่ถูกต้อง" }, { status: 400, headers: NO_STORE });
  const body = parsed.data;
  const customer = await getCurrentCustomer(tenantId);
  const promptpayId = resolvePromptpayId(runtime.config.settings);

  const out = await tenantTx(tenantId, async (tx) => {
    const session = await getSessionByToken(tx, tenantId, token);
    if (!session) return { status: 404, body: { ok: false, error: "ไม่พบรอบการใช้โต๊ะนี้" } };
    const r = body.kind === "staff" ? await callStaff(tx, tenantId, session.id, body.note ?? null) : await requestBill(tx, tenantId, session.id, { method: body.method, promptpayId, customerId: customer?.id ?? null });
    if (!r.ok) return { status: 400, body: { ok: false, error: r.error, code: r.code ?? null } };
    return { status: 200, body: { ok: true, session: await loadSessionDto(tx, tenantId, session.id) } };
  });
  return Response.json(out.body, { status: out.status, headers: NO_STORE });
}
