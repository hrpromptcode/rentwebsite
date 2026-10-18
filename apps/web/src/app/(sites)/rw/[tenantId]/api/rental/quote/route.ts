import { isUuid } from "@rentweb/core";
import { bkkDateString, getUnitTypeById, isValidYmd, listExtras, listRateRules, parseExtrasParam, quoteStay, rentalConfig, unitsAvailable } from "@rentweb/module-rental/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const NO_STORE = { headers: { "cache-control": "no-store" } };
const bad = (error: string) => Response.json({ ok: false, error, remaining: null }, { status: 400, ...NO_STORE });

/**
 * GET /api/rental/quote?type=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&guests=<n>&extras=id:qty,…
 * → { ok: true, quote, remaining } or { ok: false, error: <QuoteError>, remaining } (200: the error is a business reason).
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const url = new URL(req.url);
  const typeId = url.searchParams.get("type") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const guests = Number(url.searchParams.get("guests") ?? 2);
  if (!isUuid(typeId)) return bad("unit_type_not_found");
  if (!isValidYmd(from) || !isValidYmd(to)) return bad("invalid_dates");
  if (!Number.isInteger(guests) || guests < 1 || guests > 50) return bad("too_many_guests");
  if (!isUuid(tenantId)) return Response.json({ ok: false, error: "unknown" }, { status: 404, ...NO_STORE });
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) return Response.json({ ok: false, error: "unknown" }, { status: 404, ...NO_STORE });
  const config = rentalConfig(runtime.config.moduleConfig);
  const extras = parseExtrasParam(url.searchParams.get("extras"));
  const result = await tenantTx(tenantId, async (tx) => {
    const type = await getUnitTypeById(tx, tenantId, typeId);
    if (!type || !type.active) return { ok: false as const, error: "unit_type_not_found", remaining: null };
    const [rules, extraRows] = await Promise.all([listRateRules(tx, tenantId, { unitTypeId: type.id }), listExtras(tx, tenantId, { activeOnly: true })]);
    const q = quoteStay(type, rules, extraRows, { checkIn: from, checkOut: to, guests, extras, today: bkkDateString() }, config);
    if (!q.ok) return { ok: false as const, error: q.error, remaining: null };
    const remaining = await unitsAvailable(tx, tenantId, type, from, to);
    return { ok: true as const, quote: q.quote, remaining };
  });
  return Response.json(result, NO_STORE);
}
