import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { bookings, customers, diningTables, eventsOutbox, formSubmissions, forms, orders, reservations, restaurantOrders, services, staff, tenantMembers, tenants, user, type Tx } from "@rentweb/db";
import { thb } from "@rentweb/core/money";
import { formatDate, isUuid } from "@rentweb/core";
import { rootDomain } from "@rentweb/core/env";
import { flexReceipt } from "../line";
import { notify } from "../notify";
import { verifyTenantDomain } from "../domains";

export interface OutboxEvent {
  id: string;
  tenantId: string | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

type Handler = (tx: Tx, event: OutboxEvent) => Promise<void | { retryInSeconds: number }>;

/** E-mail of the tenant's owner account (first owner, verified addresses first; banned accounts skipped). */
async function ownerAccountEmail(tx: Tx, tenantId: string): Promise<string | null> {
  const [row] = await tx
    .select({ email: user.email })
    .from(tenantMembers)
    .innerJoin(user, eq(user.id, tenantMembers.userId))
    .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.role, "owner"), eq(user.banned, false)))
    .orderBy(desc(user.emailVerified), asc(tenantMembers.joinedAt))
    .limit(1);
  return row?.email?.trim() || null;
}

async function tenantInfo(tx: Tx, tenantId: string) {
  const [t] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) return null;
  const settings = (t.settings ?? {}) as Record<string, any>;
  const theme = (t.theme ?? {}) as Record<string, any>;
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const host = process.env.PLATFORM_ROOT_DOMAIN ?? "localhost:3000";
  // shop contact e-mail (public, editable in settings); new tenants start with it blank → the owner's account e-mail
  const contactEmail = typeof settings.contact?.email === "string" ? settings.contact.email.trim() : "";
  return {
    row: t,
    name: t.name,
    origin: `${proto}://${t.slug}.${host}`,
    ownerEmail: (contactEmail || (await ownerAccountEmail(tx, tenantId))) ?? undefined,
    ownerLine: settings.notifications?.ownerLineUserId as string | undefined,
    accent: (theme.colors?.primary as string | undefined) ?? "#2563EB",
    settings,
  };
}

/**
 * Who gets a customer message: the contact typed on the order / booking / reservation (`typed`) wins — guest
 * customer rows are keyed by one contact only (SS-02), so the record's other field can be stale or unverified;
 * the customer record fills the gaps and supplies the LINE user id.
 */
async function customerTarget(tx: Tx, customerId: string | null | undefined, typed: { email?: string | null; phone?: string | null } = {}) {
  const email = typed.email?.trim() || null;
  const phone = typed.phone?.trim() || null;
  if (!customerId) return { email, phone, lineUserId: null };
  const [c] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  return { email: email ?? c?.email ?? null, phone: phone ?? c?.phone ?? null, lineUserId: c?.lineUserId ?? null };
}

const str = (v: unknown, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
/** first non-empty string */
const pick = (...vals: unknown[]) => {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v;
  return "";
};
const withKey = (href: string, key: unknown) => (typeof key === "string" && key ? `${href}?k=${encodeURIComponent(key)}` : href);

/*
 * Send-time loaders: handlers render from the CURRENT row (not only the event payload), so old or thin
 * payloads still produce complete messages (number, names, satang amounts, guest access link) and a target
 * that was cancelled / rescheduled after the event was queued gets no stale message.
 */

async function loadOrder(tx: Tx, tenantId: string, orderId: unknown) {
  const id = str(orderId);
  if (!isUuid(id)) return null;
  const [o] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, id))).limit(1);
  if (!o) return null;
  return { row: o, accessKey: ((o.metadata ?? {}) as { accessKey?: string }).accessKey ?? null };
}

async function loadBooking(tx: Tx, tenantId: string, bookingId: unknown) {
  const id = str(bookingId);
  if (!isUuid(id)) return null;
  const [b] = await tx.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, id))).limit(1);
  if (!b) return null;
  const [svc] = await tx.select({ name: services.name }).from(services).where(and(eq(services.tenantId, tenantId), eq(services.id, b.serviceId))).limit(1);
  const [st] = b.staffId ? await tx.select({ name: staff.name }).from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, b.staffId))).limit(1) : [];
  return { row: b, serviceName: svc?.name ?? null, staffName: st?.name ?? null, accessKey: ((b.answers ?? {}) as { accessKey?: string }).accessKey ?? null };
}

async function tableName(tx: Tx, tenantId: string, tableId: unknown): Promise<string> {
  const id = str(tableId);
  if (!isUuid(id)) return "";
  const [t] = await tx.select({ name: diningTables.name }).from(diningTables).where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.id, id))).limit(1);
  return t?.name ?? "";
}

const ORDER_CLOSED = new Set(["cancelled", "refunded"]);
const BOOKING_LIVE = new Set(["pending", "confirmed"]);

/**
 * Event → side effects. Payload shapes are produced by the modules (see their services); handlers also load
 * the current row by id (see loaders above). Handlers must be idempotent; the outbox may retry them.
 */
export const HANDLERS: Record<string, Handler> = {
  async "order.paid"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const o = await loadOrder(tx, ev.tenantId!, p.orderId);
    if (o && (ORDER_CLOSED.has(o.row.status) || o.row.paymentStatus === "refunded")) return; // cancelled / refunded since
    const target = await customerTarget(tx, o?.row.customerId ?? (str(p.customerId) || null), { email: pick(o?.row.email, p.email) || null, phone: pick(o?.row.phone, p.phone) || null });
    const number = pick(o?.row.number, p.number);
    const total = o ? o.row.total : num(p.total);
    const link = withKey(`${t.origin}/orders/${str(p.orderId)}`, o?.accessKey ?? p.accessKey);
    await notify(tx, target, {
      title: `ยืนยันคำสั่งซื้อ ${number}`,
      text: `ขอบคุณที่สั่งซื้อกับ ${t.name} เราได้รับชำระเงิน ${thb(total)} แล้ว กำลังเตรียมจัดส่ง`,
      line: flexReceipt({ brand: t.name, title: "ชำระเงินสำเร็จ", subtitle: `คำสั่งซื้อ ${number}`, rows: [{ label: "ยอดชำระ", value: thb(total), bold: true }, { label: "สถานะ", value: "กำลังเตรียมจัดส่ง" }], button: { label: "ดูคำสั่งซื้อ", uri: link }, color: t.accent }),
      cta: { label: "ดูคำสั่งซื้อ", href: link },
    }, { tenantId: ev.tenantId, template: "order.paid", brand: t.name, accent: t.accent, payload: { orderId: p.orderId, link } });
    // shop owner
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, {
      title: `มีคำสั่งซื้อใหม่ ${number} (${thb(total)})`,
      text: `ลูกค้า ${pick(o?.row.customerName, p.customerName) || "-"} ชำระเงินแล้ว ${thb(total)} ตรวจสอบและจัดส่งได้ที่หลังบ้าน`,
    }, { tenantId: ev.tenantId, template: "order.paid.owner", brand: t.name, accent: t.accent, channels: ["line", "email"] });
  },

  async "order.created"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const o = await loadOrder(tx, ev.tenantId!, p.orderId);
    const method = pick(p.paymentMethod, (o?.row.metadata as { paymentMethod?: string } | undefined)?.paymentMethod);
    if ((method === "cod" || method === "cash") && !(o && ORDER_CLOSED.has(o.row.status))) {
      const target = await customerTarget(tx, o?.row.customerId ?? (str(p.customerId) || null), { email: pick(o?.row.email, p.email) || null, phone: pick(o?.row.phone, p.phone) || null });
      const link = withKey(`${t.origin}/orders/${str(p.orderId)}`, o?.accessKey ?? p.accessKey);
      const total = o ? o.row.total : num(p.total);
      await notify(tx, target, { title: `รับคำสั่งซื้อ ${pick(o?.row.number, p.number)} แล้ว`, text: `${t.name} ได้รับคำสั่งซื้อของคุณแล้ว ชำระเงิน ${thb(total)} เมื่อได้รับสินค้า`, cta: { label: "ดูคำสั่งซื้อ", href: link } }, { tenantId: ev.tenantId, template: "order.created", brand: t.name, accent: t.accent, payload: { orderId: p.orderId, link } });
    }
  },

  async "order.shipped"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const o = await loadOrder(tx, ev.tenantId!, p.orderId);
    const target = await customerTarget(tx, o?.row.customerId ?? (str(p.customerId) || null), { email: pick(o?.row.email, p.email) || null, phone: pick(o?.row.phone, p.phone) || null });
    const link = withKey(`${t.origin}/orders/${str(p.orderId)}`, o?.accessKey ?? p.accessKey);
    const number = pick(o?.row.number, p.number);
    await notify(tx, target, {
      title: `จัดส่งแล้ว ${number}`,
      text: `พัสดุของคุณถูกส่งแล้วโดย ${str(p.carrier, "-")} เลขพัสดุ ${str(p.trackingNumber, "-")}`,
      line: flexReceipt({ brand: t.name, title: "จัดส่งแล้ว 🚚", subtitle: `คำสั่งซื้อ ${number}`, rows: [{ label: "ขนส่ง", value: str(p.carrier, "-") }, { label: "เลขพัสดุ", value: str(p.trackingNumber, "-"), bold: true }], button: { label: "ติดตามพัสดุ", uri: str(p.trackingUrl) || link }, color: t.accent }),
      cta: { label: "ติดตามพัสดุ", href: str(p.trackingUrl) || link },
    }, { tenantId: ev.tenantId, template: "order.shipped", brand: t.name, accent: t.accent });
  },

  async "booking.created"(tx, ev) {
    return HANDLERS["booking.confirmed"]!(tx, ev);
  },

  async "booking.confirmed"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const bk = await loadBooking(tx, ev.tenantId!, p.bookingId);
    if (bk && !BOOKING_LIVE.has(bk.row.status)) return; // cancelled / moved before we sent anything
    const startsAt = bk ? bk.row.startsAt.toISOString() : str(p.startsAt);
    const serviceName = pick(bk?.serviceName, p.serviceName);
    const staffName = pick(bk?.staffName, p.staffName);
    const customerName = pick(bk?.row.customerName, p.customerName);
    const target = await customerTarget(tx, bk?.row.customerId ?? (str(p.customerId) || null), { email: pick(bk?.row.customerEmail, p.customerEmail) || null, phone: pick(bk?.row.customerPhone, p.customerPhone) || null });
    const when = startsAt ? formatDate(startsAt, { withTime: true }) : "-";
    const link = withKey(`${t.origin}/bookings/${str(p.bookingId)}`, bk?.accessKey ?? p.accessKey);
    // which message this event represents comes from the event itself (a booking.created that is processed after
    // the deposit was paid must not schedule reminders a second time — booking.confirmed does that)
    const confirmed = p.status === "confirmed" || ev.type === "booking.confirmed";
    await notify(tx, target, {
      title: confirmed ? `ยืนยันการจอง ${str(p.number)}` : `รับการจอง ${str(p.number)} แล้ว รอชำระมัดจำ`,
      text: `${serviceName || "บริการ"}${staffName ? ` กับ ${staffName}` : ""} ที่ ${t.name} วันที่ ${when}`,
      line: flexReceipt({ brand: t.name, title: confirmed ? "ยืนยันการจองแล้ว" : "รอชำระมัดจำ", subtitle: str(p.number), rows: [{ label: "บริการ", value: serviceName || "-" }, { label: "ผู้ให้บริการ", value: staffName || "-" }, { label: "วัน-เวลา", value: when, bold: true }], button: { label: "ดูการจอง", uri: link }, color: t.accent }),
      cta: { label: "ดูการจอง", href: link },
    }, { tenantId: ev.tenantId, template: ev.type, brand: t.name, accent: t.accent, payload: { bookingId: p.bookingId, link } });

    // schedule reminders (24h and 2h before) for the booking's CURRENT time; idempotent per booking + offset
    if (confirmed && startsAt && !p._reminderScheduled && (!bk || bk.row.status === "confirmed")) {
      const start = new Date(startsAt).getTime();
      for (const hours of [24, 2]) {
        const at = start - hours * 3_600_000;
        if (at <= Date.now() + 60_000) continue;
        const [dup] = await tx
          .select({ id: eventsOutbox.id })
          .from(eventsOutbox)
          .where(and(eq(eventsOutbox.type, "booking.reminder"), inArray(eventsOutbox.status, ["pending", "processing"]), sql`${eventsOutbox.payload}->>'bookingId' = ${str(p.bookingId)}`, sql`${eventsOutbox.payload}->>'hoursBefore' = ${String(hours)}`))
          .limit(1);
        if (dup) continue;
        await tx.insert(eventsOutbox).values({ tenantId: ev.tenantId, type: "booking.reminder", payload: { bookingId: p.bookingId, number: p.number, startsAt, customerId: bk?.row.customerId ?? p.customerId ?? null, hoursBefore: hours, _reminderScheduled: true }, nextRunAt: new Date(at) });
      }
    }
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `การจองใหม่ ${str(p.number)}`, text: `${customerName || "ลูกค้า"} จอง ${serviceName || "-"}${staffName ? ` กับ ${staffName}` : ""} ${when}` }, { tenantId: ev.tenantId, template: "booking.owner", brand: t.name, channels: ["line", "email"] });
  },

  async "booking.reminder"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const bk = await loadBooking(tx, ev.tenantId!, p.bookingId);
    // COR-14: no reminder for a booking that is gone, cancelled / no-show, or moved to another time
    if (!bk || !BOOKING_LIVE.has(bk.row.status)) return;
    if (p.startsAt && new Date(str(p.startsAt)).getTime() !== bk.row.startsAt.getTime()) return;
    const target = await customerTarget(tx, bk.row.customerId, { email: bk.row.customerEmail, phone: bk.row.customerPhone });
    const when = formatDate(bk.row.startsAt.toISOString(), { withTime: true });
    const link = withKey(`${t.origin}/bookings/${bk.row.id}`, bk.accessKey);
    await notify(
      tx,
      target,
      { title: `เตือนนัด ${bk.serviceName ?? ""} ${num(p.hoursBefore) >= 24 ? "พรุ่งนี้" : "อีก 2 ชั่วโมง"}`.replace(/\s+/g, " "), text: `${t.name} — ${bk.serviceName ? `${bk.serviceName} ` : ""}${when} หากต้องการเลื่อนกรุณาแจ้งล่วงหน้า`, cta: { label: "ดูการจอง", href: link } },
      { tenantId: ev.tenantId, template: "booking.reminder", brand: t.name, accent: t.accent, payload: { bookingId: bk.row.id, link } },
    );
  },

  async "booking.cancelled"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const bk = await loadBooking(tx, ev.tenantId!, p.bookingId);
    const target = await customerTarget(tx, bk?.row.customerId ?? (str(p.customerId) || null), { email: pick(bk?.row.customerEmail, p.customerEmail) || null, phone: pick(bk?.row.customerPhone, p.customerPhone) || null });
    await notify(tx, target, { title: `ยกเลิกการจอง ${str(p.number)}`, text: `การจอง${bk?.serviceName ? ` ${bk.serviceName}` : ""}ของคุณกับ ${t.name} ถูกยกเลิกแล้ว${p.reason ? ` (${str(p.reason)})` : ""}` }, { tenantId: ev.tenantId, template: "booking.cancelled", brand: t.name });
  },

  async "topup.fulfilled"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const target = await customerTarget(tx, str(p.customerId) || null, { phone: str(p.contact) || null });
    const link = `${t.origin}/topup/${str(p.number)}`;
    await notify(tx, target, {
      title: `เติมสำเร็จ ${str(p.number)}`,
      text: `${str(p.gameName)} · ${str(p.packageName)} เข้าแล้ว ขอบคุณที่ใช้บริการ ${t.name}`,
      line: flexReceipt({ brand: t.name, title: "เติมสำเร็จ ⚡", subtitle: str(p.number), rows: [{ label: "เกม", value: str(p.gameName) }, { label: "แพ็กเกจ", value: str(p.packageName), bold: true }], button: { label: "ดูรายการ", uri: link }, color: t.accent }),
      cta: { label: "ดูรายการ", href: link },
    }, { tenantId: ev.tenantId, template: "topup.fulfilled", brand: t.name, accent: t.accent });
  },

  async "topup.failed"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const target = await customerTarget(tx, str(p.customerId) || null, { phone: str(p.contact) || null });
    await notify(tx, target, { title: `เติมไม่สำเร็จ ${str(p.number)}`, text: `ขออภัย รายการไม่สำเร็จ (${str(p.reason, "-")}) ${p.refunded ? "ระบบคืนเงินเข้ากระเป๋าแล้ว" : "ทีมงานจะติดต่อกลับ"}` }, { tenantId: ev.tenantId, template: "topup.failed", brand: t.name });
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `รายการเติมล้มเหลว ${str(p.number)}`, text: str(p.reason, "-") }, { tenantId: ev.tenantId, template: "topup.failed.owner", brand: t.name, channels: ["line", "email"] });
  },

  async "topup.paid"(tx, ev) {
    // manual fulfilment queue → tell the shop
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t || ev.payload.fulfillment !== "manual") return;
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `คิวเติมมือใหม่ ${str(ev.payload.number)}`, text: `${str(ev.payload.gameName)} · ${str(ev.payload.packageName)} รอการเติมในหลังบ้าน` }, { tenantId: ev.tenantId, template: "topup.manual", brand: t.name, channels: ["line", "email"] });
  },

  async "rest_order.paid"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const id = str(p.orderId);
    const [o] = isUuid(id) ? await tx.select().from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, ev.tenantId!), eq(restaurantOrders.id, id))).limit(1) : [];
    const amount = p.amount != null ? num(p.amount) : p.total != null ? num(p.total) : (o?.total ?? 0);
    const type = pick(o?.type, p.type);
    const kind = type === "pickup" ? "รับที่ร้าน" : type === "delivery" ? "จัดส่ง" : "ทานที่ร้าน";
    const table = type === "dine_in" ? await tableName(tx, ev.tenantId!, o?.tableId ?? p.tableId) : "";
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `ออเดอร์ ${pick(o?.number, p.number)} ชำระแล้ว`, text: `ยอด ${thb(amount)} (${kind}${table ? ` โต๊ะ ${table}` : ""})` }, { tenantId: ev.tenantId, template: "rest_order.paid", brand: t.name, channels: ["line", "email"] });
  },

  async "rest_order.ready"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const target = await customerTarget(tx, str(p.customerId) || null, { phone: str(p.customerPhone) || null });
    await notify(tx, target, { title: `ออเดอร์ ${str(p.number)} พร้อมรับแล้ว`, text: `มารับได้เลยที่ ${t.name}` }, { tenantId: ev.tenantId, template: "rest_order.ready", brand: t.name });
  },

  async "table.call_staff"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const table = pick(p.tableName) || (await tableName(tx, ev.tenantId!, p.tableId));
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `โต๊ะ ${table || "-"} เรียกพนักงาน`, text: pick(p.note, p.reason) || "ลูกค้าเรียกพนักงาน" }, { tenantId: ev.tenantId, template: "table.call_staff", brand: t.name, channels: ["line"] });
  },

  async "table.bill_requested"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const table = pick(p.tableName) || (await tableName(tx, ev.tenantId!, p.tableId));
    const total = p.amount != null ? num(p.amount) : num(p.total);
    const method = str(p.method);
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `โต๊ะ ${table || "-"} ขอบิล`, text: `ยอดรวม ${thb(total)}${method === "promptpay_qr" ? " (ชำระผ่าน PromptPay)" : method === "cash" ? " (ชำระเงินสด)" : ""}` }, { tenantId: ev.tenantId, template: "table.bill_requested", brand: t.name, channels: ["line"] });
  },

  async "reservation.created"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const id = str(p.reservationId);
    const [r] = isUuid(id) ? await tx.select().from(reservations).where(and(eq(reservations.tenantId, ev.tenantId!), eq(reservations.id, id))).limit(1) : [];
    if (r && (r.status === "cancelled" || r.status === "no_show")) return;
    const startsAt = r ? r.startsAt.toISOString() : str(p.startsAt);
    const when = startsAt ? formatDate(startsAt, { withTime: true }) : "-";
    const partySize = r?.partySize ?? num(p.partySize);
    const phone = pick(r?.phone, p.phone);
    const link = `${t.origin}/reservations/${encodeURIComponent(pick(r?.number, p.number))}${phone ? `?p=${encodeURIComponent(phone)}` : ""}`;
    await notify(tx, { phone: phone || null, email: pick(r?.email, p.email) || null }, { title: `ยืนยันการจองโต๊ะ ${pick(r?.number, p.number)}`, text: `${t.name} — ${when} จำนวน ${partySize} ท่าน`, cta: { label: "ดูการจอง", href: link } }, { tenantId: ev.tenantId, template: "reservation.created", brand: t.name });
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `จองโต๊ะใหม่ ${pick(r?.number, p.number)}`, text: `${pick(r?.name, p.name) || "ลูกค้า"} ${partySize} ท่าน ${when}${phone ? ` โทร ${phone}` : ""}` }, { tenantId: ev.tenantId, template: "reservation.owner", brand: t.name, channels: ["line", "email"] });
  },

  async "payment.slip_uploaded"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: "มีสลิปรอตรวจสอบ", text: `${str(ev.payload.refType)} ${str(ev.payload.refId).slice(0, 8)}${ev.payload.amount != null ? ` ยอด ${thb(num(ev.payload.amount))}` : ""} — ตรวจสอบที่หลังบ้าน` }, { tenantId: ev.tenantId, template: "payment.slip_uploaded", brand: t.name, channels: ["line", "email"] });
  },

  /** markPaid() received money for a target that was already cancelled / refunded (or the module refused it). */
  async "payment.refund_required"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    await notify(
      tx,
      { email: t.ownerEmail, lineUserId: t.ownerLine },
      { title: `ต้องคืนเงินลูกค้า ${thb(num(p.amount))}`, text: `ได้รับชำระเงินสำหรับรายการที่ปิดไปแล้ว (${str(p.refType)} ${str(p.refId).slice(0, 8)}: ${str(p.reason, "-")}) กรุณาตรวจสอบและคืนเงินในหลังบ้าน` },
      { tenantId: ev.tenantId, template: "payment.refund_required", brand: t.name, channels: ["line", "email"], payload: { paymentId: p.paymentId } },
    );
  },

  async "form.submitted"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const [form] = await tx.select().from(forms).where(eq(forms.id, str(ev.payload.formId))).limit(1);
    const [sub] = await tx.select().from(formSubmissions).where(eq(formSubmissions.id, str(ev.payload.submissionId))).limit(1);
    const emails = form?.notifyEmails?.length ? form.notifyEmails : t.ownerEmail ? [t.ownerEmail] : [];
    const data = (sub?.data ?? {}) as Record<string, unknown>;
    const lines = Object.entries(data).map(([k, v]) => `${k}: ${String(v)}`).join("\n");
    for (const email of emails) {
      await notify(tx, { email }, { title: `ข้อความใหม่จากฟอร์ม "${form?.name ?? ev.payload.slug}"`, text: lines, html: `<pre style="font-family:inherit;white-space:pre-wrap">${lines.replace(/</g, "&lt;")}</pre>` }, { tenantId: ev.tenantId, template: "form.submitted", brand: t.name, channels: ["email"] });
    }
    if (t.ownerLine) await notify(tx, { lineUserId: t.ownerLine }, { title: "ข้อความใหม่จากเว็บไซต์", text: lines.slice(0, 500) }, { tenantId: ev.tenantId, template: "form.submitted", brand: t.name, channels: ["line"] });
  },

  async "domain.requested"(tx, ev) {
    const ok = await verifyTenantDomain(tx, str(ev.payload.domainId));
    if (ok) {
      const t = await tenantInfo(tx, ev.tenantId!);
      if (t) await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: "โดเมนของคุณพร้อมใช้งานแล้ว", text: `${str(ev.payload.hostname)} เชื่อมต่อสำเร็จ SSL จะพร้อมภายในไม่กี่นาที` }, { tenantId: ev.tenantId, template: "domain.active", brand: t.name });
      return;
    }
    // retry with growing backoff for up to ~72h
    const attempt = ev.attempts + 1;
    if (attempt < 60) return { retryInSeconds: Math.min(3600, 60 * attempt) };
  },

  async "tenant.provisioned"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const email = str(ev.payload.ownerEmail) || t.ownerEmail;
    if (!email) return;
    await notify(tx, { email }, { title: `ยินดีต้อนรับสู่ RentWeb — ${t.name} พร้อมแล้ว`, text: `เว็บไซต์ของคุณเปิดอยู่ที่ ${t.origin} เข้าหลังบ้านเพื่อปรับโลโก้ สี และเพิ่มสินค้า/บริการได้เลย`, cta: { label: "เปิดเว็บไซต์", href: t.origin } }, { tenantId: ev.tenantId, template: "tenant.provisioned", brand: "RentWeb", channels: ["email"] });
  },
};

export const IGNORED_EVENTS = new Set(["payment.created", "payment.paid", "payment.failed", "payment.refunded", "payment.cancelled", "payment.expired", "topup.processing", "booking.rescheduled"]);

