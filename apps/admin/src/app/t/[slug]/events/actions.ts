"use server";

import { revalidatePath } from "next/cache";
import { media } from "@rentweb/db";
import { audit, isUuid } from "@rentweb/core";
import { getStorage, MAX_UPLOAD_BYTES, objectKey, sniffImage } from "@rentweb/core/storage";
import {
  cancelUnpaidOrder,
  createEvent,
  createSession,
  createTicketType,
  deleteEvent,
  deleteSession,
  deleteTicketType,
  duplicateEvent,
  getEventById,
  listOrders,
  setEventStatus,
  updateEvent,
  updateSession,
  updateTicketType,
  type EventStatus,
} from "@rentweb/module-events/admin";
import { EVENT_ACTIONS, EVENT_ACTION_LABEL, type EventAdminAction } from "@rentweb/module-events/admin/labels";
import { eventInputSchema, fieldErrors, sessionInputSchema, ticketTypeInputSchema, type EventInput, type FormResult, type SessionInput, type TicketTypeInput } from "@rentweb/module-events/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf } from "./_lib";

function revalidate(slug: string, id?: string | null) {
  revalidatePath(`/t/${slug}/events`);
  revalidatePath(`/t/${slug}/events/checkin`);
  revalidatePath(`/t/${slug}/events/attendees`);
  revalidatePath(`/t/${slug}/events/orders`);
  revalidatePath(`/t/${slug}/dashboard`);
  if (id) revalidatePath(`/t/${slug}/events/${id}`);
}

/* ---------------------------------- events --------------------------------- */

export async function saveEventAction(slug: string, id: string | null, input: EventInput): Promise<FormResult<{ id: string; slug: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (id && !isUuid(id)) return { ok: false, error: "ไม่พบอีเวนต์" };
  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  try {
    const row = await tenantTx(ctx.tenant.id, async (tx) => {
      if (!id) return createEvent(tx, ctx.tenant.id, { ...parsed.data, status: "draft" });
      const { status: _ignored, ...rest } = parsed.data;
      return updateEvent(tx, ctx.tenant.id, id, rest);
    });
    if (!row) return { ok: false, error: "ไม่พบอีเวนต์" };
    revalidate(slug, row.id);
    return { ok: true, message: id ? "บันทึกอีเวนต์แล้ว" : "สร้างอีเวนต์แล้ว — เพิ่มรอบและประเภทบัตรต่อได้เลย", data: { id: row.id, slug: row.slug } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/events_tenant_slug_uq|duplicate key/i.test(msg)) return { ok: false, error: "slug นี้ถูกใช้แล้ว", fieldErrors: { slug: "slug นี้ถูกใช้แล้ว" } };
    throw e;
  }
}

const STATUS_OF: Record<EventAdminAction, EventStatus> = { publish: "published", unpublish: "draft", cancel: "cancelled", end: "ended", reopen: "published" };

/**
 * Publish / unpublish / end / cancel. Cancelling also cancels the event's unpaid orders (their tickets are released);
 * paid orders stay as they are so the owner can refund them one by one (the dialog warns about this).
 */
export async function setEventStatusAction(slug: string, id: string, action: EventAdminAction): Promise<FormResult<{ status: string; cancelledOrders: number }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id) || !(action in STATUS_OF)) return { ok: false, error: "คำสั่งไม่ถูกต้อง" };
  const r = await tenantTx(ctx.tenant.id, async (tx) => {
    const ev = await getEventById(tx, ctx.tenant.id, id);
    if (!ev) return null;
    if (!(EVENT_ACTIONS[ev.status] ?? []).includes(action)) return { error: `อีเวนต์อยู่ในสถานะที่${EVENT_ACTION_LABEL[action]}ไม่ได้` } as const;
    let cancelledOrders = 0;
    if (action === "cancel") {
      const pending = await listOrders(tx, ctx.tenant.id, { eventId: id, status: "pending", pageSize: 200 });
      for (const o of pending.items) {
        const c = await cancelUnpaidOrder(tx, ctx.tenant.id, o.order.id, { by: "admin", reason: "งานถูกยกเลิก", actorId: ctx.userId });
        if (c.ok) cancelledOrders++;
      }
    }
    const row = await setEventStatus(tx, ctx.tenant.id, id, STATUS_OF[action]);
    await audit(tx, { tenantId: ctx.tenant.id, actorType: actorOf(ctx).actorType, actorId: ctx.userId, action: `event.${action}`, targetType: "event", targetId: id, diff: { from: ev.status, to: STATUS_OF[action], cancelledOrders } });
    return row ? { status: row.status, cancelledOrders } : null;
  });
  if (!r) return { ok: false, error: "ไม่พบอีเวนต์" };
  if ("error" in r) return { ok: false, error: String(r.error) };
  revalidate(slug, id);
  const msg = action === "publish" ? "เผยแพร่อีเวนต์แล้ว — ลูกค้าเห็นบนหน้าร้านแล้ว" : action === "unpublish" ? "ซ่อนอีเวนต์จากหน้าร้านแล้ว (กลับเป็นฉบับร่าง)" : action === "end" ? "ปิดงานแล้ว" : action === "reopen" ? "เปิดงานอีกครั้งแล้ว" : `ยกเลิกงานแล้ว${r.cancelledOrders ? ` · ยกเลิกคำสั่งซื้อที่ยังไม่ชำระ ${r.cancelledOrders} รายการ` : ""} — คำสั่งซื้อที่ชำระแล้วต้องคืนเงินทีละรายการ`;
  return { ok: true, message: msg, data: r };
}

export async function deleteEventAction(slug: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบอีเวนต์" };
  const done = await tenantTx(ctx.tenant.id, (tx) => deleteEvent(tx, ctx.tenant.id, id));
  if (!done) return { ok: false, error: "ลบไม่ได้: อีเวนต์นี้มีคำสั่งซื้อแล้ว — ใช้ “ยกเลิกงาน” แทน" };
  revalidate(slug, id);
  return { ok: true, message: "ลบอีเวนต์แล้ว" };
}

export async function duplicateEventAction(slug: string, id: string): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(id)) return { ok: false, error: "ไม่พบอีเวนต์" };
  const row = await tenantTx(ctx.tenant.id, (tx) => duplicateEvent(tx, ctx.tenant.id, id));
  if (!row) return { ok: false, error: "ไม่พบอีเวนต์" };
  revalidate(slug, row.id);
  return { ok: true, message: "ทำสำเนาอีเวนต์แล้ว (ฉบับร่าง) — ปรับวันที่และราคาก่อนเผยแพร่", data: { id: row.id } };
}

/**
 * Cover / gallery upload: the bytes decide the type (sniffImage: JPG / PNG / WebP / GIF / AVIF, never SVG / HTML), stored
 * with the sniffed extension + MIME under the tenant's "events" folder and listed in the media library.
 */
export async function uploadEventImageAction(slug: string, fd: FormData): Promise<FormResult<{ url: string; mediaId: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกรูปภาพ" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImage(buf);
  if (!sniffed) return { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, AVIF)" };
  const key = objectKey(ctx.tenant.id, "events", `event.${sniffed.ext}`);
  const stored = await getStorage().put(key, buf, sniffed.mime);
  const [row] = await tenantTx(ctx.tenant.id, (tx) =>
    tx
      .insert(media)
      .values({ tenantId: ctx.tenant.id, key: stored.key, url: stored.url, mime: sniffed.mime, size: stored.size, folder: "/events", alt: file.name.replace(/\.[^.]+$/, "").slice(0, 200), createdBy: ctx.userId })
      .returning({ id: media.id }),
  );
  revalidatePath(`/t/${slug}/media`);
  return { ok: true, message: "อัปโหลดรูปแล้ว", data: { url: stored.url, mediaId: row!.id } };
}

/* --------------------------------- sessions -------------------------------- */

export async function saveSessionAction(slug: string, eventId: string, id: string | null, input: SessionInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(eventId) || (id && !isUuid(id))) return { ok: false, error: "ไม่พบรอบ" };
  const parsed = sessionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const row = await tenantTx(ctx.tenant.id, async (tx) => {
    const ev = await getEventById(tx, ctx.tenant.id, eventId);
    if (!ev) return null;
    return id ? updateSession(tx, ctx.tenant.id, id, parsed.data) : createSession(tx, ctx.tenant.id, eventId, parsed.data);
  });
  if (!row) return { ok: false, error: "ไม่พบอีเวนต์หรือรอบ" };
  revalidate(slug, eventId);
  return { ok: true, message: id ? "บันทึกรอบแล้ว" : "เพิ่มรอบแล้ว", data: { id: row.id } };
}

export async function setSessionStatusAction(slug: string, eventId: string, id: string, status: "scheduled" | "cancelled" | "ended"): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(eventId) || !isUuid(id)) return { ok: false, error: "ไม่พบรอบ" };
  const row = await tenantTx(ctx.tenant.id, (tx) => updateSession(tx, ctx.tenant.id, id, { status }));
  if (!row) return { ok: false, error: "ไม่พบรอบ" };
  revalidate(slug, eventId);
  return { ok: true, message: status === "cancelled" ? "ยกเลิกรอบแล้ว — บัตรของรอบนี้จะถูกปฏิเสธที่จุดเช็กอิน คืนเงินลูกค้าจากหน้าคำสั่งซื้อ" : status === "ended" ? "ปิดรอบแล้ว" : "เปิดรอบอีกครั้งแล้ว" };
}

export async function deleteSessionAction(slug: string, eventId: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(eventId) || !isUuid(id)) return { ok: false, error: "ไม่พบรอบ" };
  const done = await tenantTx(ctx.tenant.id, (tx) => deleteSession(tx, ctx.tenant.id, id));
  if (!done) return { ok: false, error: "ลบไม่ได้: รอบนี้มีบัตรที่ขายหรือจองไว้แล้ว — ใช้ “ยกเลิกรอบ” แทน" };
  revalidate(slug, eventId);
  return { ok: true, message: "ลบรอบแล้ว" };
}

/* ------------------------------- ticket types ------------------------------ */

export async function saveTicketTypeAction(slug: string, eventId: string, id: string | null, input: TicketTypeInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(eventId) || (id && !isUuid(id))) return { ok: false, error: "ไม่พบประเภทบัตร" };
  const parsed = ticketTypeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const row = await tenantTx(ctx.tenant.id, async (tx) => {
    const ev = await getEventById(tx, ctx.tenant.id, eventId);
    if (!ev) return null;
    return id ? updateTicketType(tx, ctx.tenant.id, id, parsed.data) : createTicketType(tx, ctx.tenant.id, eventId, parsed.data);
  });
  if (!row) return { ok: false, error: "ไม่พบอีเวนต์หรือประเภทบัตร" };
  revalidate(slug, eventId);
  return { ok: true, message: id ? "บันทึกประเภทบัตรแล้ว" : "เพิ่มประเภทบัตรแล้ว", data: { id: row.id } };
}

export async function setTicketTypeVisibilityAction(slug: string, eventId: string, id: string, visibility: "public" | "hidden"): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(eventId) || !isUuid(id)) return { ok: false, error: "ไม่พบประเภทบัตร" };
  const row = await tenantTx(ctx.tenant.id, (tx) => updateTicketType(tx, ctx.tenant.id, id, { visibility }));
  if (!row) return { ok: false, error: "ไม่พบประเภทบัตร" };
  revalidate(slug, eventId);
  return { ok: true, message: visibility === "hidden" ? "ซ่อนประเภทบัตรจากหน้าร้านแล้ว" : "แสดงประเภทบัตรบนหน้าร้านแล้ว" };
}

export async function deleteTicketTypeAction(slug: string, eventId: string, id: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(eventId) || !isUuid(id)) return { ok: false, error: "ไม่พบประเภทบัตร" };
  const done = await tenantTx(ctx.tenant.id, (tx) => deleteTicketType(tx, ctx.tenant.id, id));
  if (!done) return { ok: false, error: "ลบไม่ได้: ประเภทบัตรนี้มีบัตรที่ขายหรือจองไว้แล้ว — ใช้ “ซ่อน” แทน" };
  revalidate(slug, eventId);
  return { ok: true, message: "ลบประเภทบัตรแล้ว" };
}
