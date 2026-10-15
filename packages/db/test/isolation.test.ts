import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "../src/test-utils";
import { withTenant, withPlatform } from "../src/tenant";
import { tenantScopedTableNames } from "../src/rls";
import { pages, products, tenants } from "../src/schema";

let db: TestDb;
let tenantA: string;
let tenantB: string;

/** drizzle wraps driver errors as "Failed query: …" with the real error in `cause`. */
async function errorMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(tenants)
    .values({ slug: "tenant-a", name: "Tenant A", siteType: "shop" })
    .returning({ id: tenants.id });
  const [b] = await db
    .insert(tenants)
    .values({ slug: "tenant-b", name: "Tenant B", siteType: "shop" })
    .returning({ id: tenants.id });
  tenantA = a!.id;
  tenantB = b!.id;

  await withTenant(db, tenantA, async (tx) => {
    await tx.insert(pages).values({ tenantId: tenantA, slug: "home", title: "Home A" });
    await tx.insert(products).values({ tenantId: tenantA, name: "Product A", slug: "a", price: 10000 });
  });
  await withTenant(db, tenantB, async (tx) => {
    await tx.insert(pages).values({ tenantId: tenantB, slug: "home", title: "Home B" });
    await tx.insert(products).values({ tenantId: tenantB, name: "Product B", slug: "b", price: 20000 });
  });
});

describe("tenant isolation (RLS)", () => {
  it("every table with tenant_id has RLS enabled and forced", async () => {
    const names = tenantScopedTableNames();
    expect(names.length).toBeGreaterThan(20);
    const res = (await db.execute(
      sql`select relname, relrowsecurity, relforcerowsecurity from pg_class where relkind = 'r' and relname in ${names}`,
    )) as unknown as { rows: Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }> };
    const list = res.rows ?? (res as unknown as Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>);
    expect(list.length).toBe(names.length);
    for (const r of list) {
      expect(r.relrowsecurity, `${r.relname} rls`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname} force`).toBe(true);
    }
  });

  it("tenant A only sees its own rows even without a WHERE clause", async () => {
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(pages));
    expect(rows.map((r) => r.title)).toEqual(["Home A"]);
  });

  it("tenant A cannot read tenant B rows by id", async () => {
    const [b] = await withTenant(db, tenantB, (tx) => tx.select().from(products));
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(products).where(eq(products.id, b!.id)));
    expect(rows).toHaveLength(0);
  });

  it("tenant A cannot update or delete tenant B rows", async () => {
    const [b] = await withTenant(db, tenantB, (tx) => tx.select().from(products));
    const updated = await withTenant(db, tenantA, (tx) =>
      tx.update(products).set({ name: "hacked" }).where(eq(products.id, b!.id)).returning(),
    );
    expect(updated).toHaveLength(0);
    const deleted = await withTenant(db, tenantA, (tx) => tx.delete(products).where(eq(products.id, b!.id)).returning());
    expect(deleted).toHaveLength(0);
    const [still] = await withTenant(db, tenantB, (tx) => tx.select().from(products));
    expect(still!.name).toBe("Product B");
  });

  it("tenant A cannot insert rows that belong to tenant B", async () => {
    const msg = await errorMessage(
      withTenant(db, tenantA, (tx) =>
        tx.insert(products).values({ tenantId: tenantB, name: "smuggled", slug: "smuggled", price: 1 }),
      ),
    );
    expect(msg).toMatch(/row-level security/i);
  });

  it("no tenant context + app role sees nothing", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local role "app_user"`));
      return tx.select().from(products);
    });
    expect(rows).toHaveLength(0);
  });

  it("platform context can read across tenants", async () => {
    const rows = await withPlatform(db, (tx) => tx.select().from(products));
    expect(rows).toHaveLength(2);
  });
});
