import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { account, getAdminDb, session, twoFactor, user, verification, type Db } from "@rentweb/db";
import { checkName, checkPassword, PASSWORD_MAX, PASSWORD_MIN } from "./signup-rules";

/**
 * ADMIN_B2-08: the API enforces the same name / password rules as the sign-up form (the form alone was bypassable:
 * empty or 5000-char names and 8-space passwords were accepted). Names are trimmed + whitespace-collapsed.
 */
const validateAccountInput = createAuthMiddleware(async (ctx) => {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const fail = (code: string, message: string) => {
    throw new APIError("BAD_REQUEST", { code, message });
  };
  if (ctx.path === "/sign-up/email") {
    const name = checkName(body.name);
    if (!name.ok) fail("INVALID_NAME", name.error);
    const pw = checkPassword(body.password, { email: typeof body.email === "string" ? body.email : undefined, name: name.ok ? name.name : undefined });
    if (pw) fail("WEAK_PASSWORD", pw);
    if (name.ok && name.name !== body.name) return { context: { ...ctx, body: { ...body, name: name.name } } };
    return;
  }
  if (ctx.path === "/update-user" && "name" in body) {
    const name = checkName(body.name);
    if (!name.ok) fail("INVALID_NAME", name.error);
    if (name.ok && name.name !== body.name) return { context: { ...ctx, body: { ...body, name: name.name } } };
    return;
  }
  if (ctx.path === "/change-password" || ctx.path === "/reset-password" || ctx.path === "/set-password") {
    const pw = checkPassword(body.newPassword);
    if (pw) fail("WEAK_PASSWORD", pw);
  }
});

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
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
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
      // user/session/account ids are text columns without a DB default → generate them here
      database: { generateId: () => crypto.randomUUID() },
    },
    hooks: { before: validateAccountInput },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
