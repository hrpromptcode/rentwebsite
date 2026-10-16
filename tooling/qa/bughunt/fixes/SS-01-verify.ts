/** SS-01 / SEC-005 regression: post-login `next` only accepts same-site relative paths.
 *   cd tooling && npx tsx qa/bughunt/fixes/SS-01-verify.ts   (prints PASS/FAIL) */
import { safeNext } from "../../../../apps/web/src/app/(sites)/rw/[tenantId]/account/safe-next";

const bs = String.fromCharCode(92);
const cases: Array<[unknown, string]> = [
  ["/account/orders", "/account/orders"],
  ["/orders/abc?x=1#top", "/orders/abc?x=1#top"],
  ["/", "/"],
  ["https://evil.example/x", "/account"],
  ["//evil.example/x", "/account"],
  ["///evil.example/x", "/account"],
  ["/" + bs + "evil.example", "/account"],
  [bs + bs + "evil.example", "/account"],
  ["/" + "\t" + "/evil.example", "/account"],
  ["javascript:alert(1)", "/account"],
  ["evil.example", "/account"],
  ["", "/account"],
  [undefined, "/account"],
  [["/a", "/b"], "/account"],
  ["/" + "a".repeat(600), "/account"],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = safeNext(input);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} safeNext(${JSON.stringify(input)}) -> ${JSON.stringify(got)}${ok ? "" : ` (want ${want})`}`);
}
console.log(fail ? `FAIL ${fail} case(s)` : "PASS all");
process.exit(fail ? 1 : 0);
