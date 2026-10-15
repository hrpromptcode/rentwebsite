import { z } from "zod";
import { bangkokDate, checkAvailability, restaurantConfigOf } from "@rentweb/module-restaurant/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const qSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  size: z.coerce.number().int().min(1).max(40).default(2),
  zone: z.string().trim().max(40).optional(),
});
const NO_STORE = { "cache-control": "no-store" };

/** GET ?date=YYYY-MM-DD&time=HH:MM&size=2&zone=สวน → { available, capacity, booked, remaining, maxSeats } */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const sp = new URL(req.url).searchParams;
  const parsed = qSchema.safeParse({ date: sp.get("date"), time: sp.get("time"), size: sp.get("size") ?? undefined, zone: sp.get("zone") || undefined });
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  const cfg = restaurantConfigOf(runtime.config);
  const startsAt = bangkokDate(parsed.data.date, parsed.data.time);
  if (Number.isNaN(startsAt.getTime())) return Response.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  const avail = await tenantTx(tenantId, (tx) => checkAvailability(tx, tenantId, { startsAt, zone: parsed.data.zone ?? null, partySize: parsed.data.size, durationMinutes: cfg.reservationMinutes }));
  return Response.json(avail, { headers: NO_STORE });
}
