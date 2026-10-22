import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://demo-events.localhost:3000/", { waitUntil: "load" });
await p.waitForTimeout(4000);
console.log(await p.evaluate(() => {
  const el = document.querySelector('[data-testid="hero-cta"]') as HTMLElement;
  const out: unknown[] = [];
  let n: HTMLElement | null = el;
  while (n && out.length < 8) { const cs = getComputedStyle(n); const r = n.getBoundingClientRect(); out.push([n.tagName, n.className.slice(0, 60), cs.opacity, cs.transform.slice(0, 40), cs.visibility, Math.round(r.top), Math.round(r.height)]); n = n.parentElement; }
  return JSON.stringify(out, null, 0);
}));
await b.close();
