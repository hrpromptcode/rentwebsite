import { ADMIN, creds, get } from "./security-http.mjs";
const c = creds();
for (const n of ["//evil.example/x", "/\evil.example/x", "https://evil.example"]) {
  const r = await get(`${ADMIN}/login?next=${encodeURIComponent(n)}`, c.u1.cookie);
  console.log("admin login (signed in) next=", JSON.stringify(n), "->", r.status, r.location);
}
for (const n of ["/\evil.example/x", "//evil.example"]) {
  const r = await get(`${ADMIN}/logout?next=${encodeURIComponent(n)}`, "");
  console.log("admin logout next=", JSON.stringify(n), "->", r.status, r.location);
}
// storefront: signed-in customer + ?next=
