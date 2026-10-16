import { readFileSync } from "node:fs";
import { ADMIN, launch, newCtx, out, readCreds } from "./admin_b2-lib";
async function main() {
  const C = readCreds();
  const slug = process.argv[3] ?? C.tenants[0].slug;
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8")), viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${ADMIN}/t/${slug}${process.argv[2]}`, { waitUntil: "networkidle", timeout: 120_000 });
  out("overflow", await p.evaluate(() => {
    const W = window.innerWidth; const res: string[] = [];
    document.querySelectorAll("main *").forEach((e) => { const r = e.getBoundingClientRect(); if (r.right > W + 1 && r.width > 0) { const sc = (el: Element | null): boolean => { while (el) { const s = getComputedStyle(el); if (/(auto|scroll|hidden)/.test(s.overflowX) && el !== document.documentElement && el !== document.body) return true; el = el.parentElement; } return false; }; if (!sc(e.parentElement)) res.push(`${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).slice(0, 60)} right=${Math.round(r.right)} w=${Math.round(r.width)} "${(e.textContent ?? "").trim().slice(0, 40)}"`); } });
    return { scrollW: document.documentElement.scrollWidth, top: res.slice(0, 8) };
  }));
  await browser.close();
}
main();
