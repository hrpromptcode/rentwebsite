import { readFileSync } from "node:fs";
import { resolve } from "node:path";
/**
 * web_visual AM-03: the restaurant-admin journey's toast matcher for step 7 / 7b must accept every message the menu
 * toggle action can answer for the sold-out flag ("ตั้งเป็นหมดชั่วคราวแล้ว" / "เปิดขายอีกครั้งแล้ว"). Static check, prints PASS/FAIL.
 *   pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/AM-03-verify.ts
 */
const root = resolve(process.cwd(), "..");
const journey = readFileSync(resolve(root, "tooling/qa/restaurant-admin-journey.ts"), "utf8");
const actions = readFileSync(resolve(root, "apps/admin/src/app/t/[slug]/restaurant/menu/actions.ts"), "utf8");

// soldOut branch of: const msg = flag === "soldOut" ? (value ? "A" : "B") : …
const m = actions.match(/flag === "soldOut" \? \(value \? "([^"]+)" : "([^"]+)"\)/);
const matchers = [...journey.matchAll(/await toast\(a, \/([^/]+)\/\)/g)].map((x) => new RegExp(x[1]!));
let fails = 0;
if (!m) {
  console.log("FAIL could not find the soldOut messages in actions.ts");
  fails++;
} else {
  for (const msg of [m[1]!, m[2]!]) {
    const ok = matchers.some((re) => re.test(msg));
    if (!ok) fails++;
    console.log(`${ok ? "ok  " : "FAIL"} "${msg}" matched by ${matchers.filter((re) => re.test(msg)).map(String).join(", ") || "none of " + matchers.map(String).join(", ")}`);
  }
}
console.log(fails ? `FAIL ${fails}` : "PASS");
process.exit(fails ? 1 : 0);
