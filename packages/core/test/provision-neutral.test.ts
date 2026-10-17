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
      const about = rows.find((p) => p.slug === "about")!;
      expect(strings(about.sections).join(" ")).toContain(name);
      const privacy = rows.find((p) => p.slug === "privacy")!;
      expect(strings(privacy.sections).join(" ")).toContain(name);
      for (const p of rows) for (const s of p.sections) if (s.type === "testimonials") expect(s.hidden).toBe(true);
      // the published copy is the same
      for (const p of rows) expect(p.publishedSections).toEqual(p.sections);
    });
  }

  it("demo sites keep the sample brand (they ARE the demo)", async () => {
    const tpl = listTemplates().find((t) => t.key === "shop")!;
    const r = await provisionTenant({ name: "Demo", slug: "demo-b207-shop", template: tpl, db: db as never });
    const rows = await db.select().from(pages).where(eq(pages.tenantId, r.tenantId));
    expect(strings(rows.map((p) => p.sections)).join("\n")).toContain("Siam Atelier");
    expect(rows.flatMap((p) => p.sections).some((s) => s.type === "testimonials" && !s.hidden)).toBe(true);
  });
});
