import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
/** reverify-storefront: turns each tall screenshots/rv-*.png into a contact sheet (page cut into columns) for a quick visual pass. */
function pngSize(buf: Buffer) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
async function main() {
  const dir = path.resolve(process.cwd(), "screenshots");
  const files = readdirSync(dir).filter((f) => /^rv-demo-.*-(390|1440)\.png$/.test(f) && (process.argv[2] ? f.includes(process.argv[2]) : true));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1800, height: 1000 } });
  for (const f of files) {
    const buf = readFileSync(path.join(dir, f));
    const { w, h } = pngSize(buf);
    const seg = w > 1000 ? 1500 : 1300; // segment height in source px
    const scale = w > 1000 ? 0.36 : 0.55;
    const n = Math.ceil(h / seg);
    const cols = Array.from({ length: n }, (_, i) => `<div style="width:${w * scale}px;height:${seg * scale}px;background:url(data:image/png;base64,${buf.toString("base64")}) no-repeat;background-size:${w * scale}px ${h * scale}px;background-position:0 -${i * seg * scale}px;outline:1px solid red;flex:none"></div>`);
    await page.setViewportSize({ width: Math.ceil(n * (w * scale + 6)), height: Math.ceil(seg * scale) + 4 });
    await page.setContent(`<body style="margin:0;display:flex;gap:6px;background:#888">${cols.join("")}</body>`);
    await page.waitForTimeout(200);
    const out = path.join(dir, f.replace(/^rv-/, "rvsheet-"));
    await page.screenshot({ path: out });
    console.log(out, `${n} cols`);
  }
  await b.close();
}
main();
