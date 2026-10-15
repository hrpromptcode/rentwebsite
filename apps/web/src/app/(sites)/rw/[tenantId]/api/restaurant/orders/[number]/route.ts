import { cookies } from "next/headers";
import { TABLE_COOKIE, getOrderForCustomer } from "@rentweb/module-restaurant/services";
import { loadOrderDto } from "@rentweb/module-restaurant/dto";
import { tenantTx } from "@/lib/tenant";

const NO_STORE = { "cache-control": "no-store" };

/** GET ?p=<phone> – order status for the tracker. Pickup: number + phone; dine-in: the table session cookie. */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string; number: string }> }) {
  const { tenantId, number } = await params;
  const phone = new URL(req.url).searchParams.get("p");
  const jar = await cookies();
  const sessionToken = jar.get(TABLE_COOKIE)?.value ?? null;
  const dto = await tenantTx(tenantId, async (tx) => {
    const r = await getOrderForCustomer(tx, tenantId, number, { phone, sessionToken });
    return r.ok ? loadOrderDto(r.value) : null;
  });
  if (!dto) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  return Response.json(dto, { headers: NO_STORE });
}
