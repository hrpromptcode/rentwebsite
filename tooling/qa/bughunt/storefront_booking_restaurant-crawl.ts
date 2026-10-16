import "../../load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";

/** 2-level link crawl of demo-salon / demo-clinic / demo-restaurant: status, console errors, broken images, failed requests. */
const here = path.dirname(fileURLToPath(import.meta.url));
const tenants = (process.argv[2] ?? "demo-salon,demo-clinic,demo-restaurant").split(",");
const SKIP = /\/(games|topup|wallet)(\/|$)|logout|signout|\.ics|\/api\//;

async function main() {
  const browser = await chromium.launch();
  const out: string[] = [];
  for (const t of tenants) {
    const origin = `http://${t}.localhost:3000`;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "th-TH", timezoneId: "Asia/Bangkok" });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(90_000);
    let errs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 300)}`));
    page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 200)}`); });
    page.on("requestfailed", (r) => { const f = r.failure()?.errorText ?? ""; if (!/ERR_ABORTED/.test(f)) errs.push(`requestfailed ${r.url().slice(0, 200)} ${f}`); });
    const seen = new Map<string, number>();
    const queue: Array<{ url: string; depth: number; from: string }> = [{ url: "/", depth: 0, from: "-" }];
    while (queue.length) {
      const { url, depth, from } = queue.shift()!;
      if (seen.has(url)) continue;
      errs = [];
      let status = 0;
      try {
        const r = await page.goto(origin + url, { waitUntil: "networkidle", timeout: 90_000 });
        status = r?.status() ?? 0;
      } catch (e) { status = -1; errs.push(String(e).slice(0, 200)); }
      seen.set(url, status);
      await page.waitForTimeout(300);
      const info = await page.evaluate(() => {
        const broken = Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src)).map((i) => (i.currentSrc || i.src).slice(0, 160));
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => a.getAttribute("href")!).filter(Boolean);
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const h1 = document.querySelector("h1")?.textContent?.trim().slice(0, 60) ?? "";
        const emptyLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((a) => !a.textContent?.trim() && !a.getAttribute("aria-label") && !a.querySelector("img[alt]:not([alt=''])") && !a.querySelector("svg[aria-label]")).map((a) => a.getAttribute("href"));
        return { broken, links, overflow, h1, emptyLinks, title: document.title };
      });
      out.push(`${t} ${status} ${url} (from ${from}) h1="${info.h1}" title="${info.title.slice(0, 60)}"${info.overflow > 0 ? ` OVERFLOW=${info.overflow}` : ""}${info.broken.length ? ` BROKEN_IMG=${info.broken.join(" ")}` : ""}${info.emptyLinks.length ? ` NONAME_LINKS=${[...new Set(info.emptyLinks)].join(",")}` : ""}`);
      for (const e of [...new Set(errs)]) out.push(`    ${e}`);
      if (depth < 2) {
        for (const h of info.links) {
          let u: URL;
          try { u = new URL(h, origin + url); } catch { out.push(`    BAD_HREF ${h}`); continue; }
          if (u.origin !== origin) continue;
          const p = u.pathname + u.search;
          if (SKIP.test(p) || seen.has(p) || queue.some((q) => q.url === p)) continue;
          queue.push({ url: p, depth: depth + 1, from: url });
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
  const file = path.join(here, "storefront_booking_restaurant-crawl.txt");
  await writeFile(file, out.join("\n") + "\n");
  console.log(out.filter((l) => !/^\S+ 200 /.test(l) || /OVERFLOW|BROKEN|NONAME/.test(l)).join("\n"));
  console.log(`pages: ${out.filter((l) => !l.startsWith("    ")).length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
