import { customerLogin, TENANTS, webGet } from "./security-http.mjs";
const r = await customerLogin("demo-shop.localhost:3000", TENANTS.shop, "0899990001");
console.log("login:", r.status, r.location, r.cookie ? "cookie ok" : "NO COOKIE");
console.log("set-cookie flags:", r.setCookie.replace(/rw_customer=[^;]+/, "rw_customer=<redacted>"));
for (const next of ["https://evil.example/x", "//evil.example/x", "/" + String.fromCharCode(92) + "evil.example"]) {
  const g = await webGet("demo-shop.localhost:3000", `/account/login?next=${encodeURIComponent(next)}`, r.cookie);
  console.log("signed-in customer GET /account/login?next=", JSON.stringify(next), "->", g.status, g.location);
}
process.exit(0);
