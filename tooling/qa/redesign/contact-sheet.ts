import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

/**
 * Compose screenshots into one contact sheet for quick art-direction review.
 *   pnpm --filter @rentweb/tooling exec tsx qa/redesign/contact-sheet.ts <out.png> <cols> <file1.png> <file2.png> …
 * (paths relative to tooling/; globs are not expanded — pass explicit files)
 */
const [out, colsArg, ...files] = process.argv.slice(2);
if (!out || !files.length) {
  console.error("usage: contact-sheet.ts <out.png> <cols> <files…>");
  process.exit(1);
}
const cols = Number(colsArg) || 2;
const cells = files
  .filter((f) => fs.existsSync(f))
  .map((f) => `<figure><img src="${pathToFileURL(path.resolve(f)).href}"><figcaption>${path.basename(f)}</figcaption></figure>`)
  .join("");
const html = `<!doctype html><html><body style="margin:0;background:#222;color:#ddd;font:12px system-ui">
<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;padding:8px">${cells}</div>
<style>figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 0}</style></body></html>`;
const tmp = path.resolve(path.dirname(out), `.contact-${Date.now()}.html`);
fs.writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(pathToFileURL(tmp).href);
await page.waitForLoadState("load");
await page.screenshot({ path: out, fullPage: true });
await browser.close();
fs.unlinkSync(tmp);
console.log("wrote", out);
