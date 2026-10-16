import { fetchTenant } from "./admin_core-lib";
async function main() {
  for (const [host, needles] of [["ac-shop-vcre.localhost:3000", ["081-234-5678", "siamatelier", "hello@siam-atelier.co", "นิมมานเหมินท์"]], ["ac-northwind-co-vcre.localhost:3000", ["northstar", "02-555-0199"]]] as const) {
    for (const p of ["/", "/contact"]) {
      const r = await fetchTenant(host, p);
      console.log(host, p, r.status, needles.map((n) => `${n}:${r.body.includes(n)}`).join(" "), (r.body.match(/https:\/\/line\.me[^"]*/g) ?? []).slice(0, 2));
    }
  }
  process.exit(0);
}
main();
