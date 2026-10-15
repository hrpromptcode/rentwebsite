import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PostgresJsDatabase<Schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything that can run drizzle queries: root db (postgres-js or PGlite) or a transaction. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = PgDatabase<any, any, any>;

export interface CreateDbOptions {
  max?: number;
  /** disable prepared statements (required for Supabase/PgBouncer transaction pooling) */
  prepare?: boolean;
  debug?: boolean;
}

export function createDb(url: string, opts: CreateDbOptions = {}): Db {
  const client = postgres(url, {
    max: opts.max ?? 10,
    prepare: opts.prepare ?? false,
    idle_timeout: 20,
    connect_timeout: 15,
    debug: opts.debug,
    transform: { undefined: null },
  });
  return drizzle(client, { schema });
}

declare global {
  // eslint-disable-next-line no-var
  var __rentwebDb: Db | undefined;
  // eslint-disable-next-line no-var
  var __rentwebAdminDb: Db | undefined;
}

/** Process-wide app connection (RLS enforced via SET LOCAL ROLE inside withTenant). */
export function getDb(): Db {
  if (!globalThis.__rentwebDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalThis.__rentwebDb = createDb(url);
  }
  return globalThis.__rentwebDb;
}

/** Admin connection for migrations/seeds/platform jobs (falls back to DATABASE_URL). */
export function getAdminDb(): Db {
  if (!globalThis.__rentwebAdminDb) {
    const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_ADMIN_URL / DATABASE_URL is not set");
    globalThis.__rentwebAdminDb = createDb(url, { max: 4 });
  }
  return globalThis.__rentwebAdminDb;
}
