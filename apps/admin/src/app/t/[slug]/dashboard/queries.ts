import "server-only";
import { and, auditLogs, bookings, count, customers, desc, eq, eventsOutbox, gte, getAdminDb, inArray, lt, orders, products, services, sum, tenantDomains, topupOrders, games } from "@rentweb/db";
import { daysAgo, startOfTodayBangkok } from "@/lib/format";
import { tenantTx, type TenantCtx } from "@/lib/tenant";

export interface Kpis {
  ordersToday: number | null;
  revenueToday: number | null; // satang
  pendingSlips: number | null;
  bookingsToday: number | null;
  topupsToday: number | null;
  topupQueue: number | null;
  newCustomers7d: number;
}

export interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
}

export interface ActivityItem {
  id: string;
  kind: "audit" | "event";
  title: string;
  at: Date;
}

export interface DashboardData {
  kpis: Kpis;
  checklist: ChecklistItem[];
  progress: number;
  activity: ActivityItem[];
}

const num = (v: unknown) => Number(v ?? 0);

export async function getDashboardData(ctx: TenantCtx): Promise<DashboardData> {
  const tenantId = ctx.tenant.id;
  const today = startOfTodayBangkok();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const since7 = daysAgo(7);
  const hasCommerce = ctx.modules.includes("commerce");
  const hasBooking = ctx.modules.includes("booking");
  const hasTopup = ctx.modules.includes("topup");
  const createdCutoff = new Date(ctx.tenant.createdAt.getTime() + 5 * 60_000);

  const kpiPromise = tenantTx(tenantId, async (tx) => {
    const k: Kpis = { ordersToday: null, revenueToday: null, pendingSlips: null, bookingsToday: null, topupsToday: null, topupQueue: null, newCustomers7d: 0 };
    let realItem = false;

    if (hasCommerce) {
      const [o] = await tx.select({ c: count(), s: sum(orders.total) }).from(orders).where(and(eq(orders.tenantId, tenantId), gte(orders.placedAt, today)));
      k.ordersToday = num(o?.c);
      const [paid] = await tx
        .select({ s: sum(orders.total) })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), gte(orders.placedAt, today), eq(orders.paymentStatus, "paid")));
      k.revenueToday = num(paid?.s);
      const [slips] = await tx.select({ c: count() }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.paymentStatus, "pending_verification")));
      k.pendingSlips = num(slips?.c);
      const [p] = await tx.select({ c: count() }).from(products).where(and(eq(products.tenantId, tenantId), gte(products.createdAt, createdCutoff)));
      realItem ||= num(p?.c) > 0;
    }
    if (hasBooking) {
      const [b] = await tx
        .select({ c: count() })
        .from(bookings)
        .where(and(eq(bookings.tenantId, tenantId), gte(bookings.startsAt, today), lt(bookings.startsAt, tomorrow), inArray(bookings.status, ["pending", "confirmed", "checked_in", "in_progress", "completed"])));
      k.bookingsToday = num(b?.c);
      const [sv] = await tx.select({ c: count() }).from(services).where(and(eq(services.tenantId, tenantId), gte(services.createdAt, createdCutoff)));
      realItem ||= num(sv?.c) > 0;
    }
    if (hasTopup) {
      const [t] = await tx.select({ c: count(), s: sum(topupOrders.price) }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), gte(topupOrders.placedAt, today)));
      k.topupsToday = num(t?.c);
      if (!hasCommerce) {
        const [paid] = await tx
          .select({ s: sum(topupOrders.price) })
          .from(topupOrders)
          .where(and(eq(topupOrders.tenantId, tenantId), gte(topupOrders.placedAt, today), inArray(topupOrders.status, ["paid", "processing", "fulfilled"])));
        k.revenueToday = num(paid?.s);
      }
      const [q] = await tx.select({ c: count() }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), inArray(topupOrders.status, ["paid", "processing"])));
      k.topupQueue = num(q?.c);
      const [g] = await tx.select({ c: count() }).from(games).where(and(eq(games.tenantId, tenantId), gte(games.createdAt, createdCutoff)));
      realItem ||= num(g?.c) > 0;
    }
    const [c] = await tx.select({ c: count() }).from(customers).where(and(eq(customers.tenantId, tenantId), gte(customers.createdAt, since7)));
    k.newCustomers7d = num(c?.c);
    return { k, realItem };
  });

  const db = getAdminDb();
  const [domainsRows, audits, events] = await Promise.all([
    db.select({ kind: tenantDomains.kind }).from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
    db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId)).orderBy(desc(auditLogs.createdAt)).limit(8),
    db.select().from(eventsOutbox).where(eq(eventsOutbox.tenantId, tenantId)).orderBy(desc(eventsOutbox.createdAt)).limit(8),
  ]);
  const { k: kpis, realItem } = await kpiPromise;

  const theme = (ctx.tenant.theme ?? {}) as Record<string, unknown>;
  const brand = (theme.brand ?? {}) as Record<string, unknown>;
  const colors = (theme.colors ?? {}) as Record<string, unknown>;
  const fonts = (theme.fonts ?? {}) as Record<string, unknown>;
  const settings = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
  const payments = (settings.payments ?? {}) as Record<string, unknown>;
  const contact = (settings.contact ?? {}) as Record<string, unknown>;
  const steps = ((ctx.tenant.onboarding ?? {}) as { steps?: Record<string, boolean> }).steps ?? {};
  const base = `/t/${ctx.tenant.slug}`;

  const checklist: ChecklistItem[] = [
    { key: "logo", label: "อัปโหลดโลโก้", description: "โลโก้แสดงบนส่วนหัวและแท็บเบราว์เซอร์", done: !!brand.logo || !!steps.logo, href: `${base}/design#brand` },
    { key: "theme", label: "ปรับสีและธีม", description: "เลือก preset หรือปรับสีหลักให้เข้ากับแบรนด์", done: Object.keys(colors).length > 0 || Object.keys(fonts).length > 0 || !!steps.theme, href: `${base}/design` },
    { key: "content", label: "เพิ่มรายการจริงอย่างน้อย 1 รายการ", description: "สินค้า บริการ หรือเกมของคุณเอง แทนข้อมูลตัวอย่าง", done: realItem || !!steps.content, href: hasCommerce ? `${base}/products` : hasBooking ? `${base}/services` : hasTopup ? `${base}/topup/games` : `${base}/pages` },
    { key: "payments", label: "ตั้งค่าช่องทางรับเงิน", description: "PromptPay ID หรือบัญชีธนาคารสำหรับรับโอน", done: !!payments.promptpayId || (Array.isArray(payments.bankAccounts) && payments.bankAccounts.length > 0) || !!steps.payments, href: `${base}/settings/payments` },
    { key: "line", label: "เชื่อม LINE", description: "ใส่ LINE ID เพื่อให้ลูกค้าติดต่อได้ทันที", done: !!contact.lineId || !!(settings.line as Record<string, unknown> | undefined)?.channelId || !!steps.line, href: `${base}/settings` },
    { key: "domain", label: "ตั้งค่าโดเมนส่วนตัว (ถ้ามี)", description: "เชื่อมโดเมนของคุณเอง เช่น www.myshop.com", done: domainsRows.some((d) => d.kind === "custom") || !!steps.domain, href: `${base}/settings/domains` },
  ];
  const progress = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);

  const activity: ActivityItem[] = [
    ...audits.map((a) => ({ id: a.id, kind: "audit" as const, title: describeAudit(a.action, a.actorType), at: a.createdAt })),
    ...events.map((e) => ({ id: e.id, kind: "event" as const, title: describeEvent(e.type), at: e.createdAt })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10);

  return { kpis, checklist, progress, activity };
}

const AUDIT_LABELS: Record<string, string> = {
  "tenant.create": "สร้างเว็บไซต์",
  "theme.update": "อัปเดตธีม",
  "page.create": "สร้างหน้าใหม่",
  "page.update": "บันทึกหน้าเว็บ",
  "page.publish": "เผยแพร่หน้าเว็บ",
  "page.delete": "ลบหน้าเว็บ",
  "navigation.update": "อัปเดตเมนูนำทาง",
  "media.upload": "อัปโหลดสื่อ",
  "media.delete": "ลบสื่อ",
  "settings.update": "อัปเดตการตั้งค่า",
  "payments.update": "อัปเดตการรับเงิน",
  "domain.add": "เพิ่มโดเมน",
  "domain.remove": "ลบโดเมน",
  "team.invite": "เชิญสมาชิกทีม",
  "team.role": "เปลี่ยนสิทธิ์สมาชิก",
  "team.remove": "ลบสมาชิกทีม",
  "tenant.status.change": "เปลี่ยนสถานะร้าน",
  "tenant.plan.change": "เปลี่ยนแพ็กเกจ",
  "tenant.trial.extend": "ขยายเวลาทดลองใช้",
  "superadmin.impersonate.start": "ผู้ดูแลแพลตฟอร์มเข้าดูหลังบ้าน",
  "superadmin.impersonate.stop": "ผู้ดูแลแพลตฟอร์มออกจากหลังบ้าน",
  "customer.update": "อัปเดตข้อมูลลูกค้า",
};

function describeAudit(action: string, actor: string): string {
  const label = AUDIT_LABELS[action] ?? action;
  return actor === "superadmin" ? `${label} (ผู้ดูแลแพลตฟอร์ม)` : label;
}

const EVENT_LABELS: Record<string, string> = {
  "order.created": "ออเดอร์ใหม่",
  "order.paid": "ชำระเงินออเดอร์แล้ว",
  "order.shipped": "จัดส่งออเดอร์แล้ว",
  "booking.created": "การจองใหม่",
  "booking.confirmed": "ยืนยันการจอง",
  "topup.created": "รายการเติมใหม่",
  "topup.fulfilled": "เติมสำเร็จ",
  "payment.slip_uploaded": "ลูกค้าแนบสลิป",
  "payment.paid": "ได้รับชำระเงิน",
  "customer.created": "ลูกค้าใหม่สมัคร",
};

function describeEvent(type: string): string {
  return EVENT_LABELS[type] ?? type;
}
