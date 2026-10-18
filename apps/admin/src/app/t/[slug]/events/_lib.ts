import { getAdminDb } from "@rentweb/db";
import { loadEventsModuleConfig, type Actor, type EventsConfig, type OrderOpts } from "@rentweb/module-events/admin";
import type { TenantCtx } from "@/lib/tenant";

export function actorOf(ctx: TenantCtx): Actor {
  return { userId: ctx.userId, actorType: ctx.impersonating ? "superadmin" : "user" };
}

export const eventsBase = (slug: string) => `/t/${slug}/events`;

/** Storefront origin for relative "/uploads/…" previews. */
export const assetBase = () => process.env.WEB_URL ?? "http://localhost:3000";

export async function eventsModuleConfig(ctx: TenantCtx): Promise<EventsConfig> {
  return (await loadEventsModuleConfig(getAdminDb(), ctx.tenant.id)).events;
}

/** OrderOpts for the order services (module config from tenant_modules + the tenant's settings for the payments block). */
export async function orderOpts(ctx: TenantCtx): Promise<OrderOpts> {
  return { config: await eventsModuleConfig(ctx), settings: (ctx.tenant.settings ?? {}) as Record<string, unknown> };
}

/** Storefront ticket wallet for an order (the access key is what authorises guests). */
export function ticketPageUrl(ctx: Pick<TenantCtx, "storefrontUrl">, orderId: string, accessKey: string): string {
  return `${ctx.storefrontUrl}/tickets/${orderId}?k=${encodeURIComponent(accessKey)}`;
}
