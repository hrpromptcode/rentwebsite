import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { tenantDomains, tenants } from "@rentweb/db";
import { eq } from "drizzle-orm";
import {
  claimCustomDomain,
  normalizeDomainInput,
  removeCustomDomain,
  verifyCustomDomain,
  type DomainDnsResolver,
} from "../src/tenant/domains";
import { resolveTenantByHost } from "../src/tenant/resolve";

let db: TestDb;
let tenantA = "";
let tenantB = "";
const HOST = "www.qa-domain-claim.test";

/** Fake DNS: TXT/CNAME answers per record name. */
function fakeDns(records: { txt?: Record<string, string[]>; cname?: Record<string, string[]> }): DomainDnsResolver {
  const nx = () => Promise.reject(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
  return {
    resolveTxt: (n) => (records.txt?.[n] ? Promise.resolve(records.txt[n]!.map((v) => [v])) : nx()),
    resolveCname: (n) => (records.cname?.[n] ? Promise.resolve(records.cname[n]!) : nx()),
    resolve4: () => nx(),
  };
}

async function domainRow(id: string) {
  const [d] = await db.select().from(tenantDomains).where(eq(tenantDomains.id, id));
  return d!;
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  globalThis.__rentwebDb = db as never; // resolveTenantByHost uses getDb()
  const [a] = await db.insert(tenants).values({ slug: "dom-a", name: "Squatter A", siteType: "shop" }).returning();
  const [b] = await db.insert(tenants).values({ slug: "dom-b", name: "Real Owner B", siteType: "shop" }).returning();
  tenantA = a!.id;
  tenantB = b!.id;
});

describe("custom domains only route after DNS ownership is verified (ADMIN_B2-11)", () => {
  let claimA = "";
  let claimB = "";
  let tokenB = "";

  it("normalizes owner input", () => {
    expect(normalizeDomainInput("  https://WWW.QA-Domain-Claim.TEST:443/some/path?x=1 ")).toBe(HOST);
  });

  it("a pending claim does not serve the storefront", async () => {
    const r = await claimCustomDomain(db as never, tenantA, `https://${HOST.toUpperCase()}/some/path`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    claimA = r.domain.id;
    expect(r.domain.hostname).toBe(HOST);
    expect(r.domain.status).toBe("pending");
    expect(await resolveTenantByHost(HOST)).toBeNull();
  });

  it("the same tenant cannot add it twice; platform hosts are refused", async () => {
    const dup = await claimCustomDomain(db as never, tenantA, HOST);
    expect(dup).toMatchObject({ ok: false, code: "duplicate" });
    const plat = await claimCustomDomain(db as never, tenantA, "shop.localhost");
    expect(plat.ok).toBe(false);
  });

  it("a failed verification keeps it offline", async () => {
    const v = await verifyCustomDomain(db as never, tenantA, claimA, { resolver: fakeDns({ cname: { [HOST]: ["dom-a.localhost"] } }) });
    expect(v).toMatchObject({ ok: false, code: "txt_missing", status: "failed" });
    expect((await domainRow(claimA)).status).toBe("failed");
    expect(await resolveTenantByHost(HOST)).toBeNull();
  });

  it("another tenant's unverified claim does not block the real owner", async () => {
    const r = await claimCustomDomain(db as never, tenantB, HOST);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    claimB = r.domain.id;
    tokenB = r.domain.verificationToken;
  });

  it("A cannot verify with B's TXT record (token is per claim)", async () => {
    const dns = fakeDns({ txt: { [`_rentweb.${HOST}`]: [tokenB] }, cname: { [HOST]: ["dom-a.localhost"] } });
    const v = await verifyCustomDomain(db as never, tenantA, claimA, { resolver: dns });
    expect(v).toMatchObject({ ok: false, code: "txt_missing" });
  });

  it("CNAME must point at the platform", async () => {
    const dns = fakeDns({ txt: { [`_rentweb.${HOST}`]: [tokenB] }, cname: { [HOST]: ["elsewhere.example.com"] } });
    const v = await verifyCustomDomain(db as never, tenantB, claimB, { resolver: dns });
    expect(v).toMatchObject({ ok: false, code: "cname_mismatch" });
    expect(await resolveTenantByHost(HOST)).toBeNull();
  });

  it("verified owner goes live, the squatter's claim is voided and cannot be re-claimed", async () => {
    const dns = fakeDns({ txt: { [`_rentweb.${HOST}`]: [tokenB] }, cname: { [`${HOST}`]: ["dom-b.localhost."] } });
    const v = await verifyCustomDomain(db as never, tenantB, claimB, { resolver: dns });
    expect(v).toMatchObject({ ok: true, status: "active" });
    expect((await resolveTenantByHost(HOST))?.id).toBe(tenantB); // host cache was invalidated
    expect((await domainRow(claimA)).status).toBe("failed");
    const again = await claimCustomDomain(db as never, tenantA, HOST);
    expect(again).toMatchObject({ ok: false, code: "taken" });
    const reverify = await verifyCustomDomain(db as never, tenantA, claimA, { resolver: dns });
    expect(reverify).toMatchObject({ ok: false, code: "taken" });
    expect((await resolveTenantByHost(HOST))?.id).toBe(tenantB);
  });

  it("the DB allows only one active row per hostname", async () => {
    await expect(db.update(tenantDomains).set({ status: "active" }).where(eq(tenantDomains.id, claimA))).rejects.toThrow();
  });

  it("removing the domain takes it offline immediately", async () => {
    const other = await removeCustomDomain(db as never, tenantA, claimB);
    expect(other.ok).toBe(false); // not A's domain
    const r = await removeCustomDomain(db as never, tenantB, claimB);
    expect(r.ok).toBe(true);
    expect(await resolveTenantByHost(HOST)).toBeNull();
  });
});
