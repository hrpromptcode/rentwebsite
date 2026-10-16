import { isUuid } from "@rentweb/core";
import { bookingConfig, getServiceById, getSlotsForDate, parseYmd, toSlotService } from "@rentweb/module-booking/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const NO_STORE = { headers: { "cache-control": "no-store" } };
const bad = (error: string) => Response.json({ error }, { status: 400, ...NO_STORE });

/**
 * GET /api/booking/slots?date=YYYY-MM-DD&service=<id>&staff=<id|''>&party=<n>
 * → { slots: [{ start, end, staffId, available, remaining }] } for one day (Asia/Bangkok).
 * 400 for an impossible calendar date (SBR-003) or malformed ids (COR-22), 404 for an unknown service.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const serviceId = url.searchParams.get("service") ?? "";
  const staffParam = url.searchParams.get("staff");
  const partyParam = url.searchParams.get("party");
  if (!parseYmd(date)) return bad("invalid date");
  if (!isUuid(serviceId)) return bad("invalid service");
  if (staffParam && !isUuid(staffParam)) return bad("invalid staff");
  const party = partyParam ? Number(partyParam) : null;
  if (party !== null && (!Number.isInteger(party) || party < 1 || party > 50)) return bad("invalid party");
  const staffId = staffParam || null;
  if (!isUuid(tenantId)) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });

  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  const config = bookingConfig(runtime.config.moduleConfig);

  const slots = await tenantTx(tenantId, async (tx) => {
    const service = await getServiceById(tx, tenantId, serviceId);
    if (!service || !service.active) return null;
    return getSlotsForDate(tx, tenantId, { service: toSlotService(service), date, staffId, partySize: party, config });
  });
  if (!slots) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  return Response.json({ date, slots }, NO_STORE);
}
