import { sql } from "drizzle-orm";
import type { DbLike, Tx } from "./client";

export interface TenantTxOptions {
  /** Role to switch to inside the transaction. Set to null to keep the connecting role (tests/admin). */
  role?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` inside a transaction scoped to one tenant:
 *   1. set_config('app.tenant_id', tenantId, true)  → RLS policies filter every row
 *   2. SET LOCAL ROLE app_user                       → the role cannot bypass RLS
 * Both settings end automatically with the transaction.
 */
export async function withTenant<T>(
  db: DbLike,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
  opts: TenantTxOptions = {},
): Promise<T> {
  if (!UUID_RE.test(tenantId)) throw new Error(`withTenant: invalid tenant id "${tenantId}"`);
  const role = opts.role === undefined ? (process.env.DB_APP_ROLE ?? "app_user") : opts.role;
  return (db as any).transaction(async (tx: Tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    if (role) {
      const safe = role.replace(/[^a-zA-Z0-9_]/g, "");
      await tx.execute(sql.raw(`set local role "${safe}"`));
    }
    return fn(tx);
  });
}

/**
 * Platform-level transaction: can read/write rows of every tenant (admin console, worker).
 * Only call from code paths that already verified superadmin/system authorization.
 */
export async function withPlatform<T>(db: DbLike, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as any).transaction(async (tx: Tx) => {
    await tx.execute(sql`select set_config('app.role', 'platform', true)`);
    return fn(tx);
  });
}

/** Atomically increments and returns the next value of a per-tenant counter (order numbers…). */
export async function nextCounter(tx: Tx, tenantId: string, key: string, start = 1000): Promise<number> {
  const rows = await tx.execute<{ value: number }>(sql`
    insert into tenant_counters (tenant_id, key, value)
    values (${tenantId}, ${key}, ${start + 1})
    on conflict (tenant_id, key) do update set value = tenant_counters.value + 1
    returning value
  `);
  const first = (rows as unknown as Array<{ value: number }>)[0] ?? (rows as any).rows?.[0];
  return Number(first?.value);
}
