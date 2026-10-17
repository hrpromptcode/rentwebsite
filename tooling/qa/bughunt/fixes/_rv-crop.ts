import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
/** reverify-storefront: crop screenshots/<file> to [y0, y1) at scale 1 → screenshots/rvcrop-<file>.  tsx _rv-crop.ts <file> <y0> <y1> */
async function main() {
  const [file, y0s, y1s] = process.argv.slice(2);
  const buf = readFileSync(path.resolve("screenshots", file!));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const y0 = Number(y0s), y1 = Math.min(h, Number(y1s));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: w, height: y1 - y0 } });
  await p.setContent(`<body style="margin:0"><div style="width:${w}px;height:${y1 - y0}px;background:url(data:image/png;base64,${buf.toString("base64")}) 0 -${y0}px no-repeat"></div></body>`);
  await p.waitForTimeout(200);
  const out = path.resolve("screenshots", `rvcrop-${y0}-${file}`);
  await p.screenshot({ path: out });
  console.log(out);
  await b.close();
}
main();
