import { isUuid } from "@rentweb/core";
import { bookingConfig, getServiceById, getSlotsForDate, toSlotService } from "@rentweb/module-booking/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const NO_STORE = { headers: { "cache-control": "no-store" } };

/**
 * GET /api/booking/slots?date=YYYY-MM-DD&service=<id>&staff=<id|''>
 * → { slots: [{ start, end, staffId, available, remaining }] } for one day (Asia/Bangkok).
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const serviceId = url.searchParams.get("service") ?? "";
  const staffParam = url.searchParams.get("staff");
  const staffId = staffParam && isUuid(staffParam) ? staffParam : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isUuid(serviceId)) return Response.json({ error: "bad request" }, { status: 400, ...NO_STORE });

  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  const config = bookingConfig(runtime.config.moduleConfig);

  const slots = await tenantTx(tenantId, async (tx) => {
    const service = await getServiceById(tx, tenantId, serviceId);
    if (!service || !service.active) return null;
    return getSlotsForDate(tx, tenantId, { service: toSlotService(service), date, staffId, config });
  });
  if (!slots) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  return Response.json({ date, slots }, NO_STORE);
}
