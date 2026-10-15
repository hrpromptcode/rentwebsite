import "server-only";
import type { TenantRuntime } from "@rentweb/core/tenant";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import { currentHost, makeT } from "./tenant";

export async function buildCtx(runtime: TenantRuntime): Promise<StorefrontCtx> {
  const host = await currentHost();
  const proto = host.startsWith("localhost") || host.endsWith(".localhost") || /localhost:\d+$/.test(host) ? "http" : "https";
  return {
    tenant: runtime.config,
    theme: runtime.theme,
    locale: runtime.config.locale,
    t: makeT(runtime.config.locale),
    origin: `${proto}://${host}`,
    customer: null,
    cartCount: 0,
  };
}
