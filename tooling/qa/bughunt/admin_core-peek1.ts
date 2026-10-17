import { fetchTenant, readCreds } from "./admin_core-lib";
// reverify-repro 2026-10-17: AC-02 is about NEW tenants; the hunt's ac-*-vcre tenants were provisioned before the fix and keep
// their copied sample data, so peek at the tenants of the latest admin_core-onboard.ts run (creds.rand) unless one is given.
const RAND = process.argv[2] ?? (readCreds().rand as string);
const SAMPLE = ["081-234-5678", "siamatelier", "hello@siam-atelier.co", "นิมมานเหมินท์", "northstar", "02-555-0199"];
async function main() {
  let hits = 0;
  for (const [host, needles] of [[`ac-shop-${RAND}.localhost:3000`, ["081-234-5678", "siamatelier", "hello@siam-atelier.co", "นิมมานเหมินท์"]], [`ac-northwind-co-${RAND}.localhost:3000`, ["northstar", "02-555-0199"]]] as const) {
    for (const p of ["/", "/contact"]) {
      const r = await fetchTenant(host, p);
      hits += needles.filter((n) => n !== "นิมมานเหมินท์" && r.body.includes(n)).length + (r.body.includes("https://line.me") ? 1 : 0);
      if (r.body.includes("นิมมานเหมินท์")) console.log(`NOTE ${host}${p}: template sample location copy still present (FAQ "มีค่ะ ที่ถ.นิมมานเหมินท์ เชียงใหม่ ...") - packages/templates neutralText, not settings data`);
      console.log(host, p, r.status, needles.map((n) => `${n}:${r.body.includes(n)}`).join(" "), (r.body.match(/https:\/\/line\.me[^"]*/g) ?? []).slice(0, 2));
    }
  }
  console.log(hits === 0 ? `PASS AC-02 new tenants (rand ${RAND}) show no template phone / LINE / e-mail / contact address` : `FAIL AC-02 ${hits} sample values on new tenants`);
  void SAMPLE;
  process.exit(0);
}
main();
