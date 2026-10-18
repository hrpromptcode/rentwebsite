import { isUuid } from "@rentweb/core";
import { buildIcs, getEventById, getOrderForCustomer, listTicketsForOrder } from "@rentweb/module-events";
import { currentHost, getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

/** GET /tickets/[orderId]/ics?k=<key> – calendar entry for the order's session (owner / key holder only). */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string; orderId: string }> }) {
  const { tenantId, orderId } = await params;
  if (!isUuid(orderId)) return new Response("not found", { status: 404 });
  const key = new URL(req.url).searchParams.get("k");
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("events")) return new Response("not found", { status: 404 });
  const customer = await getCurrentCustomer(tenantId);
  const data = await tenantTx(tenantId, async (tx) => {
    const detail = await getOrderForCustomer(tx, tenantId, orderId, { customerId: customer?.id, key });
    if (!detail) return null;
    const [event, tickets] = await Promise.all([getEventById(tx, tenantId, detail.order.eventId), listTicketsForOrder(tx, tenantId, detail.order.id)]);
    return { detail, event, tickets };
  });
  if (!data) return new Response("not found", { status: 404 });
  const { detail, event, tickets } = data;
  const { order, session } = detail;
  const start = session?.startsAt ?? event?.startsAt ?? null;
  const end = session?.endsAt ?? event?.endsAt ?? (start ? new Date(start.getTime() + 2 * 3_600_000) : null);
  if (!start || !end) return new Response("no date yet", { status: 409 });

  const host = await currentHost();
  const proto = host.includes("localhost") ? "http" : "https";
  const url = `${proto}://${host}/tickets/${order.id}${key ? `?k=${encodeURIComponent(key)}` : ""}`;
  const holders = tickets.filter((t) => t.status === "valid" || t.status === "checked_in").map((t) => t.holderName);
  const description = [`หมายเลขคำสั่งซื้อ ${order.number}`, `บัตร ${order.quantity} ใบ`, holders.length ? `ผู้เข้าร่วม: ${holders.join(", ")}` : null, session?.doorsOpen ? `ประตูเปิด ${new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(session.doorsOpen)} น.` : null, url].filter(Boolean).join("\n");
  const body = buildIcs({
    uid: `${order.id}@${host.split(":")[0]}`,
    title: `${detail.event.title}${session?.name ? ` (${session.name})` : ""} – ${runtime.config.name}`,
    description,
    location: [detail.event.venueName, detail.event.venueAddress].filter(Boolean).join(", ") || null,
    start,
    end,
    url,
    status: order.status === "paid" ? "CONFIRMED" : order.status === "pending" ? "TENTATIVE" : "CANCELLED",
    alarmMinutes: 120,
    alarmText: `อีก 2 ชั่วโมงถึงเวลางาน ${detail.event.title}`,
  });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${order.number}.ics"`,
      "cache-control": "no-store",
    },
  });
}
