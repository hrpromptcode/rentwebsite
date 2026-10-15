import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "./schema";
import { securitySql } from "./rls";

export type TestDb = PgliteDatabase<typeof schema>;

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * In-memory Postgres (PGlite) with the full schema, RLS policies and app role applied.
 * Used by unit/integration tests – no Docker required.
 */
export async function createTestDb(): Promise<{ db: TestDb; client: PGlite }> {
  const client = new PGlite({ extensions: { btree_gist, pg_trgm } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(here, "../drizzle") });
  // multi-statement SQL must go through the simple protocol
  await client.exec(securitySql());
  return { db, client };
}
