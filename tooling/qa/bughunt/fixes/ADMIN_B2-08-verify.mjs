/**
 * ADMIN_B2-08 regression (live, admin :3001): the sign-up API refuses empty / oversized names and
 * blank / weak passwords (not just the form), and still accepts a normal sign-up (user deleted afterwards).
 * Run from tooling/:  node qa/bughunt/fixes/ADMIN_B2-08-verify.mjs
 */
import { db, signUp } from "../security-http.mjs";
let fails = 0;
const check = (name, cond, extra = "") => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`); };
const r = Math.random().toString(36).slice(2, 7);
const cases = [
  ["empty name", { name: "", password: "Qa-b4-Pass-123" }, 400],
  ["whitespace name", { name: "    ", password: "Qa-b4-Pass-123" }, 400],
  ["5000-char name", { name: "ก".repeat(5000), password: "Qa-b4-Pass-123" }, 400],
  ["8-space password", { name: "QA B4", password: "        " }, 400],
  ["7-char password", { name: "QA B4", password: "Ab1-xyz" }, 400],
  ["common password", { name: "QA B4", password: "password123" }, 400],
  ["letters-only password", { name: "QA B4", password: "abcdefghijk" }, 400],
];
const sql = db();
for (const [label, body, want] of cases) {
  const email = `qa-b4-su-${r}-${cases.indexOf(cases.find((c) => c[0] === label))}@example.com`;
  const res = await signUp(email, body.password, body.name);
  const msg = (() => { try { return JSON.parse(res.body).message; } catch { return res.body.slice(0, 80); } })();
  check(`${label} -> ${want}`, res.status === want, { status: res.status, msg });
  const [u] = await sql`select id from "user" where email = ${email}`;
  check(`${label}: no user row`, !u);
}
const okEmail = `qa-b4-su-${r}-ok@example.com`;
const ok = await signUp(okEmail, "Qa-b4-Pass-123", "  QA   B4  Signup ");
check("valid sign-up -> 200", ok.status === 200, { status: ok.status, body: ok.body.slice(0, 120) });
const [u] = await sql`select id, name from "user" where email = ${okEmail}`;
check("name stored trimmed + collapsed", u?.name === "QA B4 Signup", u?.name);
if (u) { await sql`delete from session where user_id = ${u.id}`; await sql`delete from account where user_id = ${u.id}`; await sql`delete from "user" where id = ${u.id}`; }
await sql.end();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
