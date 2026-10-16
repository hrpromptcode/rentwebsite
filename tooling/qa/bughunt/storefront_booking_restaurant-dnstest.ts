import dns from "node:dns";
{ const orig = dns.lookup.bind(dns) as any; (dns as any).lookup = (h: string, o: any, cb: any) => (typeof h === "string" && h.endsWith(".localhost") ? orig("127.0.0.1", o, cb) : orig(h, o, cb)); }
{ const dp = (dns as any).promises; const o2 = dp.lookup.bind(dp); dp.lookup = (h: string, o?: any) => (typeof h === "string" && h.endsWith(".localhost") ? o2("127.0.0.1", o) : o2(h, o)); }
import { request } from "@playwright/test";
(async () => { const r = await request.newContext(); const x = await r.get("http://demo-restaurant.localhost:3000/api/restaurant/session/ZZZZZZ"); console.log(x.status()); process.exit(0); })().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
