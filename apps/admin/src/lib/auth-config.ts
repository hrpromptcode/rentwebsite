import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { account, getAdminDb, session, twoFactor, user, verification, type Db } from "@rentweb/db";

/**
 * Better Auth configuration shared by the admin app and tooling scripts (create-admin).
 * Kept free of `server-only` so tsx scripts can import it.
 */
export function createAuth(db: Db = getAdminDb()) {
  return betterAuth({
    appName: "RentWeb",
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.ADMIN_URL ?? "http://localhost:3001",
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [process.env.ADMIN_URL ?? "http://localhost:3001", process.env.WEB_URL ?? "http://localhost:3000"],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification, twoFactor },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    user: {
      additionalFields: {
        /** platform-level role: "user" | "superadmin" */
        role: { type: "string", required: false, defaultValue: "user", input: false },
        locale: { type: "string", required: false, defaultValue: "th", input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        /** currently selected tenant (workspace) for this session */
        activeTenantId: { type: "string", required: false, input: false },
        /** set while a superadmin is viewing a tenant back-office they are not a member of */
        impersonatedBy: { type: "string", required: false, input: false },
      },
    },
    advanced: {
      cookiePrefix: "rentweb",
      database: { generateId: "uuid" },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
