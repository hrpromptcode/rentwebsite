import "server-only";
import { createAuth } from "./auth-config";

declare global {
  // eslint-disable-next-line no-var
  var __rentwebAuth: ReturnType<typeof createAuth> | undefined;
}

/** Process-wide Better Auth instance (survives HMR). */
export const auth: ReturnType<typeof createAuth> = globalThis.__rentwebAuth ?? (globalThis.__rentwebAuth = createAuth());

export type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type SessionUser = Session["user"];
