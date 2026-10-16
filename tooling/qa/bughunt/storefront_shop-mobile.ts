import "../../load-env";
import { chromium } from "@playwright/test";

/** Mobile (390px) overflow + console/hydration errors on shop/cafe/corporate pages (storefront_shop bughunt). */
const ROUTES: Record<string, string[]> = {
  "demo-shop": ["/", "/products", "/collections", "/collections/apparel", "/products/linen-shirt-sand", "/products/tote-pikul", "/cart", "/checkout", "/account/login", "/orders/track", "/about", "/contact", "/privacy", "/refund", "/terms", "/nope-404"],
  "demo-cafe": ["/", "/products", "/products/croissant", "/collections/cakes", "/cart", "/checkout", "/account/login", "/about", "/contact"],
  "demo-corporate": ["/", "/services", "/work", "/careers", "/about", "/contact", "/account/login", "/privacy", "/terms"],
};
const ADD: Record<string, string> = { "demo-shop": "01a14029-090c-75a9-9996-0ec0ac2fd278", "demo-cafe": "01a14029-1dff-7328-adef-00aaaeeae8d3" };

async function main() {
  const browser = await chromium.launch();
  for (const [slug, routes] of Object.entries(ROUTES)) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: "reduce", locale: "th-TH" });
    const page = await ctx.newPage();
    let errs: string[] = [];
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !/Download the React DevTools|\[Fast Refresh\]|\[HMR\]/.test(m.text()) && errs.push(`${m.type()}: ${m.text().slice(0, 220)}`));
    page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 200)}`));
    await page.goto(`http://${slug}.localhost:3000/`, { waitUntil: "networkidle", timeout: 90_000 });
    if (ADD[slug])
      await page.evaluate(async (pid) => {
        await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: pid, quantity: 1 }) });
      }, ADD[slug]);
    for (const r of routes) {
      errs = [];
      const res = await page.goto(`http://${slug}.localhost:3000${r}`, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
      await page.waitForTimeout(700);
      const ov = await page.evaluate(`(() => {
        const vw = document.documentElement.clientWidth; const out = [];
        document.querySelectorAll("body *").forEach((el) => { const b = el.getBoundingClientRect(); if (b.right > vw + 1 && b.width > 0) { let a = el.parentElement, clip = false; while (a && a !== document.body) { const ox = getComputedStyle(a).overflowX; if (ox !== "visible") { clip = true; break; } a = a.parentElement; } if (!clip && out.length < 3) out.push(el.tagName + "." + String(el.className).slice(0, 40) + " right=" + Math.round(b.right)); } });
        const small = [...document.querySelectorAll("main a, main button, header a, header button")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 32 || b.width < 32) && getComputedStyle(e).visibility !== "hidden"; }).slice(0, 3).map((e) => (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 20) + "(" + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height) + ")");
        return { sw: document.documentElement.scrollWidth, vw, out, small };
      })()`) as { sw: number; vw: number; out: string[]; small: string[] };
      const flag = ov.sw > ov.vw + 1 || errs.some((e) => !e.includes("404"));
      console.log(`${flag ? "!!" : "ok"} ${slug}${r} ${res?.status()} sw=${ov.sw}/${ov.vw}${ov.out.length ? " OVER " + ov.out.join(" ; ") : ""}${ov.small.length ? " small:" + ov.small.join(",") : ""}${errs.length ? " | " + errs.slice(0, 3).join(" | ") : ""}`);
      if (ov.sw > ov.vw + 1) await page.screenshot({ path: `screenshots/bughunt-storefront_shop-mobile-${slug}-${r.replace(/\W+/g, "_")}.png` });
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
