/** restaurant agent: contact sheet of screenshots. tsx qa/redesign/_rr-sheet.ts <out.png> <cols> <file...> */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
const [out, cols, ...files] = process.argv.slice(2);
const cells = files.map((f) => `<figure><img src="${pathToFileURL(path.resolve(f)).href}"><figcaption>${path.basename(f)}</figcaption></figure>`).join("");
const html = `<!doctype html><html><body style="margin:0;background:#1d1d1f;color:#bbb;font:11px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px;align-items:start">${cells}</div><style>figure{margin:0}img{width:100%;display:block}</style></body></html>`;
const tmp = path.resolve(`.sheet-${Date.now()}.html`);
fs.writeFileSync(tmp, html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1800, height: 900 } });
await p.goto(pathToFileURL(tmp).href);
await p.waitForLoadState("load");
await p.screenshot({ path: out!, fullPage: true });
await b.close();
fs.unlinkSync(tmp);
