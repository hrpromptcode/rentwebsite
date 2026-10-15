import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./auth";

/** Current Better Auth session (per-request cached). Null when signed out. */
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    const h = await headers();
    return (await auth.api.getSession({ headers: h })) ?? null;
  } catch {
    return null;
  }
});

/** Redirects to /login (keeping the return path) when there is no session. */
export async function requireSession(next?: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return s;
}

export function isSuperadmin(s: Session | null | undefined): boolean {
  return s?.user.role === "superadmin";
}

export async function requireSuperadmin(): Promise<Session> {
  const s = await requireSession("/console");
  if (!isSuperadmin(s)) redirect("/t");
  return s;
}

export async function requestMeta() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent") };
}
