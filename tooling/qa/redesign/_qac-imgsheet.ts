/** qa-c: contact sheet of local images (args: dir out.png [cols]) with file names as captions. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
const [dir, out, cols = "4"] = process.argv.slice(2) as [string, string, string?];
const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const html = `<!doctype html><body style="margin:0;background:#222;color:#ddd;font:13px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${files.map((f) => `<figure style="margin:0"><img style="width:100%;display:block" src="${pathToFileURL(path.join(dir, f)).href}"><figcaption>${f}</figcaption></figure>`).join("")}</div>`;
const tmp = path.join(dir, "_sheet.html");
fs.writeFileSync(tmp, html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 800 } });
await p.goto(pathToFileURL(tmp).href);
await p.waitForLoadState("load");
await p.screenshot({ path: out, fullPage: true });
await b.close();
fs.unlinkSync(tmp);
