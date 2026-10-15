import "server-only";
import { cookies } from "next/headers";
import type { TenantRuntime } from "@rentweb/core/tenant";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import { CART_COOKIE, cartItemCount } from "@rentweb/module-commerce/services";
import { currentHost, makeT, tenantTx } from "./tenant";

async function currentCartCount(runtime: TenantRuntime): Promise<number> {
  if (!runtime.config.modules.includes("commerce")) return 0;
  try {
    const jar = await cookies();
    const token = jar.get(CART_COOKIE)?.value;
    if (!token) return 0;
    const tenantId = runtime.config.id;
    return await tenantTx(tenantId, (tx) => cartItemCount(tx, tenantId, token));
  } catch {
    return 0;
  }
}

export async function buildCtx(runtime: TenantRuntime): Promise<StorefrontCtx> {
  const [host, cartCount] = await Promise.all([currentHost(), currentCartCount(runtime)]);
  const proto = host.startsWith("localhost") || host.endsWith(".localhost") || /localhost:\d+$/.test(host) ? "http" : "https";
  return {
    tenant: runtime.config,
    theme: runtime.theme,
    locale: runtime.config.locale,
    t: makeT(runtime.config.locale),
    origin: `${proto}://${host}`,
    customer: null,
    cartCount,
  };
}
