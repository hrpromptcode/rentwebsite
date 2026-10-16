import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { forms, navigation, pages, posts, tenants, user } from "@rentweb/db";
import { eq } from "drizzle-orm";
import { provisionTenant, sampleIdentityValues, scrubSampleLinks, stripSampleIdentity } from "../src/tenant/provision";
import { enabledMethods, resolvePromptpayId } from "../src/payments";
import { listTemplates, getTemplate } from "../../templates/src";

let db: TestDb;
const OWNER_ID = "owner-ac02";
const OWNER_EMAIL = "owner.ac02@example.com";
const SAMPLE_HREF = /^(?:https?:\/\/(?:line\.me|lin\.ee)\/|tel:|mailto:)/i;

function hrefs(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => hrefs(v, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) (k === "href" && typeof v === "string" ? out.push(v) : hrefs(v, out));
  return out;
}

async function tenantRow(id: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id));
  return t!;
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  await db.insert(user).values({ id: OWNER_ID, name: "Owner", email: OWNER_EMAIL });
});

describe("new tenants never inherit the template's sample business identity (AC-02 / AC-03)", () => {
  for (const tpl of listTemplates()) {
    it(`${tpl.key}: no sample PromptPay / bank / phone / LINE / e-mail / address`, async () => {
      const r = await provisionTenant({ name: `ร้านใหม่ ${tpl.key}`, slug: `ac02-${tpl.key}`, template: tpl, ownerUserId: OWNER_ID, db: db as never });
      const t = await tenantRow(r.tenantId);
      const settings = t.settings as Record<string, any>;
      expect(settings.payments?.promptpayId).toBeUndefined();
      expect(settings.payments?.promptpayName).toBeUndefined();
      expect(settings.payments?.bankAccounts).toBeUndefined();
      expect(resolvePromptpayId(settings)).toBeNull();
      expect(enabledMethods(settings)).not.toContain("promptpay_qr");
      for (const k of ["phone", "email", "lineId", "address", "mapUrl", "instagram", "facebook"]) expect(settings.contact?.[k], k).toBeUndefined();
      expect(settings.clinic?.licenseNo).toBeUndefined();
      // opening hours stay (order / reservation slots depend on them)
      if ((tpl.settings?.contact as any)?.hours) expect(settings.contact.hours).toEqual((tpl.settings!.contact as any).hours);
      // sample values must not appear anywhere in the stored settings
      const json = JSON.stringify(settings);
      const tplPayments = (tpl.settings?.payments ?? {}) as Record<string, any>;
      const tplContact = (tpl.settings?.contact ?? {}) as Record<string, any>;
      for (const v of [tplPayments.promptpayId, tplContact.phone, tplContact.lineId, tplContact.email, tplContact.address, ...(tplPayments.bankAccounts ?? []).map((b: any) => b.number)]) {
        if (v) expect(json, String(v)).not.toContain(String(v));
      }
      // no LINE / tel / mailto buttons pointing to the sample business in the pages
      const rows = await db.select({ sections: pages.sections, published: pages.publishedSections }).from(pages).where(eq(pages.tenantId, r.tenantId));
      expect(hrefs(rows).filter((h) => SAMPLE_HREF.test(h))).toEqual([]);
      const pagesJson = JSON.stringify(rows);
      for (const [v] of sampleIdentityValues(tpl.settings ?? {})) expect(pagesJson, v).not.toContain(v);
      // seeded forms notify the new owner only
      const fs = await db.select({ notify: forms.notifyEmails }).from(forms).where(eq(forms.tenantId, r.tenantId));
      for (const f of fs) expect(f.notify).toEqual([OWNER_EMAIL]);
    });
  }

  it("demo seeds (ownerless demo-* slug) keep the sample data", async () => {
    const shop = getTemplate("shop")!;
    const r = await provisionTenant({ name: "Demo", slug: "demo-ac02-shop", template: shop, db: db as never });
    const settings = (await tenantRow(r.tenantId)).settings as Record<string, any>;
    expect(settings.payments.promptpayId).toBe((shop.settings!.payments as any).promptpayId);
    expect(settings.contact.phone).toBe((shop.settings!.contact as any).phone);
  });

  it("a real owner picking a demo-* slug still gets clean settings", async () => {
    const r = await provisionTenant({ name: "Owner demo", slug: "demo-owned-shop", template: getTemplate("shop")!, ownerUserId: OWNER_ID, db: db as never });
    const settings = (await tenantRow(r.tenantId)).settings as Record<string, any>;
    expect(settings.payments?.promptpayId).toBeUndefined();
  });

  it("corporate template: no notify address of the sample company, no /blog links, posts stay drafts (AC-03 / SS-06)", async () => {
    const corp = getTemplate("corporate")!;
    expect(JSON.stringify(corp.navigation)).not.toContain("/blog");
    const r = await provisionTenant({ name: "Demo corp", slug: "demo-ac03-corporate", template: corp, db: db as never });
    const fs = await db.select({ notify: forms.notifyEmails }).from(forms).where(eq(forms.tenantId, r.tenantId));
    for (const f of fs) expect(f.notify.join(",")).not.toContain("northstar");
    const nav = await db.select({ items: navigation.items }).from(navigation).where(eq(navigation.tenantId, r.tenantId));
    expect(JSON.stringify(nav)).not.toContain("/blog");
    const ps = await db.select({ status: posts.status }).from(posts).where(eq(posts.tenantId, r.tenantId));
    expect(ps.every((p) => p.status !== "published")).toBe(true);
  });

  it("helpers", () => {
    expect(stripSampleIdentity({ tagline: "x", contact: { phone: "1", hours: [1] }, payments: { promptpayId: "1", enabled: { cod: true } } })).toEqual({ tagline: "x", contact: { hours: [1] }, payments: { enabled: { cod: true } } });
    expect(scrubSampleLinks([{ href: "https://line.me/R/ti/p/@x", label: "LINE" }, { href: "/book" }, { href: "tel:021234567" }])).toEqual([{ href: "/contact", label: "LINE" }, { href: "/book" }, { href: "/contact" }]);
    const samples = sampleIdentityValues({ clinic: { licenseNo: "10101234567" }, contact: { phone: "02-123-4567" } });
    expect(scrubSampleLinks({ eyebrow: "ใบอนุญาตเลขที่ 10101234567", body: "โทร 02-123-4567" }, samples)).toEqual({ eyebrow: "ใบอนุญาตเลขที่ [เลขที่ใบอนุญาต]", body: "โทร [เบอร์โทรของร้าน]" });
  });
});
