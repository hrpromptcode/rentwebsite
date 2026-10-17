import assert from "node:assert/strict";
import { glueMaiYamok, segmentText } from "../../../../packages/ui/src/motion/text-reveal";

/**
 * reverify-storefront regression check: TextReveal never makes the Thai repetition mark (mai yamok) its own part,
 * so it cannot start a line ("ช้า / ๆ แล้ว…" on the demo-salon hero at 390 px).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/_rv-yamok-unit.ts
 */
const YAMOK = String.fromCharCode(0x0e46);
const NBSP = String.fromCharCode(0xa0);
const heading = `หายใจเข้าช้า ${YAMOK} แล้วปล่อยให้เราดูแล`;

const parts = segmentText(heading);
console.log(JSON.stringify(parts));
assert.ok(!parts.some((p) => p.trim().startsWith(YAMOK)), "a part starts with mai yamok");
assert.ok(parts.some((p) => p.endsWith(`ช้า${NBSP}${YAMOK}`)), "ช้า + NBSP + mai yamok not glued into one part");
assert.equal(parts.join("").split(NBSP).join(" "), heading, "visible text changed");

assert.deepEqual(glueMaiYamok(["ง่าย", " ", YAMOK, " ", "3"]), [`ง่าย${NBSP}${YAMOK}`, " ", "3"]);
assert.deepEqual(glueMaiYamok(["เร็ว", YAMOK]), [`เร็ว${YAMOK}`]);
assert.deepEqual(glueMaiYamok([YAMOK, " ", "a"]), [YAMOK, " ", "a"], "leading mark left alone");
assert.deepEqual(glueMaiYamok([" ", YAMOK]), [" ", YAMOK], "nothing to glue to");
assert.ok(segmentText(`ทดสอบ ${YAMOK}`, "chars").includes(YAMOK), "chars granularity untouched");
console.log("PASS mai yamok glue");
