import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { pages, user } from "@rentweb/db";
import { eq } from "drizzle-orm";
import { provisionTenant } from "../src/tenant/provision";
import { listTemplates } from "../../templates/src";

/** ADMIN_B2-07: a new shop's sample copy must not tell the demo brand's story under the owner's name. */
let db: TestDb;
const OWNER_ID = "owner-b2-07";
const STORY = /เริ่มต้นในปี|ก่อตั้งในปี|อายุ 70 ปี|เตาอบในคอนโด/;

/**
 * AC-02: where the sample business is and when it opens (address, landmark, BTS/MRT exit, parking soi, opening
 * hours) must not be told to a real shop's customers. Generic patterns, known sample landmarks, and every word of the
 * template's own sample address (street, soi, building, sub-district) that is more specific than the province.
 */
const SAMPLE_PLACE = [/BTS|MRT|Airport Rail Link|ทางออก\s*\d/, /ซอย|ถ\.|ถนน/, /\d{1,2}:\d{2}/, /\d\s*โมง/, /เปิดทุกวัน/];
const SAMPLE_LANDMARKS = ["นิมมาน", "อารีย์", "สุขุมวิท", "เอ็มควอเทียร์", "พร้อมพงษ์", "ซอยสวัสดี", "เจริญกรุง", "บางรัก", "แคปปิตอล"];
/** Address words too generic to be a sample place on their own (the province, "floor", "building"). */
const GENERIC_ADDRESS_WORDS = new Set(["กรุงเทพฯ", "กรุงเทพ", "กรุงเทพมหานคร", "ชั้น", "อาคาร"]);
function addressWords(address: unknown): string[] {
  if (typeof address !== "string") return [];
  // "ถ.นิมมานเหมินท์", "ซอยอารีย์", "เอ็มควอเทียร์", "จ.เชียงใหม่" ... (prefixes kept, so "เชียงใหม่" alone stays allowed)
  return address.split(/[\s()]+/).filter((w) => w.length >= 4 && /[฀-๿A-Za-z]/.test(w) && !GENERIC_ADDRESS_WORDS.has(w));
}
/** Visible copy only: hidden sample testimonials keep their reviewers' home towns (not the shop's location). */
function visibleStrings(sections: Array<{ type: string; hidden?: boolean }>): string[] {
  return strings(sections.filter((s) => !s.hidden));
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  await db.insert(user).values({ id: OWNER_ID, name: "Owner", email: "owner.b207@example.com" });
});

describe("new tenants get brand-neutral sample copy", () => {
  for (const tpl of listTemplates().filter((t) => t.key !== "topup")) {
    it(`${tpl.key}: no sample brand / story, About uses the shop name, sample testimonials hidden`, async () => {
      const name = `ร้านคุณบี ${tpl.key}`;
      const r = await provisionTenant({ name, slug: `b207-${tpl.key}`, template: tpl, ownerUserId: OWNER_ID, db: db as never });
      const rows = await db.select().from(pages).where(eq(pages.tenantId, r.tenantId));
      const text = strings(rows.map((p) => p.sections)).join("\n");
      expect(tpl.sampleBrand?.length).toBeGreaterThan(0);
      for (const b of tpl.sampleBrand ?? []) expect(text).not.toContain(b);
      expect(text).not.toMatch(STORY);
      expect(text).not.toContain("{{name}}");
      // AC-02 residual: no sample location / opening-hours copy (home FAQ, contact body, hero eyebrow, ...)
      const visible = visibleStrings(rows.flatMap((p) => p.sections)).join("\n");
      for (const re of SAMPLE_PLACE) expect(visible, `${tpl.key}: ${visible.match(re)?.[0]}`).not.toMatch(re);
      const contact = ((tpl.settings ?? {}) as { contact?: { address?: string } }).contact;
      for (const w of [...SAMPLE_LANDMARKS, ...addressWords(contact?.address)]) expect(visible, `${tpl.key}: sample place "${w}"`).not.toContain(w);
      const about = rows.find((p) => p.slug === "about")!;
      expect(strings(about.sections).join(" ")).toContain(name);
      const privacy = rows.find((p) => p.slug === "privacy")!;
      expect(strings(privacy.sections).join(" ")).toContain(name);
      for (const p of rows) for (const s of p.sections) if (s.type === "testimonials") expect(s.hidden).toBe(true);
      // the published copy is the same
      for (const p of rows) expect(p.publishedSections).toEqual(p.sections);
    });
  }

  it("demo sites keep the sample brand and location (they ARE the demo)", async () => {
    const tpl = listTemplates().find((t) => t.key === "shop")!;
    const r = await provisionTenant({ name: "Demo", slug: "demo-b207-shop", template: tpl, db: db as never });
    const rows = await db.select().from(pages).where(eq(pages.tenantId, r.tenantId));
    expect(strings(rows.map((p) => p.sections)).join("\n")).toContain("Siam Atelier");
    expect(strings(rows.map((p) => p.sections)).join("\n")).toContain("มีค่ะ ที่ถ.นิมมานเหมินท์ เชียงใหม่ เปิดทุกวัน 10:00–20:00");
    expect(rows.flatMap((p) => p.sections).some((s) => s.type === "testimonials" && !s.hidden)).toBe(true);
  });
});
