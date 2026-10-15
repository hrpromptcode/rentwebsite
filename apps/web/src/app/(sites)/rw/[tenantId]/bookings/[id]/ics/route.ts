import { isUuid } from "@rentweb/core";
import { getBookingForCustomer, icsStamp } from "@rentweb/module-booking/services";
import { currentHost, getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** RFC 5545 line folding (75 octets) – counts bytes so Thai text folds correctly. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    let end = Math.min(i + (out.length ? 74 : 75), bytes.length);
    while (end < bytes.length && end > i && (bytes[end]! & 0xc0) === 0x80) end--; // don't split a UTF-8 sequence
    out.push((out.length ? " " : "") + bytes.subarray(i, end).toString("utf8"));
    i = end;
  }
  return out.join("\r\n");
}

/** GET /bookings/[id]/ics?k=<key> – downloadable calendar event for the owner / key holder. */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string; id: string }> }) {
  const { tenantId, id } = await params;
  if (!isUuid(id)) return new Response("not found", { status: 404 });
  const key = new URL(req.url).searchParams.get("k");
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) return new Response("not found", { status: 404 });
  const customer = await getCurrentCustomer(tenantId);
  const detail = await tenantTx(tenantId, (tx) => getBookingForCustomer(tx, tenantId, id, { customerId: customer?.id, key }));
  if (!detail) return new Response("not found", { status: 404 });

  const { booking, service, staff } = detail;
  const host = await currentHost();
  const proto = host.includes("localhost") ? "http" : "https";
  const url = `${proto}://${host}/bookings/${booking.id}${key ? `?k=${encodeURIComponent(key)}` : ""}`;
  const contact = (runtime.config.settings.contact as { address?: string } | undefined) ?? {};
  const status = booking.status === "cancelled" || booking.status === "no_show" ? "CANCELLED" : booking.status === "pending" ? "TENTATIVE" : "CONFIRMED";
  const description = [`หมายเลขจอง ${booking.number}`, staff ? `ผู้ให้บริการ: ${staff.name}` : null, booking.note ? `หมายเหตุ: ${booking.note}` : null, url].filter(Boolean).join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RentWeb//Booking//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@${host.split(":")[0]}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(booking.startsAt)}`,
    `DTEND:${icsStamp(booking.endsAt)}`,
    `SUMMARY:${esc(`${service.name} – ${runtime.config.name}`)}`,
    `DESCRIPTION:${esc(description)}`,
    contact.address ? `LOCATION:${esc(contact.address)}` : null,
    `URL:${url}`,
    `STATUS:${status}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`อีก 2 ชั่วโมงถึงนัด ${service.name}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => !!l);

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${booking.number}.ics"`,
      "cache-control": "no-store",
    },
  });
}
