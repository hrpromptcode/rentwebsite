import "./load-env";
import { chromium } from "@playwright/test";

/** Lists unclipped elements wider than the viewport.  MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling overflow -- demo-restaurant --path / */
const args = process.argv.slice(2);
const i = args.indexOf("--path");
const pathArg = i >= 0 ? args[i + 1]! : "/";
const slug = args.find((a) => !a.startsWith("--") && a !== pathArg) ?? "demo-shop";
const port = process.env.PORT ?? "3000";

const SCRIPT = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const clipped = (el) => {
    let a = el.parentElement;
    while (a && a !== document.body) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll") return true;
      a = a.parentElement;
    }
    return false;
  };
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !clipped(el)) {
      const cls = typeof el.className === "string" ? el.className.split(" ").slice(0, 5).join(".") : "";
      out.push(el.tagName.toLowerCase() + "." + cls + " right=" + Math.round(r.right) + " w=" + Math.round(r.width));
    }
  });
  return { vw, sw: document.documentElement.scrollWidth, out: out.slice(0, 15) };
})()`;

async function main() {
  const browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await page.goto(`http://${slug}.localhost:${port}${pathArg}`, { waitUntil: "networkidle", timeout: 120_000 });
    const result = (await page.evaluate(SCRIPT)) as { vw: number; sw: number; out: string[] };
    console.log(`\n[${width}px] scrollWidth=${result.sw} clientWidth=${result.vw}`);
    for (const l of result.out) console.log("  " + l);
    await page.close();
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
