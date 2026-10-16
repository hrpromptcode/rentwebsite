/** AC-02 / AC-03 / SS-06 live check: provision real tenants (shop, clinic, corporate) owned by the QA owner from
 * admin_core-creds.json and confirm no sample receiver/contact leaks into settings, storefront or form recipients.
 *   cd tooling && npx tsx qa/bughunt/fixes/AC-02-verify.ts   (needs the dev server on :3000; prints PASS/FAIL) */
import "../../../load-env";
import { readFileSync } from "node:fs";
import http from "node:http";
import { eq, forms, getAdminDb, navigation, tenants, user } from "@rentweb/db";
import { provisionTenant } from "@rentweb/core/tenant";
import { enabledMethods, resolvePromptpayId } from "@rentweb/core/payments";
import { getTemplate } from "@rentweb/templates";

let fail = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};
const get = (host: string, path: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: 3000, path, headers: { host } }, (res) => {
      const c: Buffer[] = [];
      res.on("data", (d) => c.push(d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(c).toString("utf8") }));
    }).on("error", reject);
  });

const db = getAdminDb();
const creds = JSON.parse(readFileSync(new URL("../admin_core-creds.json", import.meta.url), "utf8")) as { owner: { email: string } };
const [owner] = await db.select({ id: user.id, email: user.email }).from(user).where(eq(user.email, creds.owner.email)).limit(1);
if (!owner) throw new Error("QA owner user not found");
const rand = Date.now().toString(36).slice(-5);
const SAMPLE = /0812345678|081-234-5678|0891112222|02-123-4567|02-555-0199|siamatelier|siam-atelier|lumiereclinic|lumiere\.clinic|northstar\.co\.th|@northstar|123-4-56789-0|987-6-54321-0|10101234567/i;

for (const key of ["shop", "clinic", "corporate"]) {
  const r = await provisionTenant({ name: `QA ร้านใหม่ ${key}`, slug: `qa-ac02-${key}-${rand}`, template: getTemplate(key)!, ownerUserId: owner.id, db });
  const [t] = await db.select().from(tenants).where(eq(tenants.id, r.tenantId));
  const settings = t!.settings as Record<string, unknown>;
  check(!SAMPLE.test(JSON.stringify(settings)), `${key}: settings carry no sample identity (${JSON.stringify({ contact: settings.contact, payments: settings.payments })})`);
  check(resolvePromptpayId(settings) === null, `${key}: no PromptPay receiver (methods offered: ${enabledMethods(settings).join(",")})`);
  const host = `${r.slug}.localhost:3000`;
  for (const path of ["/", "/contact"]) {
    const res = await get(host, path);
    check(res.status === 200 && !SAMPLE.test(res.body) && !/line\.me\/R\/ti\/p\/%40(siamatelier|lumiereclinic|northstar)/i.test(res.body), `${key}: storefront ${path} -> ${res.status}, no sample phone/LINE/e-mail/PromptPay`);
  }
  const fs = await db.select({ slug: forms.slug, notify: forms.notifyEmails }).from(forms).where(eq(forms.tenantId, r.tenantId));
  check(fs.every((f) => f.notify.length === 1 && f.notify[0] === owner.email), `${key}: form recipients = owner (${fs.length} form(s))`);
  if (key === "corporate") {
    const nav = await db.select({ items: navigation.items }).from(navigation).where(eq(navigation.tenantId, r.tenantId));
    check(!JSON.stringify(nav).includes("/blog"), "corporate: navigation has no /blog link");
    const home = await get(host, "/");
    check(!/href="\/blog/.test(home.body), "corporate: storefront home has no /blog link");
  }
}
console.log(fail ? `FAIL ${fail} check(s)` : "PASS all");
process.exit(fail ? 1 : 0);
