/** qa-a: contact sheet of Unsplash ids. tsx qa/redesign/_qa-a-imgsheet.ts <ids-file|id,id,...> <out.png> [cols] */
import fs from "node:fs";
import { chromium } from "@playwright/test";
const [src, out, colsArg] = process.argv.slice(2);
const ids = (fs.existsSync(src!) ? fs.readFileSync(src!, "utf8") : src!.replace(/,/g, "\n")).split(/\s+/).filter(Boolean);
const cols = Number(colsArg ?? 8);
const cells = ids.map((id) => `<figure><img src="https://images.unsplash.com/photo-${id}?w=640&q=70&auto=format"><figcaption>${id}</figcaption></figure>`).join("");
const html = `<!doctype html><body style="margin:0;background:#222;color:#ddd;font:12px monospace"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px">${cells}</div><style>figure{margin:0}img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#444}figcaption{padding:1px 0 3px}</style></body>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.setContent(html, { waitUntil: "networkidle", timeout: 120_000 });
await p.screenshot({ path: out!, fullPage: true });
await b.close();
