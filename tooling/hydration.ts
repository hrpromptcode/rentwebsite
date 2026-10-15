import "./load-env";
import { chromium } from "@playwright/test";

/** Prints the full hydration/console error text for one page.  MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling hydration -- demo-shop --path / */
const args = process.argv.slice(2);
const i = args.indexOf("--path");
const pathArg = i >= 0 ? args[i + 1]! : "/";
const slug = args.find((a) => !a.startsWith("--") && a !== pathArg) ?? "demo-shop";
const port = process.env.PORT ?? "3000";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const logs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://${slug}.localhost:${port}${pathArg}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(1500);
  for (const l of logs) console.log(l.slice(0, 2500) + "\n-----");
  if (!logs.length) console.log("no console errors");
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
