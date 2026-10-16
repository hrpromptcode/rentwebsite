import { readFileSync } from "node:fs";
import { ADMIN, go, launch, newCtx, newPage, out, readCreds, shot } from "./admin_b2-lib";
const C = readCreds();
const EXTRA = ["/products/new", "/products/categories", "/orders/new", "/discounts/new", "/shipping/new", "/bookings/new", "/bookings?view=list", "/services/new", "/staff/new", "/restaurant/tables/print", "/restaurant/menu/modifiers", "/settings/payments", "/settings/domains", "/settings/team", "/settings/billing", "/settings/danger", "/navigation", "/media", "/design", "/pages", "/customers", "/reviews", "/payments", "/payments?tab=paid", "/clinic/visits", "/clinic/patients", "/clinic/packages"];
async function main() {
  const browser = await launch();
  const st = JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8"));
  for (const vp of (process.argv[2] === "390" ? [{ width: 390, height: 844 }] : [{ width: 1440, height: 900 }, { width: 390, height: 844 }])) {
    const ctx = await newCtx(browser, { storageState: st, viewport: vp });
    const page = await newPage(ctx);
    for (const t of C.tenants.filter((x: any) => !process.argv[3] || process.argv[3].split(",").includes(x.key))) {
      await go(page, `/t/${t.slug}/dashboard`);
      const links = await page.locator(`a[href^="/t/${t.slug}/"]`).evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
      const paths = [...new Set([...links.map((l) => l.replace(`/t/${t.slug}`, "")), ...EXTRA])].filter((p) => !p.startsWith("/topup") && !/[0-9a-f-]{36}/.test(p));
      const bad: string[] = [];
      for (const p of paths) {
        page.__errors.length = 0;
        const s = await go(page, `/t/${t.slug}${p}`);
        const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
        const h1 = await page.locator("main h1, h1").first().innerText().catch(() => "");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const errText = /Application error|Unhandled|เกิดข้อผิดพลาด|ไม่พบหน้า|Something went wrong|TypeError|NaN|undefined|Invalid Date/.exec(body)?.[0];
        const errs = page.__errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 404/.test(e));
        if (s >= 400 || errText || errs.length || overflow > 1) bad.push(`${p} -> ${s} h1="${h1.slice(0, 30)}" ${errText ? `TEXT:${errText}` : ""} ${overflow > 1 ? `OVERFLOW:${overflow}px` : ""} ${errs.length ? `ERR:${errs[0]}` : ""}`);
        if (overflow > 1 && vp.width < 500) await page.screenshot({ path: shot(`empty-${t.key}-${p.replace(/[^a-z0-9]+/gi, "_")}-390`) });
      }
      out(`${vp.width} ${t.key} (${paths.length} pages)`, bad.length ? bad : "all OK");
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
