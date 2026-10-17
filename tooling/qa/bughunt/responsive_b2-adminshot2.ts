import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { HERE, SHOTS, isolateHmr, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: admin restaurant menu table at 390 scrolled fully right inside its scroller (where the sold-out toggles live). */
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: path.join(HERE, "responsive_b2-admin-state.json"), isMobile: true, hasTouch: true });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await gotoRetry(page, "http://localhost:3001/t/demo-restaurant/restaurant/menu");
  await page.waitForTimeout(2000);
  // reverify-repro 2026-10-17: RESPONSIVE_B2-03 fix renders a card list (ul[aria-label="รายการเมนู"]) below md and the
  // table only from md (hidden md:block), so the original table-scroller probe measures a display:none table (all 0).
  // Probe the phone list instead: visible, no sideways scroll, every card's price + 3 quick toggles inside the viewport.
  const r = (await page.evaluate(`(() => { const ul = document.querySelector('ul[aria-label="รายการเมนู"]'); const table = document.querySelector('table'); const vw = innerWidth; if (!ul) return { list: false }; const cards = [...ul.children]; const bad = []; for (const li of cards.slice(0, 40)) { const ctrls = [...li.querySelectorAll('button, [role=switch], input[type=checkbox], label')].filter(c => c.getBoundingClientRect().width > 0); for (const c of ctrls) { const b = c.getBoundingClientRect(); if (b.left < 0 || b.right > vw + 0.5) bad.push((c.getAttribute('aria-label') || c.textContent || '').trim().slice(0, 30) + '@' + Math.round(b.left) + '-' + Math.round(b.right)); } } const t = cards[0]; const first = t ? { text: t.innerText.replace(/\s+/g, ' ').slice(0, 120), controls: [...t.querySelectorAll('button, [role=switch]')].map(c => (c.getAttribute('aria-label') || c.textContent || '').trim().slice(0, 30)) } : null; return { list: true, listVisible: ul.getBoundingClientRect().width > 0, cards: cards.length, tableVisible: !!table && table.getBoundingClientRect().width > 0, scrollW: document.documentElement.scrollWidth, vw, outside: bad.slice(0, 8), first }; })()`)) as { list: boolean; listVisible?: boolean; cards?: number; tableVisible?: boolean; scrollW?: number; vw?: number; outside?: string[] };
  console.log(JSON.stringify(r));
  console.log(r.list && r.listVisible && !r.tableVisible && (r.cards ?? 0) > 0 && (r.scrollW ?? 999) <= (r.vw ?? 0) && !r.outside?.length ? `PASS RESPONSIVE_B2-03 390: ${r.cards} menu cards, toggles inside the viewport, no sideways scroll` : "FAIL RESPONSIVE_B2-03 bug reproduces");
  /* original probe (table scroller), kept for reference:
  const r = await page.evaluate(`(() => { const t = document.querySelector("table"); let sc = t.parentElement; while (sc && !["auto","scroll"].includes(getComputedStyle(sc).overflowX)) sc = sc.parentElement; window.scrollTo(0, t.getBoundingClientRect().top + scrollY - 120); sc.scrollLeft = 10000; const sw = [...t.querySelectorAll("tbody tr")[0].querySelectorAll("button,[role=switch],input")].map(b => (b.getAttribute("aria-label") || b.innerText || b.type).trim().slice(0, 30) + "@x=" + Math.round(b.getBoundingClientRect().left)); return { scrollW: sc.scrollWidth, clientW: sc.clientWidth, scrollLeft: sc.scrollLeft, rowH: Math.round(t.querySelector("tbody tr").getBoundingClientRect().height), controlsRow1: sw, shadowHint: getComputedStyle(sc).maskImage + " " + getComputedStyle(sc).backgroundImage.slice(0, 40) }; })()`);
  console.log(JSON.stringify(r));
  */
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-admin-rest-menu-scrolled-390.png") });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
