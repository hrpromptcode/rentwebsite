import "./load-env";
import { eq, getAdminDb, plans, templates, tenants } from "@rentweb/db";
import { provisionTenant } from "@rentweb/core/tenant";
import { rootHost } from "@rentweb/core/env";
import { listTemplates } from "@rentweb/templates";

const PLANS = [
  { key: "trial", name: "ทดลองใช้", priceMonthly: 0, priceYearly: 0, limits: { products: 50, pages: 10, staff: 2, storageMb: 500, users: 1 }, modulesAllowed: ["*"], features: ["ทุกฟีเจอร์ของ Pro 14 วัน"], sort: 0 },
  { key: "starter", name: "Starter", priceMonthly: 39000, priceYearly: 390000, limits: { products: 50, pages: 10, staff: 1, storageMb: 1024, users: 1, ordersPerMonth: 300 }, modulesAllowed: ["cms", "commerce", "booking", "restaurant"], features: ["subdomain ฟรี", "1 โมดูลธุรกิจ", "รับเงินโอน/สลิป + PromptPay", "แจ้งเตือนอีเมล"], sort: 1 },
  { key: "pro", name: "Pro", priceMonthly: 99000, priceYearly: 990000, limits: { products: 1000, pages: 50, staff: 5, storageMb: 10240, users: 5, ordersPerMonth: 5000, slipVerifyPerMonth: 300 }, modulesAllowed: ["*"], features: ["โดเมนส่วนตัว", "ทุกโมดูลในกลุ่มธุรกิจ", "LINE แจ้งเตือน + LINE Login", "ตรวจสลิปอัตโนมัติ 300 ใบ/เดือน", "คูปอง รีวิว บล็อก", "ไม่มี Powered by"], sort: 2 },
  { key: "business", name: "Business", priceMonthly: 249000, priceYearly: 2490000, limits: { products: 100000, pages: 500, staff: 15, storageMb: 51200, users: 15, ordersPerMonth: 100000, slipVerifyPerMonth: 100000, branches: 10 }, modulesAllowed: ["*"], features: ["หลายสาขา", "ไม่จำกัดรายการ", "Custom CSS", "API & Webhooks", "Broadcast LINE/อีเมล", "ซัพพอร์ตด่วน"], sort: 3 },
  { key: "enterprise", name: "Enterprise", priceMonthly: 800000, priceYearly: 8000000, limits: {}, modulesAllowed: ["*"], features: ["DB/region แยก", "SLA 99.95%", "SSO", "ธีมออกแบบเฉพาะ"], sort: 4 },
];

const DEMO_NAMES: Record<string, string> = {
  shop: "Siam Atelier",
  topup: "GameHub",
  clinic: "Lumière Clinic",
  restaurant: "บ้านริม",
  salon: "สบาย สบาย",
  corporate: "Northstar Studio",
  cafe: "Sugar Puff",
};

async function main() {
  const db = getAdminDb();

  console.log("→ plans");
  for (const p of PLANS) {
    await db
      .insert(plans)
      .values(p)
      .onConflictDoUpdate({ target: plans.key, set: { ...p } });
  }

  console.log("→ templates");
  for (const t of listTemplates()) {
    const row = {
      key: t.key,
      name: t.name.th,
      description: t.description.th,
      category: t.category,
      siteType: t.siteType,
      modules: t.modules,
      themePreset: t.themePreset,
      previewImage: t.previewImage ?? null,
      demoTenantSlug: `demo-${t.key}`,
      complexity: t.complexity ?? 1,
    };
    await db.insert(templates).values(row).onConflictDoUpdate({ target: templates.key, set: row });
  }

  console.log("→ demo tenants");
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  for (const t of listTemplates()) {
    const slug = `demo-${t.key}`;
    const [exists] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (exists) {
      console.log(`  • ${slug} already exists`);
      continue;
    }
    const r = await provisionTenant({ name: DEMO_NAMES[t.key] ?? t.name.th, slug, template: t, planKey: "pro", db });
    await db.update(tenants).set({ status: "active", trialEndsAt: null }).where(eq(tenants.id, r.tenantId));
    console.log(`  ✓ ${proto}://${slug}.${rootHost()}  (${r.tenantId})`);
  }

  console.log("✓ seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
