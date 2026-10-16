/** SS-04 + SS-05 regression for POST /api/forms/<slug> (needs the dev server on :3000; prints PASS/FAIL).
 *   cd tooling && npx tsx qa/bughunt/fixes/SS-04-verify.ts */
import "../../../load-env";
import http from "node:http";
import { and, eq, formSubmissions, forms, getAdminDb, tenants, withPlatform } from "@rentweb/db";

let fail = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};
function post(host: string, path: string, body: unknown): Promise<{ status: number; json: any }> {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: 3000, path, method: "POST", headers: { host, "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json: any = null;
        try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 120) }; }
        resolve({ status: res.statusCode ?? 0, json });
      });
    });
    r.on("error", reject);
    r.end(data);
  });
}

const HOST = "demo-corporate.localhost:3000";
const db = getAdminDb();
const [t] = await withPlatform(db, (tx) => tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-corporate")).limit(1));
const tid = t!.id;
const formCount = async (slug: string) => (await withPlatform(db, (tx) => tx.select({ id: forms.id }).from(forms).where(and(eq(forms.tenantId, tid), eq(forms.slug, slug))))).length;

// SS-04: unknown slug -> 404 and no row
const bogus = `qa-bogus-${Date.now().toString(36)}`;
const r1 = await post(HOST, `/api/forms/${bogus}`, { name: "x", phone: "0812345678", message: "y" });
check(r1.status === 404, `POST unknown slug -> ${r1.status} ${JSON.stringify(r1.json)}`);
check((await formCount(bogus)) === 0, "no forms row created for the unknown slug");

// SS-05: field-level validation
const bad1 = await post(HOST, "/api/forms/contact", { name: "QA", phone: "12", message: "hi" });
check(bad1.status === 400 && !!bad1.json?.fields?.phone, `phone "12" -> ${bad1.status} fields=${JSON.stringify(bad1.json?.fields)}`);
const bad2 = await post(HOST, "/api/forms/contact", { name: "QA", phone: "abcdefgh", message: "hi" });
check(bad2.status === 400 && !!bad2.json?.fields?.phone, `phone "abcdefgh" -> ${bad2.status} fields=${JSON.stringify(bad2.json?.fields)}`);
const bad3 = await post(HOST, "/api/forms/contact", { name: "", phone: "0812345678", email: "nope", message: "" });
check(bad3.status === 400 && !!bad3.json?.fields?.name && !!bad3.json?.fields?.email && !!bad3.json?.fields?.message, `empty name/message + bad email -> ${JSON.stringify(bad3.json?.fields)}`);
const bad4 = await post(HOST, "/api/forms/contact", "not json");
check(bad4.status === 400, `non-JSON body -> ${bad4.status}`);

// valid submit still works, extra keys are dropped
const stamp = `qa-ss05-${Date.now().toString(36)}`;
const ok = await post(HOST, "/api/forms/contact", { name: "QA ฟอร์ม", phone: "081-234-5678", email: "qa-form@example.com", message: stamp, extraBlob: "A".repeat(1000) });
check(ok.status === 200 && ok.json?.ok === true, `valid submit -> ${ok.status} ${JSON.stringify(ok.json)}`);
const rows = await withPlatform(db, (tx) => tx.select({ data: formSubmissions.data }).from(formSubmissions).where(eq(formSubmissions.tenantId, tid)));
const mine = rows.find((r) => (r.data as Record<string, unknown>).message === stamp);
check(!!mine && !("extraBlob" in (mine.data as object)), `stored submission keeps known keys only: ${JSON.stringify(mine?.data)}`);
const intl = await post(HOST, "/api/forms/contact", { name: "QA", phone: "+44 20 7946 0958", message: "intl" });
check(intl.status === 200, `international +44 phone accepted -> ${intl.status}`);
const big = await post(HOST, "/api/forms/contact", { name: "QA", phone: "0812345678", message: "x".repeat(40_000) });
check(big.status === 413 || big.status === 400, `oversized body -> ${big.status}`);
const hp = await post(HOST, "/api/forms/contact", { name: "bot", phone: "0812345678", message: "spam", website: "http://spam" });
check(hp.status === 200, `honeypot -> ${hp.status} (silently ignored)`);

console.log(fail ? `FAIL ${fail} check(s)` : "PASS all");
process.exit(fail ? 1 : 0);
