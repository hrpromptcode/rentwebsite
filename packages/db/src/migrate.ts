import "./load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { securitySql } from "./rls";

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL must be set");
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(client);

  console.log("→ applying drizzle migrations…");
  await migrate(db, { migrationsFolder: path.resolve(here, "../drizzle") });

  console.log("→ applying role, RLS policies and extra constraints…");
  await db.execute(sql.raw(securitySql()));

  console.log("✓ database is up to date");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
