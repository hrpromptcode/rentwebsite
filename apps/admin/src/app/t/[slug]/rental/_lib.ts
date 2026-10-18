import type { Actor } from "@rentweb/module-rental/admin";
import type { TenantCtx } from "@/lib/tenant";

export function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

export const rentalBase = (slug: string) => `/t/${slug}/rental`;
