/** qa-a: avatar crops (crop=faces) for testimonial portraits. tsx qa/redesign/_qa-a-faces.ts id,id,... out.png */
import { chromium } from "@playwright/test";
const [ids, out] = process.argv.slice(2);
const cells = ids!.split(",").map((id) => `<figure><img src="https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=160&h=160&crop=faces&q=80"><figcaption>${id}</figcaption></figure>`).join("");
const html = `<!doctype html><body style="margin:0;background:#222;color:#ddd;font:11px monospace"><div style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:6px">${cells}</div><style>figure{margin:0}img{width:120px;height:120px;border-radius:50%;display:block}</style></body>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 500 } });
await p.setContent(html, { waitUntil: "networkidle", timeout: 120000 });
await p.screenshot({ path: out!, fullPage: true });
await b.close();
