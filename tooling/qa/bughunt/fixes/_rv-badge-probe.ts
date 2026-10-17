import "../../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr } from "./_dev-stable";
/** reverify-storefront probe: does the header cart badge render after add-to-cart (guest)? */
async function main() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)));
  const base = "http://demo-shop.localhost:3000";
  await p.goto(`${base}/products/linen-shirt-sand`, { waitUntil: "networkidle" });
  await p.locator("button[aria-pressed]", { hasText: /^M$/ }).first().click();
  p.on("request", (q) => q.headers()["rsc"] && console.log("RSC req", q.method(), q.url().slice(0, 120), JSON.stringify(q.headers()["next-router-state-tree"] ?? "").slice(0, 60)));
  p.on("response", async (q) => { if (q.request().headers()["rsc"]) { const t = await q.text().catch(() => ""); console.log("RSC res", q.status(), t.length, "has badge-span:", /size-4\.5[^"]*"[^}]*?children":(\d+|"\d+")/.test(t), (t.match(/rounded-full bg-primary text-\[10px\][^\]]{0,120}/) ?? [""])[0].slice(0, 160)); } });
  const r = p.waitForResponse((r) => r.url().includes("/api/cart") && r.request().method() === "POST");
  await p.getByRole("button", { name: "เพิ่มลงตะกร้า" }).filter({ visible: true }).first().click();
  const res = await r;
  console.log("POST /api/cart", res.status(), (await res.text()).slice(0, 200));
  for (let i = 0; i < 10; i++) { await p.waitForTimeout(1000); const t = ((await p.locator('header a[href="/cart"]').first().textContent()) ?? "").trim(); if (t) { console.log("badge appeared after", i + 1, "s"); break; } }
  const badge = async () => ((await p.locator('header a[href="/cart"]').first().textContent()) ?? "").trim();
  console.log("badge after add:", JSON.stringify(await badge()));
  console.log("cookies:", (await ctx.cookies()).map((c) => c.name).join(","));
  await p.reload({ waitUntil: "networkidle" });
  console.log("badge after reload:", JSON.stringify(await badge()));
  await p.goto(`${base}/cart`, { waitUntil: "networkidle" });
  console.log("badge on /cart:", JSON.stringify(await badge()), "qty inputs:", await p.locator('input[aria-label="จำนวน"]').count());
  await b.close();
}
main();
