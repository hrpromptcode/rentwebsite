import type { BoardSnapshot, KitchenSnapshot, ReservationRow } from "@rentweb/module-restaurant/admin";
import { assetUrl } from "@/lib/format";

/** Slip images are uploaded on the storefront host; make their URLs absolute before they reach the browser. */
export function absolutizeSnapshot<T extends BoardSnapshot | KitchenSnapshot>(snap: T): T {
  const fix = <O extends { payment: { slipUrl: string | null } | null }>(o: O): O => (o.payment?.slipUrl ? { ...o, payment: { ...o.payment, slipUrl: assetUrl(o.payment.slipUrl) } } : o);
  if ("orders" in snap) return { ...snap, orders: snap.orders.map(fix), sessions: snap.sessions.map(fix) };
  return { ...snap, tickets: snap.tickets.map(fix) };
}

export function absolutizeReservations(rows: ReservationRow[]): ReservationRow[] {
  return rows.map((r) => (r.payment?.slipUrl ? { ...r, payment: { ...r.payment, slipUrl: assetUrl(r.payment.slipUrl) } } : r));
}
