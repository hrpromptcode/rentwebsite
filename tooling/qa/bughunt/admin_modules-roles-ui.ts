import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ADMIN, chromium, fixName, loginState, here, type Page } from "./admin_modules-lib";
const creds = JSON.parse(readFileSync(path.join(here, "admin_modules-creds.json"), "utf8"));
type Entry = { slug: string; path: string; detailOf?: RegExp };
const E: Entry[] = [
  { slug: "demo-shop", path: "/products" },
  { slug: "demo-shop", path: "/products", detailOf: /\/products\/[0-9a-f-]{36}$/ },
  { slug: "demo-shop", path: "/products/new" },
  { slug: "demo-shop", path: "/products/categories" },
  { slug: "demo-shop", path: "/orders" },
  { slug: "demo-shop", path: "/orders", detailOf: /\/orders\/[0-9a-f-]{36}$/ },
  { slug: "demo-shop", path: "/orders/new" },
  { slug: "demo-shop", path: "/discounts" },
  { slug: "demo-shop", path: "/discounts/new" },
  { slug: "demo-shop", path: "/shipping" },
  { slug: "demo-shop", path: "/shipping/new" },
  { slug: "demo-shop", path: "/reviews" },
  { slug: "demo-shop", path: "/payments?tab=paid" },
  { slug: "demo-shop", path: "/customers" },
  { slug: "demo-restaurant", path: "/restaurant/orders" },
  { slug: "demo-restaurant", path: "/restaurant/kitchen" },
  { slug: "demo-restaurant", path: "/restaurant/menu" },
  { slug: "demo-restaurant", path: "/restaurant/menu", detailOf: /\/restaurant\/menu\/items\/[0-9a-f-]{36}$/ },
  { slug: "demo-restaurant", path: "/restaurant/menu/modifiers" },
  { slug: "demo-restaurant", path: "/restaurant/tables" },
  { slug: "demo-restaurant", path: "/restaurant/reservations" },
  { slug: "demo-salon", path: "/bookings" },
  { slug: "demo-salon", path: "/bookings/new" },
  { slug: "demo-salon", path: "/bookings?view=list", detailOf: /\/bookings\/[0-9a-f-]{36}$/ },
  { slug: "demo-salon", path: "/services" },
  { slug: "demo-salon", path: "/services/new" },
  { slug: "demo-salon", path: "/services", detailOf: /\/services\/[0-9a-f-]{36}$/ },
  { slug: "demo-salon", path: "/staff" },
  { slug: "demo-salon", path: "/staff/new" },
  { slug: "demo-salon", path: "/staff", detailOf: /\/staff\/[0-9a-f-]{36}$/ },
  { slug: "demo-clinic", path: "/clinic/patients" },
  { slug: "demo-clinic", path: "/clinic/patients", detailOf: /\/clinic\/patients\/[0-9a-f-]{36}$/ },
  { slug: "demo-clinic", path: "/clinic/visits" },
  { slug: "demo-clinic", path: "/clinic/visits", detailOf: /\/clinic\/visits\/[0-9a-f-]{36}$/ },
  { slug: "demo-clinic", path: "/clinic/packages" },
];
async function survey(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(e as HTMLElement); return r.width > 0 && r.height > 0 && s.visibility !== "hidden"; };
    const items: string[] = [];
    main.querySelectorAll("button, a[href], [role=switch], input, select, textarea").forEach((e) => {
      if (!vis(e)) return;
      const tag = e.tagName.toLowerCase();
      let label = ((e as HTMLElement).innerText || e.getAttribute("aria-label") || (e as HTMLInputElement).placeholder || e.getAttribute("name") || e.id || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (tag === "a") { const h = e.getAttribute("href") ?? ""; if (!/new|edit|print|create/.test(h)) return; label = "a:" + label + "->" + h.replace(/^\/t\/[^/]+/, ""); }
      const dis = (e as HTMLButtonElement).disabled || e.getAttribute("aria-disabled") === "true" || (e as HTMLInputElement).readOnly;
      items.push(`${tag === "a" ? "" : tag + ":"}${label}${dis ? "[dis]" : ""}`);
    });
    return { h1: (document.querySelector("h1") as HTMLElement | null)?.innerText ?? "", items: [...new Set(items)] };
  });
}
async function main() {
  const browser = await chromium.launch();
  const out: Record<string, Record<string, any>> = {};
  const detail: Record<string, string> = {};
  for (const role of ["manager", "staff", "viewer"]) {
    const st = await loginState(browser, creds[role].email, creds[role].password, role);
    const ctx = await browser.newContext({ storageState: st, viewport: { width: 1440, height: 900 } });
    await fixName(ctx); const page = await ctx.newPage();
    out[role] = {};
    for (const e of E) {
      const key = `${e.slug}${e.path}${e.detailOf ? " [detail]" : ""}`;
      try {
        let url = `${ADMIN}/t/${e.slug}${e.path}`;
        if (e.detailOf) {
          if (!detail[key]) {
            await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
            const hrefs = await page.locator("main a[href]").evaluateAll((els) => els.map((x) => x.getAttribute("href") ?? ""));
            const h = hrefs.find((x) => e.detailOf!.test(x));
            if (!h) throw new Error("no detail link");
            detail[key] = h;
          }
          url = `${ADMIN}${detail[key]}`;
        }
        const r = await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
        const s = await survey(page);
        out[role][key] = { status: r?.status(), url: page.url().replace(ADMIN, ""), ...s };
      } catch (err) {
        out[role][key] = { error: (err as Error).message.slice(0, 120) };
      }
    }
    await ctx.close();
  }
  writeFileSync(path.join(here, "admin_modules-roles-ui.json"), JSON.stringify(out, null, 1));
  for (const e of E) {
    const key = `${e.slug}${e.path}${e.detailOf ? " [detail]" : ""}`;
    const m = out.manager[key], s = out.staff[key], v = out.viewer[key];
    console.log(`\n### ${key}  status m/s/v=${m?.status}/${s?.status}/${v?.status} ${m?.error ?? ""}${s?.error ?? ""}`);
    const mi = new Set<string>(m?.items ?? []);
    console.log("  staff sees (same as manager unless noted):", (s?.items ?? []).filter((x: string) => !/^input|^select|^textarea/.test(x)).join(" | ").slice(0, 900));
    const onlyMgr = [...mi].filter((x) => !(s?.items ?? []).includes(x));
    console.log("  manager-only:", onlyMgr.join(" | ").slice(0, 500));
    console.log("  viewer extra vs staff:", (v?.items ?? []).filter((x: string) => !(s?.items ?? []).includes(x)).join(" | ").slice(0, 300), "| viewer h1:", v?.h1);
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
