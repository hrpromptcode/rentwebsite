import { NextResponse } from "next/server";
import { isUuid } from "@rentweb/core";
import { getEventById, listAttendees, type TicketStatus } from "@rentweb/module-events/admin";
import { ATTENDEE_FILTERS, TICKET_STATUS } from "@rentweb/module-events/admin/labels";
import { bkkDateString, formatThaiDateTime, formatThaiSession } from "@rentweb/module-events/admin/ui";
import { getSession } from "@/lib/session";
import { getTenantCtx, tenantTx } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of the attendee list with the same filters as the page (UTF-8 BOM so Excel on Windows reads Thai). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("events")) return NextResponse.json({ error: "module disabled" }, { status: 404 });
  const url = new URL(req.url);
  const eventId = url.searchParams.get("event") ?? "";
  if (!isUuid(eventId)) return NextResponse.json({ error: "event required" }, { status: 400 });
  const sessionId = url.searchParams.get("session") || null;
  const status = ATTENDEE_FILTERS.find((f) => f.key === url.searchParams.get("status"))?.statuses as TicketStatus[] | null | undefined;
  const q = url.searchParams.get("q") || null;

  const { event, rows } = await tenantTx(ctx.tenant.id, async (tx) => {
    const event = await getEventById(tx, ctx.tenant.id, eventId);
    if (!event) return { event: null, rows: [] };
    const rows = [];
    for (let page = 1; page <= 50; page++) {
      const r = await listAttendees(tx, ctx.tenant.id, { eventId, sessionId: sessionId && isUuid(sessionId) ? sessionId : null, status: status ?? null, q, page, pageSize: 200 });
      rows.push(...r.items);
      if (rows.length >= r.total || r.items.length === 0) break;
    }
    return { event, rows };
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const header = ["ลำดับ", "รหัสบัตร", "ชื่อผู้ถือบัตร", "อีเมลผู้ถือบัตร", "ประเภทบัตร", "รอบ", "ที่นั่ง", "สถานะ", "เช็กอินเมื่อ", "คำสั่งซื้อ", "ผู้ซื้อ", "เบอร์โทร", "อีเมลผู้ซื้อ", "ราคา (บาท)"];
  const lines = rows.map((a, i) =>
    [
      i + 1,
      a.ticket.code,
      a.ticket.holderName,
      a.ticket.holderEmail,
      a.typeName,
      a.session ? `${a.session.name ? `${a.session.name} · ` : ""}${formatThaiSession(a.session.startsAt, a.session.endsAt)}` : "ทุกรอบ",
      a.ticket.seatLabel,
      TICKET_STATUS[a.ticket.status]?.label ?? a.ticket.status,
      a.ticket.checkedInAt ? formatThaiDateTime(a.ticket.checkedInAt) : "",
      a.order.number,
      a.order.contactName,
      a.order.contactPhone,
      a.order.contactEmail,
      (a.ticket.price / 100).toFixed(2),
    ]
      .map(csvCell)
      .join(","),
  );
  const body = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
  const name = `attendees-${event.slug}-${bkkDateString(new Date())}.csv`;
  // header values must be ISO-8859-1: Thai slugs go in filename* only, filename= gets an ASCII fallback
  const ascii = name.replace(/[^\x20-\x7e]+/g, "").replace(/"/g, "").replace(/-{2,}/g, "-") || "attendees.csv";
  return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "no-store" } });
}
