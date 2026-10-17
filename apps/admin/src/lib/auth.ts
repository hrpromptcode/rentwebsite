import "server-only";
import { createAuth } from "./auth-config";

declare global {
  // eslint-disable-next-line no-var
  var __rentwebAuth: ReturnType<typeof createAuth> | undefined;
  // eslint-disable-next-line no-var
  var __rentwebAuthFactory: typeof createAuth | undefined;
}

/**
 * Process-wide Better Auth instance (survives HMR). It is rebuilt when auth-config.ts itself was reloaded
 * (new createAuth function), otherwise config changes such as the ADMIN_B2-08 validation hook only took
 * effect after a dev-server restart.
 */
if (globalThis.__rentwebAuthFactory !== createAuth || !globalThis.__rentwebAuth) {
  globalThis.__rentwebAuth = createAuth();
  globalThis.__rentwebAuthFactory = createAuth;
}
export const auth: ReturnType<typeof createAuth> = globalThis.__rentwebAuth;

export type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type SessionUser = Session["user"];
