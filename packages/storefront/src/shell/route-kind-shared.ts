/**
 * Route kind (docs/design/hi-end-direction.md §6.2) — shared by the server (inline script, layout) and the client
 * (RouteKind, template, shell components). "operational" routes (cart, checkout, account, order status, booking
 * wizards, QR dine-in, wallet, tickets, login, preview) get calm motion only: no Lenis, no custom cursor, no preloader,
 * a plain fade transition and no 3D. Everything else is "marketing". Pure module (no "use client").
 */
export const OPERATIONAL_SEGMENTS = [
  "cart",
  "checkout",
  "account",
  "orders",
  "order",
  "t",
  "wallet",
  "topup",
  "book",
  "bookings",
  "reserve",
  "reservations",
  "stay",
  "stays",
  "tickets",
  "login",
  "preview",
] as const;

export type RouteKindValue = "marketing" | "operational";

const OPERATIONAL = new Set<string>(OPERATIONAL_SEGMENTS);

/** Route kind of the first route segment under the tenant root (null = home). */
export function routeKindOf(segment: string | null | undefined): RouteKindValue {
  if (!segment) return "marketing";
  const first = segment.split("/")[0] ?? "";
  return OPERATIONAL.has(first) ? "operational" : "marketing";
}
