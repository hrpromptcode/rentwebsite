import "server-only";
import { cookies, headers } from "next/headers";
import { CART_COOKIE, CART_TTL_DAYS } from "@rentweb/module-commerce/services";

/** Cart token from the rw_cart cookie (null when the visitor has no cart yet). */
export async function getCartToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CART_COOKIE)?.value ?? null;
}

/** Only callable from route handlers / server actions (Next forbids cookie writes in RSC). */
export async function setCartToken(token: string) {
  const jar = await cookies();
  const h = await headers();
  const host = h.get("x-tenant-host") ?? h.get("host") ?? "";
  jar.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: !host.includes("localhost"),
    maxAge: CART_TTL_DAYS * 86_400,
    path: "/",
  });
}
