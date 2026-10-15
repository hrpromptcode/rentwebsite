import "./src/load-env";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost/rentweb",
  },
  strict: true,
  verbose: true,
});
