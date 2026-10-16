import "server-only";
import { auditLogs, desc, eq, eventsOutbox, getAdminDb, tenantDomains } from "@rentweb/db";
import { daysAgo, startOfTodayBangkok } from "@/lib/format";
import { tenantTx, type TenantCtx } from "@/lib/tenant";
import { computeKpis, type Kpis } from "./kpis";

export type { Kpis } from "./kpis";

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

export async function getDashboardData(ctx: TenantCtx): Promise<DashboardData> {
  const tenantId = ctx.tenant.id;
  const today = startOfTodayBangkok();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const since7 = daysAgo(7);
  const hasCommerce = ctx.modules.includes("commerce");
  const hasBooking = ctx.modules.includes("booking");
  const hasTopup = ctx.modules.includes("topup");
  const hasRestaurant = ctx.modules.includes("restaurant");
  const createdCutoff = new Date(ctx.tenant.createdAt.getTime() + 5 * 60_000);

  const kpiPromise = tenantTx(tenantId, (tx) => computeKpis(tx, { tenantId, modules: ctx.modules, today, tomorrow, since7, createdCutoff }));

  const db = getAdminDb();
  const [domainsRows, audits, events] = await Promise.all([
    db.select({ kind: tenantDomains.kind }).from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
    db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId)).orderBy(desc(auditLogs.createdAt)).limit(8),
    db.select().from(eventsOutbox).where(eq(eventsOutbox.tenantId, tenantId)).orderBy(desc(eventsOutbox.createdAt)).limit(8),
  ]);
  const { kpis, realItem } = await kpiPromise;

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
    { key: "content", label: "เพิ่มรายการจริงอย่างน้อย 1 รายการ", description: "สินค้า บริการ เมนูอาหาร หรือเกมของคุณเอง แทนข้อมูลตัวอย่าง", done: realItem || !!steps.content, href: hasCommerce ? `${base}/products` : hasRestaurant ? `${base}/restaurant/menu` : hasBooking ? `${base}/services` : hasTopup ? `${base}/topup/games` : `${base}/pages` },
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
  "tenant.self.suspend": "ระงับเว็บไซต์ชั่วคราว",
  "tenant.self.reactivate": "เปิดใช้งานเว็บไซต์อีกครั้ง",
  "tenant.self.cancel": "ยกเลิกเว็บไซต์",
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
