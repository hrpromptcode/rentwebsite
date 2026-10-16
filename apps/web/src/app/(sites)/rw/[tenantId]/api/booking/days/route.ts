import { isUuid } from "@rentweb/core";
import { bookingConfig, getDayAvailability, getServiceById, parseYm, toSlotService } from "@rentweb/module-booking/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const NO_STORE = { headers: { "cache-control": "no-store" } };
const bad = (error: string) => Response.json({ error }, { status: 400, ...NO_STORE });

/**
 * GET /api/booking/days?month=YYYY-MM&service=<id>&staff=<id|''>&party=<n>
 * → { days: [{ date, available, count }] } – powers the calendar availability dots.
 * 400 for an impossible month (SBR-003) or malformed ids (COR-22), 404 for an unknown service.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? "";
  const serviceId = url.searchParams.get("service") ?? "";
  const staffParam = url.searchParams.get("staff");
  const partyParam = url.searchParams.get("party");
  if (!parseYm(month)) return bad("invalid month");
  if (!isUuid(serviceId)) return bad("invalid service");
  if (staffParam && !isUuid(staffParam)) return bad("invalid staff");
  const party = partyParam ? Number(partyParam) : null;
  if (party !== null && (!Number.isInteger(party) || party < 1 || party > 50)) return bad("invalid party");
  const staffId = staffParam || null;
  if (!isUuid(tenantId)) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });

  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  const config = bookingConfig(runtime.config.moduleConfig);

  const days = await tenantTx(tenantId, async (tx) => {
    const service = await getServiceById(tx, tenantId, serviceId);
    if (!service || !service.active) return null;
    return getDayAvailability(tx, tenantId, { service: toSlotService(service), month, staffId, partySize: party, config });
  });
  if (!days) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  return Response.json({ month, days }, NO_STORE);
}
