import { getSessionByToken } from "@rentweb/module-restaurant/services";
import { loadSessionDto } from "@rentweb/module-restaurant/dto";
import { tenantTx } from "@/lib/tenant";

const NO_STORE = { "cache-control": "no-store" };

/** GET – table session summary (round history, running total, bill payment). Polled by the table page. */
export async function GET(_req: Request, { params }: { params: Promise<{ tenantId: string; token: string }> }) {
  const { tenantId, token } = await params;
  const dto = await tenantTx(tenantId, async (tx) => {
    const session = await getSessionByToken(tx, tenantId, token);
    return session ? loadSessionDto(tx, tenantId, session.id) : null;
  });
  if (!dto) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  return Response.json(dto, { headers: NO_STORE });
}
