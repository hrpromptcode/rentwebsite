import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Tables that carry a tenant_id but are managed by the platform layer (read across tenants
 * by the admin console, worker or auth). They are NOT protected by tenant RLS.
 */
export const PLATFORM_SCOPED_TABLES = new Set<string>([
  "tenants",
  "tenant_domains",
  "tenant_modules",
  "tenant_members",
  "tenant_invitations",
  "tenant_usage",
  "subscriptions",
  "invoices",
  "audit_logs",
  "events_outbox",
  "notifications",
]);

export const APP_ROLE = process.env.DB_APP_ROLE ?? "app_user";

const TENANT_EXPR = "nullif(current_setting('app.tenant_id', true), '')::uuid";
const PLATFORM_EXPR = "current_setting('app.role', true) = 'platform'";

/** All drizzle tables exported from the schema. */
export function allTables(): Array<{ name: string; table: PgTable; columns: string[] }> {
  const out: Array<{ name: string; table: PgTable; columns: string[] }> = [];
  for (const value of Object.values(schema)) {
    if (value && typeof value === "object" && Symbol.for("drizzle:Name") in (value as object)) {
      try {
        const cfg = getTableConfig(value as PgTable);
        out.push({ name: cfg.name, table: value as PgTable, columns: cfg.columns.map((c) => c.name) });
      } catch {
        /* not a table */
      }
    }
  }
  return out;
}

/** Tables that must be protected by tenant isolation. */
export function tenantScopedTableNames(): string[] {
  return allTables()
    .filter((t) => t.columns.includes("tenant_id") && !PLATFORM_SCOPED_TABLES.has(t.name))
    .map((t) => t.name)
    .sort();
}

/** Idempotent SQL that creates the app role and grants it access to every table. */
export function roleSql(role = APP_ROLE): string {
  const r = role.replace(/[^a-zA-Z0-9_]/g, "");
  return `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${r}') THEN
    CREATE ROLE ${r} NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ${r};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${r};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${r};
DO $$ BEGIN
  EXECUTE format('GRANT %I TO %I', '${r}', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not grant role to current user: %', SQLERRM;
END $$;
`;
}

/** Idempotent SQL enabling + forcing RLS and (re)creating the isolation policies. */
export function rlsSql(): string {
  const stmts: string[] = [];
  for (const name of tenantScopedTableNames()) {
    stmts.push(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY;`);
    stmts.push(`ALTER TABLE "${name}" FORCE ROW LEVEL SECURITY;`);
    stmts.push(`DROP POLICY IF EXISTS tenant_isolation ON "${name}";`);
    stmts.push(
      `CREATE POLICY tenant_isolation ON "${name}" FOR ALL USING (tenant_id = ${TENANT_EXPR}) WITH CHECK (tenant_id = ${TENANT_EXPR});`,
    );
    stmts.push(`DROP POLICY IF EXISTS platform_access ON "${name}";`);
    stmts.push(
      `CREATE POLICY platform_access ON "${name}" FOR ALL USING (${PLATFORM_EXPR}) WITH CHECK (${PLATFORM_EXPR});`,
    );
  }
  return stmts.join("\n");
}

/** Extra constraints drizzle-kit cannot express (exclusion constraints etc.). Idempotent. */
export function extraConstraintsSql(): string {
  return `
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
      WHERE (staff_id IS NOT NULL AND status NOT IN ('cancelled', 'no_show'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balance_non_negative') THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_tx_amount_positive') THEN
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_tx_amount_positive CHECK (amount > 0);
  END IF;
END $$;
`;
}

export function securitySql(): string {
  return [roleSql(), rlsSql(), extraConstraintsSql()].join("\n");
}
