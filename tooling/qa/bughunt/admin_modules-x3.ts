import { chromium } from "./admin_modules-lib";
import { and, eq, getAdminDb, menuItems, tenants } from "@rentweb/db";
async function main() {
  const db = getAdminDb();
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, "demo-restaurant"));
  const [row] = await db.select({ soldOut: menuItems.soldOut, available: menuItems.available }).from(menuItems).where(and(eq(menuItems.tenantId, t!.id), eq(menuItems.name, "แกงจืดเต้าหู้หมูสับ")));
  console.log("db", row);
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  await p.goto("http://demo-restaurant.localhost:3000/menu", { waitUntil: "networkidle", timeout: 120000 });
  const btn = p.getByRole("button", { name: /^แกงจืดเต้าหู้หมูสับ/ }).first();
  console.log("storefront enabled:", await btn.isEnabled(), "label:", await btn.getAttribute("aria-label"), (await btn.innerText()).replace(/\s+/g, " "));
  await b.close(); process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
