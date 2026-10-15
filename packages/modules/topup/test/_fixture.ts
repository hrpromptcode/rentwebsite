import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { withTenant, codeStock, customers, gamePackages, games, tenants, topupSuppliers, type Tx } from "@rentweb/db";
import { encryptToString } from "@rentweb/core/crypto";
import { registerTopupPaymentHandlers } from "../src/services";

export interface Fixture {
  db: TestDb;
  tenantId: string;
  customerId: string;
  vipCustomerId: string;
  gameSlug: string;
  gameId: string;
  apiPackageId: string;
  stockPackageId: string;
  manualPackageId: string;
  /** run inside the tenant's RLS transaction (app role) */
  tx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  settings: Record<string, unknown>;
}

export const SETTINGS = {
  payments: {
    promptpayId: "0899998888",
    promptpayName: "Test Shop",
    bankAccounts: [{ bank: "กรุงไทย", name: "Test", number: "111-2-33333-4" }],
    enabled: { promptpay: true, bankTransfer: true, wallet: true },
    autoApproveSlips: true,
  },
};

/** Fresh PGlite with one tenant, two customers (member + vip) and one game (api / stock / manual packages, 2 codes). */
export async function makeFixture(opts: { stockCodes?: number } = {}): Promise<Fixture> {
  registerTopupPaymentHandlers();
  const { db } = await createTestDb();
  const [t] = await db.insert(tenants).values({ slug: `t-${Math.random().toString(36).slice(2, 8)}`, name: "Topup Test", siteType: "topup" }).returning({ id: tenants.id });
  const tenantId = t!.id;
  const tx = <T,>(fn: (tx: Tx) => Promise<T>) => withTenant(db, tenantId, fn);

  const ids = await tx(async (tx) => {
    const [c] = await tx.insert(customers).values({ tenantId, phone: "0812345678", name: "Member" }).returning({ id: customers.id });
    const [v] = await tx.insert(customers).values({ tenantId, phone: "0898765432", name: "VIP", tier: "vip" }).returning({ id: customers.id });
    const [sup] = await tx.insert(topupSuppliers).values({ tenantId, name: "manual", provider: "manual", config: {} }).returning({ id: topupSuppliers.id });
    const [g] = await tx
      .insert(games)
      .values({
        tenantId,
        name: "Test Legends",
        slug: "test-legends",
        category: "mobile",
        featured: true,
        fields: [
          { key: "uid", label: "UID", type: "text", required: true },
          { key: "server", label: "Server", type: "select", required: true, options: ["Asia", "EU"] },
        ],
      })
      .returning({ id: games.id });
    const pkgs = await tx
      .insert(gamePackages)
      .values([
        { tenantId, gameId: g!.id, name: "100 Gems", price: 3500, costPrice: 3000, tierPrices: { vip: 3300, agent: 3200 }, fulfillment: "api", supplierId: sup!.id, sort: 0 },
        { tenantId, gameId: g!.id, name: "Gift Code", price: 10000, costPrice: 9000, tierPrices: { vip: 9800 }, fulfillment: "stock", sort: 1 },
        { tenantId, gameId: g!.id, name: "Manual Pack", price: 5000, fulfillment: "manual", supplierId: sup!.id, sort: 2 },
      ])
      .returning({ id: gamePackages.id, fulfillment: gamePackages.fulfillment });
    const stock = pkgs.find((p) => p.fulfillment === "stock")!;
    const n = opts.stockCodes ?? 2;
    if (n > 0) {
      await tx.insert(codeStock).values(Array.from({ length: n }, (_, i) => ({ tenantId, packageId: stock.id, codeEncrypted: encryptToString(`CODE-${i + 1}-XXXX`), serial: `S${i + 1}` })));
    }
    return {
      customerId: c!.id,
      vipCustomerId: v!.id,
      gameId: g!.id,
      apiPackageId: pkgs.find((p) => p.fulfillment === "api")!.id,
      stockPackageId: stock.id,
      manualPackageId: pkgs.find((p) => p.fulfillment === "manual")!.id,
    };
  });

  return { db, tenantId, gameSlug: "test-legends", tx, settings: SETTINGS, ...ids };
}
