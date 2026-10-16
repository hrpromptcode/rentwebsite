import { and, eq } from "drizzle-orm";
import { bookings, orders, patientPackages, reservations, restaurantOrders, topupOrders, type Tx } from "@rentweb/db";
import type { PaymentRow } from "./registry";

/**
 * Built-in "is the payment's target already closed?" checks, used by markPaid() before it runs the
 * module's paid handler when the module has not registered its own check (registerPaymentTargetCheck).
 * A non-null reason means: money arrived for something that was cancelled / refunded → do not fulfil,
 * flag the payment for a manual refund instead. A missing target returns null (the handler decides).
 */
export async function builtinTargetClosedReason(tx: Tx, payment: PaymentRow): Promise<string | null> {
  const tenantId = payment.tenantId;
  const id = payment.refId;
  switch (payment.refType) {
    case "order": {
      const [o] = await tx.select({ status: orders.status, paymentStatus: orders.paymentStatus }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, id))).limit(1);
      if (!o) return null;
      if (o.status === "cancelled" || o.status === "refunded") return `order ${o.status}`;
      if (o.paymentStatus === "refunded") return "order refunded";
      return null;
    }
    case "booking": {
      const [b] = await tx.select({ status: bookings.status, paymentStatus: bookings.paymentStatus }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, id))).limit(1);
      if (!b) return null;
      if (b.status === "cancelled") return "booking cancelled";
      if (b.paymentStatus === "refunded") return "booking refunded";
      return null;
    }
    case "reservation": {
      const [r] = await tx.select({ status: reservations.status }).from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.id, id))).limit(1);
      return r?.status === "cancelled" ? "reservation cancelled" : null;
    }
    case "rest_order": {
      const meta = (payment.providerPayload ?? {}) as { kind?: string };
      if (meta.kind === "session") return null;
      const [o] = await tx
        .select({ status: restaurantOrders.status, paymentStatus: restaurantOrders.paymentStatus })
        .from(restaurantOrders)
        .where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.id, id)))
        .limit(1);
      if (!o) return null;
      if (o.status === "cancelled") return "restaurant order cancelled";
      if (o.paymentStatus === "refunded") return "restaurant order refunded";
      return null;
    }
    case "topup": {
      const [o] = await tx.select({ status: topupOrders.status }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, id))).limit(1);
      return o && (o.status === "cancelled" || o.status === "refunded") ? `topup ${o.status}` : null;
    }
    case "patient_package": {
      const [pp] = await tx.select({ status: patientPackages.status }).from(patientPackages).where(and(eq(patientPackages.tenantId, tenantId), eq(patientPackages.id, id))).limit(1);
      // pending purchase whose payment expired / was voided → "cancelled" (booking onPatientPackagePaymentClosed)
      return pp && (pp.status === "cancelled" || pp.status === "refunded") ? `package ${pp.status}` : null;
    }
    default:
      return null;
  }
}
