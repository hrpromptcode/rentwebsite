import { readFileSync } from "node:fs";
import { ADMIN, signIn, get } from "../security-http.mjs";
const c = JSON.parse(readFileSync(new URL("../admin_b2-creds.json", import.meta.url), "utf8"));
const s = await signIn(c.owner.email, c.owner.password);
const [p, ...res] = process.argv.slice(2);
const r = await get(`${ADMIN}${p}`, s.cookie);
const text = r.text.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
for (const re of res) console.log(re, "=>", JSON.stringify(text.match(new RegExp(re, "g"))?.slice(0, 5) ?? null));
