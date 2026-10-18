import { isUuid } from "@rentweb/core";
import { availabilityCalendar, getUnitTypeById, parseYm, rentalConfig } from "@rentweb/module-rental/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const NO_STORE = { headers: { "cache-control": "no-store" } };
const bad = (error: string) => Response.json({ error }, { status: 400, ...NO_STORE });

/**
 * GET /api/rental/calendar?type=<unit type id>&month=YYYY-MM
 * → { month, days: [{ date, remaining, price, past, blocked, bookable }] } – powers the room page's range calendar.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? "";
  const typeId = url.searchParams.get("type") ?? "";
  if (!parseYm(month)) return bad("invalid month");
  if (!isUuid(typeId)) return bad("invalid type");
  if (!isUuid(tenantId)) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  const config = rentalConfig(runtime.config.moduleConfig);
  const days = await tenantTx(tenantId, async (tx) => {
    const type = await getUnitTypeById(tx, tenantId, typeId);
    if (!type || !type.active) return null;
    return availabilityCalendar(tx, tenantId, { type, month, config });
  });
  if (!days) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  return Response.json({ month, days }, NO_STORE);
}
