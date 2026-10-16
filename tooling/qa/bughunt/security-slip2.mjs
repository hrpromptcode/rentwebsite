import { readFileSync } from "node:fs";
import { WEB, db } from "./security-http.mjs";
const o = JSON.parse(readFileSync(new URL("./security-order.json", import.meta.url), "utf8"));
const host = "sec-u1shop.localhost:3000";
const name = process.argv[2] ?? "slip.html";
const type = process.argv[3] ?? "image/png";
const html = "<html><body><h1>SEC-PROBE</h1><script>document.title='SEC-XSS '+document.domain</script></body></html>";
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="SEC-XSS-SVG"</script></svg>';
const fd = new FormData();
fd.append("slip", new Blob([name.endsWith(".svg") ? svg : html], { type }), name);
const r = await fetch(`${WEB}/api/payments/${o.paymentId}/slip`, { method: "POST", headers: { "x-forwarded-host": host }, body: fd });
const j = await r.json(); console.log("upload", name, type, "->", r.status, JSON.stringify(j));
if (j.slipUrl) {
  const g = await fetch(`${WEB}${j.slipUrl}`, { headers: { "x-forwarded-host": host } });
  console.log("served", j.slipUrl, g.status, "content-type:", g.headers.get("content-type"), "body starts:", (await g.text()).slice(0, 60));
}
console.log("db payment:", (await db()`select status, verified_by, slip_url from payments where id=${o.paymentId}`)[0]);
process.exit(0);
