import { eq } from "drizzle-orm";
import { customers, eventsOutbox, formSubmissions, forms, tenants, type Tx } from "@rentweb/db";
import { thb } from "@rentweb/core/money";
import { formatDate } from "@rentweb/core";
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

async function tenantInfo(tx: Tx, tenantId: string) {
  const [t] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) return null;
  const settings = (t.settings ?? {}) as Record<string, any>;
  const theme = (t.theme ?? {}) as Record<string, any>;
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const host = process.env.PLATFORM_ROOT_DOMAIN ?? "localhost:3000";
  return {
    row: t,
    name: t.name,
    origin: `${proto}://${t.slug}.${host}`,
    ownerEmail: settings.contact?.email as string | undefined,
    ownerLine: settings.notifications?.ownerLineUserId as string | undefined,
    accent: (theme.colors?.primary as string | undefined) ?? "#2563EB",
    settings,
  };
}

async function customerTarget(tx: Tx, customerId: string | null | undefined, fallback: { email?: string | null; phone?: string | null } = {}) {
  if (!customerId) return { email: fallback.email ?? null, phone: fallback.phone ?? null, lineUserId: null };
  const [c] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  return { email: c?.email ?? fallback.email ?? null, phone: c?.phone ?? fallback.phone ?? null, lineUserId: c?.lineUserId ?? null };
}

const str = (v: unknown, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

/**
 * Event → side effects. Payload shapes are produced by the modules (see their services).
 * Handlers must be idempotent; the outbox may retry them.
 */
export const HANDLERS: Record<string, Handler> = {
  async "order.paid"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const target = await customerTarget(tx, str(p.customerId) || null, { email: str(p.email) || null, phone: str(p.phone) || null });
    const number = str(p.number, "");
    const total = num(p.total);
    const link = `${t.origin}/orders/${str(p.orderId)}${p.accessKey ? `?k=${str(p.accessKey)}` : ""}`;
    await notify(tx, target, {
      title: `ยืนยันคำสั่งซื้อ ${number}`,
      text: `ขอบคุณที่สั่งซื้อกับ ${t.name} เราได้รับชำระเงิน ${thb(total)} แล้ว กำลังเตรียมจัดส่ง`,
      line: flexReceipt({ brand: t.name, title: "ชำระเงินสำเร็จ", subtitle: `คำสั่งซื้อ ${number}`, rows: [{ label: "ยอดชำระ", value: thb(total), bold: true }, { label: "สถานะ", value: "กำลังเตรียมจัดส่ง" }], button: { label: "ดูคำสั่งซื้อ", uri: link }, color: t.accent }),
      cta: { label: "ดูคำสั่งซื้อ", href: link },
    }, { tenantId: ev.tenantId, template: "order.paid", brand: t.name, accent: t.accent, payload: { orderId: p.orderId } });
    // shop owner
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, {
      title: `มีคำสั่งซื้อใหม่ ${number} (${thb(total)})`,
      text: `ลูกค้า ${str(p.customerName, "-")} ชำระเงินแล้ว ${thb(total)} ตรวจสอบและจัดส่งได้ที่หลังบ้าน`,
    }, { tenantId: ev.tenantId, template: "order.paid.owner", brand: t.name, accent: t.accent, channels: ["line", "email"] });
  },

  async "order.created"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    if (p.paymentMethod === "cod" || p.paymentMethod === "cash") {
      const target = await customerTarget(tx, str(p.customerId) || null, { email: str(p.email) || null, phone: str(p.phone) || null });
      const link = `${t.origin}/orders/${str(p.orderId)}${p.accessKey ? `?k=${str(p.accessKey)}` : ""}`;
      await notify(tx, target, { title: `รับคำสั่งซื้อ ${str(p.number)} แล้ว`, text: `${t.name} ได้รับคำสั่งซื้อของคุณแล้ว ชำระเงิน ${thb(num(p.total))} เมื่อได้รับสินค้า`, cta: { label: "ดูคำสั่งซื้อ", href: link } }, { tenantId: ev.tenantId, template: "order.created", brand: t.name, accent: t.accent });
    }
  },

  async "order.shipped"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const target = await customerTarget(tx, str(p.customerId) || null, { email: str(p.email) || null, phone: str(p.phone) || null });
    const link = `${t.origin}/orders/${str(p.orderId)}${p.accessKey ? `?k=${str(p.accessKey)}` : ""}`;
    await notify(tx, target, {
      title: `จัดส่งแล้ว ${str(p.number)}`,
      text: `พัสดุของคุณถูกส่งแล้วโดย ${str(p.carrier, "-")} เลขพัสดุ ${str(p.trackingNumber, "-")}`,
      line: flexReceipt({ brand: t.name, title: "จัดส่งแล้ว 🚚", subtitle: `คำสั่งซื้อ ${str(p.number)}`, rows: [{ label: "ขนส่ง", value: str(p.carrier, "-") }, { label: "เลขพัสดุ", value: str(p.trackingNumber, "-"), bold: true }], button: { label: "ติดตามพัสดุ", uri: str(p.trackingUrl) || link }, color: t.accent }),
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
    const target = await customerTarget(tx, str(p.customerId) || null, { email: str(p.customerEmail) || null, phone: str(p.customerPhone) || null });
    const when = p.startsAt ? formatDate(str(p.startsAt), { withTime: true }) : "-";
    const link = `${t.origin}/bookings/${str(p.bookingId)}${p.accessKey ? `?k=${str(p.accessKey)}` : ""}`;
    const confirmed = p.status === "confirmed" || ev.type === "booking.confirmed";
    await notify(tx, target, {
      title: confirmed ? `ยืนยันการจอง ${str(p.number)}` : `รับการจอง ${str(p.number)} แล้ว รอชำระมัดจำ`,
      text: `${str(p.serviceName, "บริการ")} กับ ${str(p.staffName, t.name)} วันที่ ${when}`,
      line: flexReceipt({ brand: t.name, title: confirmed ? "ยืนยันการจองแล้ว" : "รอชำระมัดจำ", subtitle: str(p.number), rows: [{ label: "บริการ", value: str(p.serviceName, "-") }, { label: "ผู้ให้บริการ", value: str(p.staffName, "-") }, { label: "วัน-เวลา", value: when, bold: true }], button: { label: "ดูการจอง", uri: link }, color: t.accent }),
      cta: { label: "ดูการจอง", href: link },
    }, { tenantId: ev.tenantId, template: ev.type, brand: t.name, accent: t.accent });

    // schedule reminders (24h and 2h before) – idempotent via dedupe key in payload
    if (confirmed && p.startsAt && !p._reminderScheduled) {
      const start = new Date(str(p.startsAt)).getTime();
      for (const hours of [24, 2]) {
        const at = start - hours * 3_600_000;
        if (at > Date.now() + 60_000) {
          await tx.insert(eventsOutbox).values({ tenantId: ev.tenantId, type: "booking.reminder", payload: { ...p, hoursBefore: hours, _reminderScheduled: true }, nextRunAt: new Date(at) });
        }
      }
    }
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `การจองใหม่ ${str(p.number)}`, text: `${str(p.customerName, "ลูกค้า")} จอง ${str(p.serviceName, "-")} ${when}` }, { tenantId: ev.tenantId, template: "booking.owner", brand: t.name, channels: ["line", "email"] });
  },

  async "booking.reminder"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const target = await customerTarget(tx, str(p.customerId) || null, { email: str(p.customerEmail) || null, phone: str(p.customerPhone) || null });
    const when = p.startsAt ? formatDate(str(p.startsAt), { withTime: true }) : "-";
    await notify(tx, target, { title: `เตือนนัด ${str(p.serviceName, "")} ${num(p.hoursBefore) >= 24 ? "พรุ่งนี้" : "อีก 2 ชั่วโมง"}`, text: `${t.name} — ${when} หากต้องการเลื่อนกรุณาแจ้งล่วงหน้า` }, { tenantId: ev.tenantId, template: "booking.reminder", brand: t.name, accent: t.accent });
  },

  async "booking.cancelled"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const target = await customerTarget(tx, str(p.customerId) || null, { email: str(p.customerEmail) || null, phone: str(p.customerPhone) || null });
    await notify(tx, target, { title: `ยกเลิกการจอง ${str(p.number)}`, text: `การจองของคุณกับ ${t.name} ถูกยกเลิกแล้ว${p.reason ? ` (${str(p.reason)})` : ""}` }, { tenantId: ev.tenantId, template: "booking.cancelled", brand: t.name });
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
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `ออเดอร์ ${str(p.number)} ชำระแล้ว`, text: `ยอด ${thb(num(p.total))} (${str(p.type) === "pickup" ? "รับที่ร้าน" : "ทานที่ร้าน"})` }, { tenantId: ev.tenantId, template: "rest_order.paid", brand: t.name, channels: ["line", "email"] });
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
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `โต๊ะ ${str(ev.payload.tableName)} เรียกพนักงาน`, text: str(ev.payload.reason, "") }, { tenantId: ev.tenantId, template: "table.call_staff", brand: t.name, channels: ["line"] });
  },

  async "table.bill_requested"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `โต๊ะ ${str(ev.payload.tableName)} ขอบิล`, text: `ยอดรวม ${thb(num(ev.payload.total))}` }, { tenantId: ev.tenantId, template: "table.bill_requested", brand: t.name, channels: ["line"] });
  },

  async "reservation.created"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    const p = ev.payload;
    const when = p.startsAt ? formatDate(str(p.startsAt), { withTime: true }) : "-";
    await notify(tx, { phone: str(p.phone) || null, email: str(p.email) || null }, { title: `ยืนยันการจองโต๊ะ ${str(p.number)}`, text: `${t.name} — ${when} จำนวน ${num(p.partySize)} ท่าน` }, { tenantId: ev.tenantId, template: "reservation.created", brand: t.name });
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: `จองโต๊ะใหม่ ${str(p.number)}`, text: `${str(p.name)} ${num(p.partySize)} ท่าน ${when}` }, { tenantId: ev.tenantId, template: "reservation.owner", brand: t.name, channels: ["line", "email"] });
  },

  async "payment.slip_uploaded"(tx, ev) {
    const t = await tenantInfo(tx, ev.tenantId!);
    if (!t) return;
    await notify(tx, { email: t.ownerEmail, lineUserId: t.ownerLine }, { title: "มีสลิปรอตรวจสอบ", text: `${str(ev.payload.refType)} ${str(ev.payload.refId).slice(0, 8)} — ตรวจสอบที่หลังบ้าน` }, { tenantId: ev.tenantId, template: "payment.slip_uploaded", brand: t.name, channels: ["line", "email"] });
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

export const IGNORED_EVENTS = new Set(["payment.created", "payment.paid", "payment.failed", "payment.refunded", "topup.processing", "booking.rescheduled"]);
