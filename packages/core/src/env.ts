import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().optional(),
  DATABASE_ADMIN_URL: z.string().optional(),
  DB_APP_ROLE: z.string().default("app_user"),
  PLATFORM_ROOT_DOMAIN: z.string().default("localhost:3000"),
  WEB_URL: z.string().default("http://localhost:3000"),
  ADMIN_URL: z.string().default("http://localhost:3001"),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  SECRETS_ENCRYPTION_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

/** Root domain without port, e.g. "localhost" or "rentweb.app". */
export function rootDomain(): string {
  return env().PLATFORM_ROOT_DOMAIN.split(":")[0]!.toLowerCase();
}

/** Root domain including port when running locally, e.g. "localhost:3000". */
export function rootHost(): string {
  return env().PLATFORM_ROOT_DOMAIN.toLowerCase();
}

export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "admin",
  "console",
  "api",
  "mail",
  "smtp",
  "status",
  "cdn",
  "static",
  "assets",
  "help",
  "docs",
  "blog",
  "support",
  "billing",
  "dev",
  "staging",
  "demo",
  "ftp",
  "ns1",
  "ns2",
  "rentweb",
]);
