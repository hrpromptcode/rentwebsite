import "server-only";
import { and, auditLogs, desc, eq, eventsOutbox, getAdminDb, pages, tenantDomains } from "@rentweb/db";
import { paymentSetupStatus } from "@rentweb/core/payments";
import { daysAgo, startOfTodayBangkok } from "@/lib/format";
import { tenantTx, type TenantCtx } from "@/lib/tenant";
import { computeKpis, PAYMENT_MODULES, type Kpis } from "./kpis";
import { computeTrends, type Trends } from "./trends";

export type { Kpis } from "./kpis";

export interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  /** "(ถ้ามี)" items do not hold back the progress bar */
  optional?: boolean;
  /** description is a warning (e.g. customers cannot pay online yet) */
  warning?: boolean;
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
  /** 14-day daily series for the KPI sparklines and the revenue bars */
  trends: Trends;
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
  const trendsPromise = tenantTx(tenantId, (tx) => computeTrends(tx, { tenantId, modules: ctx.modules, today }));
  // ADMIN_B2-06: sites without an item module (corporate / CMS-only) complete "content" by publishing their own page
  const hasItemModule = hasCommerce || hasRestaurant || hasBooking || hasTopup;
  const takesPayments = PAYMENT_MODULES.some((m) => ctx.modules.includes(m));
  const pagesPromise: Promise<Array<{ id: string; kind: string; publishedAt: Date | null }>> = hasItemModule
    ? Promise.resolve([])
    : tenantTx(tenantId, (tx) => tx.select({ id: pages.id, kind: pages.kind, publishedAt: pages.publishedAt }).from(pages).where(and(eq(pages.tenantId, tenantId), eq(pages.status, "published"))));

  const db = getAdminDb();
  const [domainsRows, audits, events] = await Promise.all([
    db.select({ kind: tenantDomains.kind }).from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
    db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId)).orderBy(desc(auditLogs.createdAt)).limit(8),
    db.select().from(eventsOutbox).where(eq(eventsOutbox.tenantId, tenantId)).orderBy(desc(eventsOutbox.createdAt)).limit(8),
  ]);
  const { kpis, realItem } = await kpiPromise;
  const trends = await trendsPromise;
  const publishedPages = await pagesPromise;
  const homePage = publishedPages.find((p) => p.kind === "home");
  const ownPagePublished = publishedPages.some((p) => !!p.publishedAt && p.publishedAt > createdCutoff);

  const theme = (ctx.tenant.theme ?? {}) as Record<string, unknown>;
  const brand = (theme.brand ?? {}) as Record<string, unknown>;
  const colors = (theme.colors ?? {}) as Record<string, unknown>;
  const fonts = (theme.fonts ?? {}) as Record<string, unknown>;
  const settings = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
  // ADMIN_B2-09: "done" only when checkout really has a receiver (same rule as the storefront), not when a field is filled
  const paySetup = paymentSetupStatus(settings);
  const contact = (settings.contact ?? {}) as Record<string, unknown>;
  const steps = ((ctx.tenant.onboarding ?? {}) as { steps?: Record<string, boolean> }).steps ?? {};
  const base = `/t/${ctx.tenant.slug}`;

  const checklist: ChecklistItem[] = [
    { key: "logo", label: "อัปโหลดโลโก้", description: "โลโก้แสดงบนส่วนหัวและแท็บเบราว์เซอร์", done: !!brand.logo || !!steps.logo, href: `${base}/design#brand` },
    { key: "theme", label: "ปรับสีและธีม", description: "เลือก preset หรือปรับสีหลักให้เข้ากับแบรนด์", done: Object.keys(colors).length > 0 || Object.keys(fonts).length > 0 || !!steps.theme, href: `${base}/design` },
    hasItemModule
      ? { key: "content", label: "เพิ่มรายการจริงอย่างน้อย 1 รายการ", description: "สินค้า บริการ เมนูอาหาร หรือเกมของคุณเอง แทนข้อมูลตัวอย่าง", done: realItem || !!steps.content, href: hasCommerce ? `${base}/products` : hasRestaurant ? `${base}/restaurant/menu` : hasBooking ? `${base}/services` : `${base}/topup/games` }
      : { key: "content", label: "แก้ไขและเผยแพร่หน้าเว็บของคุณ", description: "เปลี่ยนข้อความและรูปตัวอย่างบนหน้าแรกให้เป็นของธุรกิจคุณ แล้วกด “เผยแพร่”", done: ownPagePublished || !!steps.content, href: homePage ? `${base}/pages/${homePage.id}` : `${base}/pages` },
    ...(takesPayments
      ? [
          {
            key: "payments",
            label: "ตั้งค่าช่องทางรับเงิน",
            description: paySetup.ready
              ? `รับเงินออนไลน์ผ่าน ${paySetup.online.map((m) => (m === "promptpay_qr" ? "PromptPay QR" : "โอนเงิน + แนบสลิป")).join(" และ ")}`
              : "ลูกค้ายังชำระเงินออนไลน์ไม่ได้ — ใส่ PromptPay ID หรือบัญชีธนาคารสำหรับรับโอน",
            done: paySetup.ready,
            warning: !paySetup.ready,
            href: `${base}/settings/payments`,
          },
        ]
      : []),
    { key: "line", label: "เชื่อม LINE", description: "ใส่ LINE ID เพื่อให้ลูกค้าติดต่อได้ทันที", done: !!contact.lineId || !!(settings.line as Record<string, unknown> | undefined)?.channelId || !!steps.line, href: `${base}/settings` },
    { key: "domain", label: "ตั้งค่าโดเมนส่วนตัว (ถ้ามี)", description: "เชื่อมโดเมนของคุณเอง เช่น www.myshop.com", done: domainsRows.some((d) => d.kind === "custom") || !!steps.domain, href: `${base}/settings/domains`, optional: true },
  ];
  const required = checklist.filter((c) => !c.optional);
  const progress = Math.round((required.filter((c) => c.done).length / Math.max(1, required.length)) * 100);

  const activity: ActivityItem[] = [
    ...audits.map((a) => ({ id: a.id, kind: "audit" as const, title: describeAudit(a.action, a.actorType), at: a.createdAt })),
    ...events.map((e) => ({ id: e.id, kind: "event" as const, title: describeEvent(e.type), at: e.createdAt })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10);

  return { kpis, checklist, progress, activity, trends };
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
