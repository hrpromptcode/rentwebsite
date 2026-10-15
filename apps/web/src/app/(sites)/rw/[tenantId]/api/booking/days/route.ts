import { isUuid } from "@rentweb/core";
import { bookingConfig, getDayAvailability, getServiceById, toSlotService } from "@rentweb/module-booking/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const NO_STORE = { headers: { "cache-control": "no-store" } };

/**
 * GET /api/booking/days?month=YYYY-MM&service=<id>&staff=<id|''>
 * → { days: [{ date, available, count }] } – powers the calendar availability dots.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? "";
  const serviceId = url.searchParams.get("service") ?? "";
  const staffParam = url.searchParams.get("staff");
  const staffId = staffParam && isUuid(staffParam) ? staffParam : null;
  if (!/^\d{4}-\d{2}$/.test(month) || !isUuid(serviceId)) return Response.json({ error: "bad request" }, { status: 400, ...NO_STORE });

  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  const config = bookingConfig(runtime.config.moduleConfig);

  const days = await tenantTx(tenantId, async (tx) => {
    const service = await getServiceById(tx, tenantId, serviceId);
    if (!service || !service.active) return null;
    return getDayAvailability(tx, tenantId, { service: toSlotService(service), month, staffId, config });
  });
  if (!days) return Response.json({ error: "not found" }, { status: 404, ...NO_STORE });
  return Response.json({ month, days }, NO_STORE);
}
