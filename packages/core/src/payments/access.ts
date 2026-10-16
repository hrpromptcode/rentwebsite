import { and, eq } from "drizzle-orm";
import { bookings, orders, reservations, restaurantOrders, tableSessions, topupOrders, type Tx } from "@rentweb/db";
import { safeEqual } from "../crypto";
import { normalizeThaiPhone } from "../utils";
import { accessChecks, type PaymentAccessProof, type PaymentAccessVia, type PaymentRow } from "./registry";

const keyMatches = (expected: unknown, given: string | null | undefined) => typeof expected === "string" && expected.length > 0 && !!given && safeEqual(expected, given);
const tokenMatches = (expected: string | null | undefined, given: string | null | undefined) => !!expected && !!given && safeEqual(expected.toUpperCase(), given.trim().toUpperCase());
const phoneMatches = (expected: string | null | undefined, given: string | null | undefined) => {
  const p = given ? normalizeThaiPhone(given) : null;
  return !!expected && !!p && safeEqual(expected, p);
};

/**
 * Storefront authorisation for one payment, mirroring how each module's public page gates its target:
 *   order          – owner session or order.metadata.accessKey (?k=)
 *   booking        – owner session or booking.answers.accessKey (?k=)
 *   topup          – owner session or the top-up order access key (?k=, stored as device_id)
 *   rest_order     – table session token (rw_table cookie) for dine-in orders / table bills, phone (?p=) for pickup
 *   reservation    – owner session or the phone used to reserve (?p=)
 *   wallet_topup / patient_package / invoice – the payment's own customer (session)
 * Any refType: the signed-in customer that owns the payment (payment.customerId).
 * Returns how access was proven, or null to deny. Secrets are compared timing-safe.
 * A module can override its refType with registerPaymentAccessCheck().
 */
export async function canAccessPayment(tx: Tx, payment: PaymentRow, proof: PaymentAccessProof): Promise<PaymentAccessVia | null> {
  const custom = accessChecks.get(payment.refType);
  if (custom) {
    const r = await custom(tx, payment, proof);
    if (r === false) return null;
    if (r) return r;
  }
  if (proof.customerId && payment.customerId && proof.customerId === payment.customerId) return "customer";
  const tenantId = payment.tenantId;
  const id = payment.refId;
  const owner = (customerId: string | null | undefined) => !!proof.customerId && !!customerId && proof.customerId === customerId;

  switch (payment.refType) {
    case "order": {
      const [o] = await tx.select({ customerId: orders.customerId, metadata: orders.metadata }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, id))).limit(1);
      if (!o) return null;
      if (owner(o.customerId)) return "customer";
      return keyMatches((o.metadata as { accessKey?: unknown } | null)?.accessKey, proof.accessKey) ? "access_key" : null;
    }
    case "booking": {
      const [b] = await tx.select({ customerId: bookings.customerId, answers: bookings.answers }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, id))).limit(1);
      if (!b) return null;
      if (owner(b.customerId)) return "customer";
      return keyMatches((b.answers as { accessKey?: unknown } | null)?.accessKey, proof.accessKey) ? "access_key" : null;
    }
    case "topup": {
      const [o] = await tx.select({ customerId: topupOrders.customerId, deviceId: topupOrders.deviceId }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, id))).limit(1);
      if (!o) return null;
      if (owner(o.customerId)) return "customer";
      return keyMatches(o.deviceId, proof.accessKey) ? "access_key" : null;
    }
    case "rest_order": {
      const meta = (payment.providerPayload ?? {}) as { kind?: string };
      if (meta.kind === "session") {
        const [s] = await tx.select({ token: tableSessions.token }).from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, id))).limit(1);
        return s && tokenMatches(s.token, proof.tableToken) ? "table" : null;
      }
      const [o] = await tx
        .select({ type: restaurantOrders.type, sessionId: restaurantOrders.sessionId, customerId: restaurantOrders.customerId, customerPhone: restaurantOrders.customerPhone })
        .from(restaurantOrders)
        .where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.id, id)))
        .limit(1);
      if (!o) return null;
      if (owner(o.customerId)) return "customer";
      if (o.type === "dine_in") {
        if (!o.sessionId) return null;
        const [s] = await tx.select({ token: tableSessions.token }).from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, o.sessionId))).limit(1);
        return s && tokenMatches(s.token, proof.tableToken) ? "table" : null;
      }
      return phoneMatches(o.customerPhone, proof.phone) ? "phone" : null;
    }
    case "reservation": {
      const [r] = await tx.select({ customerId: reservations.customerId, phone: reservations.phone }).from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, id))).limit(1);
      if (!r) return null;
      if (owner(r.customerId)) return "customer";
      return phoneMatches(r.phone, proof.phone) ? "phone" : null;
    }
    default:
      return null;
  }
}

/** Strong proofs may auto-approve a slip (when the tenant enables it); a phone number alone never does. */
export function isStrongPaymentAccess(via: PaymentAccessVia | null): boolean {
  return via === "customer" || via === "access_key" || via === "table";
}
