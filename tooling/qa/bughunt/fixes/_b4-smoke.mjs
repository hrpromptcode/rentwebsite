import { readFileSync } from "node:fs";
import { ADMIN, signIn, get } from "../security-http.mjs";
const c = JSON.parse(readFileSync(new URL("../admin_b2-creds.json", import.meta.url), "utf8"));
const s = await signIn(c.owner.email, c.owner.password);
const paths = process.argv.slice(2);
for (const p of paths) {
  const r = await get(`${ADMIN}${p}`, s.cookie);
  const err = r.text.match(/(Failed to compile|Module not found|is not a function|Unhandled Runtime Error|Error: [^<"]{0,160})/)?.[0];
  console.log(r.status, p, r.location ?? "", err ?? "", r.text.length);
}
