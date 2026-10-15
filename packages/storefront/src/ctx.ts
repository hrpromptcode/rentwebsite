import type { ResolvedTheme, TenantConfig } from "@rentweb/core";
import type { T } from "@rentweb/i18n";

/** Passed to every shell/section component on the storefront (server side). */
export interface StorefrontCtx {
  tenant: TenantConfig;
  theme: ResolvedTheme;
  locale: string;
  t: T;
  /** absolute origin of this storefront, e.g. https://shop.rentweb.app */
  origin: string;
  /** currently signed-in storefront customer (if any) */
  customer?: { id: string; name: string | null } | null;
  cartCount?: number;
}

export interface TenantContactSettings {
  phone?: string;
  email?: string;
  lineId?: string;
  lineUrl?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  address?: string;
  mapUrl?: string;
  hours?: Array<{ day: string; time: string }>;
}

export function contactOf(ctx: StorefrontCtx): TenantContactSettings {
  return ((ctx.tenant.settings.contact as TenantContactSettings | undefined) ?? {}) as TenantContactSettings;
}
