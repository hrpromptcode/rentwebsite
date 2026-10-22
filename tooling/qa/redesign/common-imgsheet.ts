/**
 * common agent helper: contact sheet of local images (to look at candidate Unsplash photos in one screenshot).
 *   cd tooling && pnpm exec tsx qa/redesign/common-imgsheet.ts <dir> <out.png>
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const [dir, out] = process.argv.slice(2);
if (!dir || !out) throw new Error("usage: common-imgsheet.ts <dir> <out.png>");
const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const cells = files
  .map((f) => `<figure><img src="${pathToFileURL(path.join(dir, f)).href}"><figcaption>${f.replace(/\.\w+$/, "")}</figcaption></figure>`)
  .join("");
const html = `<!doctype html><html><body style="margin:0;background:#111;color:#ddd;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:8px">${cells}</div><style>figure{margin:0}img{width:100%;height:180px;object-fit:cover;display:block}figcaption{padding:3px 0}</style></body></html>`;
const tmp = path.join(dir, "_sheet.html");
fs.writeFileSync(tmp, html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 600 } });
await p.goto(pathToFileURL(tmp).href);
await p.waitForLoadState("load");
await p.screenshot({ path: out, fullPage: true });
await b.close();
fs.unlinkSync(tmp);
console.log(`${files.length} images → ${out}`);
