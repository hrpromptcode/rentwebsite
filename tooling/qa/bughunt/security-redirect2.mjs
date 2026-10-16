import { ADMIN, creds, get } from "./security-http.mjs";
const c = creds();
const bs = String.fromCharCode(92);
const n = "/" + bs + "evil.example/x";
const r = await get(`${ADMIN}/login?next=${encodeURIComponent(n)}`, c.u1.cookie);
console.log("admin login next=", JSON.stringify(n), "->", r.status, r.location, "resolved:", new URL(r.location, ADMIN).href);
const l = await get(`${ADMIN}/logout?next=${encodeURIComponent(n)}`, "");
console.log("admin logout next=", JSON.stringify(n), "->", l.status, l.location);
