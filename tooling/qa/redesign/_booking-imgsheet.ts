import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const [, , idsFile, out, w = "180", h = "240"] = process.argv;
const ids = readFileSync(idsFile!, "utf8").split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
const html = `<html><body style="margin:0;font:12px sans-serif;display:flex;flex-wrap:wrap;gap:4px;background:#222;color:#fff">${ids
  .map((id, i) => `<figure style="margin:0;width:${w}px"><img src="https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${Number(w) * 2}&h=${Number(h) * 2}&q=60" style="width:${w}px;height:${h}px;object-fit:cover;display:block"><figcaption>${i}: ${id.slice(0, 16)}</figcaption></figure>`)
  .join("")}</body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.setContent(html, { waitUntil: "networkidle" });
await p.screenshot({ path: out!, fullPage: true });
await b.close();
