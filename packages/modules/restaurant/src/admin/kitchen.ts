import { and, eq, inArray } from "drizzle-orm";
import { restaurantOrderItems, restaurantOrders, type Tx } from "@rentweb/db";
import { fail, ok, type Result } from "@rentweb/core";
import { updateOrderStatus } from "../services/orders";
import { advanceOrder, loadOrders, type BoardOrder } from "./orders";

export interface KitchenSnapshot {
  tickets: BoardOrder[];
  now: string;
}

/** Tickets for the KDS: received / preparing / ready orders, oldest first. */
export async function kitchenSnapshot(tx: Tx, tenantId: string): Promise<KitchenSnapshot> {
  const tickets = await loadOrders(tx, tenantId, inArray(restaurantOrders.status, ["received", "preparing", "ready"]));
  return { tickets, now: new Date().toISOString() };
}

export type KitchenItemStatus = "queued" | "cooking" | "done";

/**
 * Cook marks one line done (or back to cooking). The first touch moves the order to "preparing";
 * when every line is done the order becomes "ready" (pickup orders emit rest_order.ready).
 */
export async function setItemStatus(tx: Tx, tenantId: string, itemId: string, status: KitchenItemStatus): Promise<Result<{ orderId: string; orderStatus: string; itemStatus: string }>> {
  const [item] = await tx.select().from(restaurantOrderItems).where(and(eq(restaurantOrderItems.tenantId, tenantId), eq(restaurantOrderItems.id, itemId))).limit(1);
  if (!item) return fail("ไม่พบรายการ", "not_found");
  const [order] = await tx.select().from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.id, item.orderId))).limit(1);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  if (order.status === "ready" && status !== "done") return fail("ออเดอร์นี้พร้อมเสิร์ฟแล้ว", "already_ready");
  if (!["received", "preparing", "ready"].includes(order.status)) return fail("ออเดอร์นี้ปิดแล้ว", "closed");
  if (item.status === "cancelled") return fail("รายการนี้ถูกยกเลิก", "cancelled");

  let orderStatus = order.status;
  if (order.status === "received") {
    const r = await updateOrderStatus(tx, tenantId, order.id, "preparing"); // marks every line "cooking"
    if (!r.ok) return r;
    orderStatus = r.value.status;
  }
  await tx.update(restaurantOrderItems).set({ status }).where(and(eq(restaurantOrderItems.tenantId, tenantId), eq(restaurantOrderItems.id, itemId)));

  const lines = await tx.select({ status: restaurantOrderItems.status }).from(restaurantOrderItems).where(and(eq(restaurantOrderItems.tenantId, tenantId), eq(restaurantOrderItems.orderId, order.id)));
  const allDone = lines.every((l) => l.status === "done" || l.status === "served" || l.status === "cancelled");
  if (allDone && orderStatus !== "ready") {
    const r = await advanceOrder(tx, tenantId, order.id, "ready");
    if (!r.ok) return r;
    orderStatus = r.value.status;
  }
  return ok({ orderId: order.id, orderStatus, itemStatus: status });
}

/** "เริ่มทำ": received → preparing. */
export async function startTicket(tx: Tx, tenantId: string, orderId: string) {
  return updateOrderStatus(tx, tenantId, orderId, "preparing");
}

/** "เสร็จทั้งใบ": every line done, order → ready. */
export async function completeTicket(tx: Tx, tenantId: string, orderId: string) {
  return advanceOrder(tx, tenantId, orderId, "ready");
}

/** Bump a ready ticket off the screen: dine-in → served, pickup → completed. */
export async function bumpTicket(tx: Tx, tenantId: string, orderId: string) {
  const [order] = await tx.select({ type: restaurantOrders.type, status: restaurantOrders.status }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.id, orderId))).limit(1);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  return advanceOrder(tx, tenantId, orderId, order.type === "dine_in" ? "served" : "completed");
}
