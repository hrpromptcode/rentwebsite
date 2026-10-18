import { isUuid } from "@rentweb/core";
import { eventsConfig, quoteTicketOrder } from "@rentweb/module-events/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const NO_STORE = { headers: { "cache-control": "no-store" } };
const bad = (error: string) => Response.json({ ok: false, error }, { status: 400, ...NO_STORE });

/** "typeId:qty,typeId:qty" → lines (max 20); null when malformed. */
function parseLines(raw: string | null): Array<{ ticketTypeId: string; qty: number }> | null {
  if (!raw) return [];
  const out: Array<{ ticketTypeId: string; qty: number }> = [];
  for (const part of raw.split(",")) {
    if (!part) continue;
    const [id, q] = part.split(":");
    const qty = Number(q);
    if (!isUuid(id) || !Number.isInteger(qty) || qty < 1 || qty > 50) return null;
    out.push({ ticketTypeId: id!, qty });
    if (out.length > 20) return null;
  }
  return out;
}

/**
 * GET /api/events/quote?event=<id>&session=<id>&lines=typeId:qty,…&promo=CODE
 * → { ok: true, quote: { lines, quantity, subtotal, discount, total, promo } } or { ok: false, error: <QuoteError> }
 * (200: the error is a business reason the widget shows in Thai; 400 only for malformed input). No locks – the server
 * action re-quotes under the ticket-type locks when the order is created.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const url = new URL(req.url);
  const eventId = url.searchParams.get("event") ?? "";
  const sessionId = url.searchParams.get("session");
  const promo = url.searchParams.get("promo")?.trim().slice(0, 32) || null;
  if (!isUuid(eventId)) return bad("event_not_found");
  if (sessionId && !isUuid(sessionId)) return bad("session_not_found");
  const lines = parseLines(url.searchParams.get("lines"));
  if (!lines) return bad("invalid_input");
  if (!lines.length) return Response.json({ ok: false, error: "no_lines" }, NO_STORE);
  if (!isUuid(tenantId)) return Response.json({ ok: false, error: "unknown" }, { status: 404, ...NO_STORE });
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("events")) return Response.json({ ok: false, error: "unknown" }, { status: 404, ...NO_STORE });

  const result = await tenantTx(tenantId, (tx) => quoteTicketOrder(tx, tenantId, { eventId, sessionId: sessionId ?? null, lines, promoCode: promo }, { config: eventsConfig(runtime.config.moduleConfig), settings: runtime.config.settings }));
  if (!result.ok) return Response.json({ ok: false, error: result.error }, NO_STORE);
  const q = result.value;
  return Response.json({ ok: true, quote: { lines: q.lines, quantity: q.quantity, subtotal: q.subtotal, discount: q.discount, total: q.total, promo: q.promo?.code ?? null } }, NO_STORE);
}
