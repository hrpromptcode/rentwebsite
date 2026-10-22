/**
 * shared1 (phase-3 shared-layer fixer) verification: screenshots + console / hydration / overflow checks for a list of
 * specs. Run from tooling/:
 *   pnpm exec tsx qa/redesign/shared1-shots.ts <spec> [<spec> …] [--reduce] [--w=1440,390] [--full] [--wait=2500]
 * spec = <site>:<path>[@<selector>[+<offset>]]  (site "platform" = localhost:3000 itself), e.g.
 *   cafe:/ topup:/@[data-section=testimonials] corporate:/contact@[data-section=contact]+-80
 * Screenshots: tooling/screenshots/redesign-qa-shared1-<site>-<slug>-<w>[-reduce].png
 * Also prints h1 rect / CTA bottom (fold check) and document overflow per shot.
 */
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const args = process.argv.slice(2);
const specs = args.filter((a) => !a.startsWith("--"));
const reduce = args.includes("--reduce");
const full = args.includes("--full");
const widths = (args.find((a) => a.startsWith("--w="))?.slice(4) ?? "1440,390").split(",").map(Number);
const wait = Number(args.find((a) => a.startsWith("--wait="))?.slice(7) ?? 2500);
const tag = args.find((a) => a.startsWith("--tag="))?.slice(6) ?? "";
const OUT = "screenshots";

function urlOf(site: string, path: string) {
  return site === "platform" ? `http://localhost:3000${path}` : `http://demo-${site}.localhost:3000${path}`;
}

async function wheelTo(page: Page, selector: string, offset = 0) {
  const y = await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel as string);
      return el ? el.getBoundingClientRect().top + window.scrollY + (off as number) : -1;
    },
    [selector, offset] as const,
  );
  if (y < 0) {
    console.log(`  ! selector not found: ${selector}`);
    return;
  }
  for (let i = 0; i < 80; i++) {
    const cur = await page.evaluate(() => window.scrollY);
    const d = y - cur;
    if (Math.abs(d) < 8) break;
    await page.mouse.wheel(0, Math.max(-700, Math.min(700, d)));
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => window.scrollY);
    if (after === cur && i > 3) break;
  }
  await page.waitForTimeout(1400);
}

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const errors: string[] = [];
for (const w of widths) {
  const h = w >= 1000 ? 900 : 844;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    reducedMotion: reduce ? "reduce" : "no-preference",
    ...(w < 768 ? { hasTouch: true, isMobile: true } : {}),
  });
  await isolateHmr(ctx);
  for (const spec of specs) {
    const [site, rest] = [spec.slice(0, spec.indexOf(":")), spec.slice(spec.indexOf(":") + 1)];
    const [path, sel] = rest.split("@") as [string, string | undefined];
    const page = await ctx.newPage();
    const t = `${site}${path}@${w}${reduce ? "-reduce" : ""}`;
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(`[${t}] console.${m.type()}: ${m.text().slice(0, 300)}`);
    });
    page.on("pageerror", (e) => errors.push(`[${t}] pageerror: ${e.message.slice(0, 300)}`));
    const res = await stableGoto(page, urlOf(site, path), "load");
    await page.waitForTimeout(wait);
    if (sel) {
      const [s, off] = sel.split("+") as [string, string | undefined];
      await wheelTo(page, s, Number(off ?? 0));
    }
    const m = await page.evaluate(() => {
      const h1 = document.querySelector("main h1");
      const r = h1?.getBoundingClientRect();
      const ctas = [...document.querySelectorAll<HTMLElement>("[data-section=hero] a, [data-page-intro] a")].filter((a) => a.offsetParent);
      const ctaBottom = ctas.length ? Math.max(...ctas.slice(0, 2).map((a) => a.getBoundingClientRect().bottom)) : null;
      return {
        h1: r ? `${Math.round(r.top)}→${Math.round(r.bottom)} w${Math.round(r.width)} fs${getComputedStyle(h1!).fontSize}` : "none",
        ctaBottom: ctaBottom == null ? null : Math.round(ctaBottom),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        title: document.title,
      };
    });
    const slug = (path === "/" ? "home" : path.replace(/^\//, "").replace(/[/?=&]/g, "_")) + (sel ? "-" + sel.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) : "");
    const file = `${OUT}/redesign-qa-shared1-${site}-${slug}${tag ? "-" + tag : ""}-${w}${reduce ? "-reduce" : ""}.png`;
    await page.screenshot({ path: file, fullPage: full });
    console.log(`${t} ${res?.status()} h1 ${m.h1} cta↓${m.ctaBottom} overflow ${m.overflow} title "${m.title}" → ${file}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.join("\n")}` : "0 console errors");
