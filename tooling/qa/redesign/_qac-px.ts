/** qa-c: background luminance behind light text in a screenshot region. args: png x y w h → white-text contrast at p50 / p90 bg luminance. */
import fs from "node:fs";
import { chromium } from "@playwright/test";
const [file, x, y, w, h] = process.argv.slice(2) as [string, string, string, string, string];
const b = await chromium.launch();
const p = await b.newPage();
await p.addInitScript({ content: "window.__name = (f) => f;" });
await p.goto("about:blank");
const data = fs.readFileSync(file).toString("base64");
const r = await p.evaluate(async ({ data, x, y, w, h }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${data}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(x, y, w, h).data;
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L: number[] = [];
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.2126 * lin(px[i]!) + 0.7152 * lin(px[i + 1]!) + 0.0722 * lin(px[i + 2]!);
    if (l < 0.8) L.push(l); // skip the (white) glyph pixels
  }
  L.sort((a, b) => a - b);
  const q = (f: number) => L[Math.floor(L.length * f)] ?? 0;
  const cr = (l: number) => +(1.05 / (l + 0.05)).toFixed(2);
  return { n: L.length, p50: cr(q(0.5)), p90: cr(q(0.9)), p98: cr(q(0.98)) };
}, { data, x: +x, y: +y, w: +w, h: +h });
console.log(JSON.stringify(r));
await b.close();
