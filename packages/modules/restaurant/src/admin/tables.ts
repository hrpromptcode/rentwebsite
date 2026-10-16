import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { diningTables, restaurantOrders, tableSessions, type Tx } from "@rentweb/db";
import { fail, ok, shortCode, type Result } from "@rentweb/core";
import { ACTIVE_SESSION_STATUSES, isSessionOpen } from "../services/tables";

export interface TableRow {
  id: string;
  name: string;
  zone: string | null;
  seats: number;
  qrToken: string;
  active: boolean;
  sort: number;
  createdAt: string;
  session: { id: string; status: string; openedAt: string; total: number; dueTotal: number; ordersCount: number } | null;
}

export async function listTablesAdmin(tx: Tx, tenantId: string): Promise<TableRow[]> {
  const tables = await tx.select().from(diningTables).where(eq(diningTables.tenantId, tenantId)).orderBy(asc(diningTables.sort), asc(diningTables.name));
  if (!tables.length) return [];
  const sessions = await tx
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.tenantId, tenantId), inArray(tableSessions.status, [...ACTIVE_SESSION_STATUSES])))
    .orderBy(asc(tableSessions.openedAt));
  const sessionIds = sessions.map((s) => s.id);
  const orders = sessionIds.length
    ? await tx
        .select({ sessionId: restaurantOrders.sessionId, total: restaurantOrders.total, paymentStatus: restaurantOrders.paymentStatus })
        .from(restaurantOrders)
        .where(and(eq(restaurantOrders.tenantId, tenantId), inArray(restaurantOrders.sessionId, sessionIds), ne(restaurantOrders.status, "cancelled")))
    : [];
  return tables.map((t) => {
    // the guests' current session first; an unsettled (paid / expired) one otherwise
    const s = sessions.find((x) => x.tableId === t.id && isSessionOpen(x)) ?? sessions.find((x) => x.tableId === t.id);
    let session: TableRow["session"] = null;
    if (s) {
      const mine = orders.filter((o) => o.sessionId === s.id);
      const total = mine.reduce((a, o) => a + o.total, 0);
      const due = mine.filter((o) => o.paymentStatus === "unpaid" || o.paymentStatus === "pay_at_counter").reduce((a, o) => a + o.total, 0);
      session = { id: s.id, status: s.status, openedAt: s.openedAt.toISOString(), total, dueTotal: due, ordersCount: mine.length };
    }
    return { id: t.id, name: t.name, zone: t.zone, seats: t.seats, qrToken: t.qrToken, active: t.active, sort: t.sort, createdAt: t.createdAt.toISOString(), session };
  });
}

/** `{tenant8}-{table}-{rand6}` like the demo seed – URL safe. */
export function makeQrToken(tenantId: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "t";
  return `${tenantId.slice(0, 8)}-${slug}-${shortCode("", 6).toLowerCase()}`;
}

export async function saveTable(tx: Tx, tenantId: string, input: { id?: string | null; name: string; zone?: string | null; seats: number; active: boolean; sort?: number }): Promise<Result<{ id: string; qrToken: string }>> {
  const name = input.name.trim();
  if (!name) return fail("กรุณากรอกชื่อโต๊ะ", "name_required");
  const seats = Math.max(1, Math.min(50, Math.round(input.seats)));
  const zone = input.zone?.trim() || null;
  const [dup] = await tx.select({ id: diningTables.id }).from(diningTables).where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.name, name))).limit(1);
  if (dup && dup.id !== input.id) return fail(`มีโต๊ะชื่อ "${name}" อยู่แล้ว`, "duplicate");
  if (input.id) {
    const [row] = await tx
      .update(diningTables)
      .set({ name, zone, seats, active: input.active, ...(input.sort !== undefined ? { sort: input.sort } : {}) })
      .where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.id, input.id)))
      .returning({ id: diningTables.id, qrToken: diningTables.qrToken });
    if (!row) return fail("ไม่พบโต๊ะ", "not_found");
    return ok(row);
  }
  const all = await tx.select({ sort: diningTables.sort }).from(diningTables).where(eq(diningTables.tenantId, tenantId));
  const sort = input.sort ?? all.reduce((m, r) => Math.max(m, r.sort), -1) + 1;
  for (let attempt = 0; attempt < 5; attempt++) {
    const qrToken = makeQrToken(tenantId, name);
    const [clash] = await tx.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.qrToken, qrToken)).limit(1);
    if (clash) continue;
    const [row] = await tx.insert(diningTables).values({ tenantId, name, zone, seats, active: input.active, sort, qrToken }).returning({ id: diningTables.id, qrToken: diningTables.qrToken });
    return ok(row!);
  }
  return fail("สร้างรหัส QR ไม่สำเร็จ ลองใหม่อีกครั้ง", "token");
}

export async function regenerateTableQr(tx: Tx, tenantId: string, id: string): Promise<Result<{ id: string; qrToken: string }>> {
  const [t] = await tx.select().from(diningTables).where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.id, id))).limit(1);
  if (!t) return fail("ไม่พบโต๊ะ", "not_found");
  for (let attempt = 0; attempt < 5; attempt++) {
    const qrToken = makeQrToken(tenantId, t.name);
    const [clash] = await tx.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.qrToken, qrToken)).limit(1);
    if (clash) continue;
    const [row] = await tx.update(diningTables).set({ qrToken }).where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.id, id))).returning({ id: diningTables.id, qrToken: diningTables.qrToken });
    return ok(row!);
  }
  return fail("สร้างรหัส QR ไม่สำเร็จ ลองใหม่อีกครั้ง", "token");
}

export async function deleteTable(tx: Tx, tenantId: string, id: string): Promise<Result<{ id: string }>> {
  const [open] = await tx
    .select({ id: tableSessions.id })
    .from(tableSessions)
    .where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.tableId, id), inArray(tableSessions.status, [...ACTIVE_SESSION_STATUSES])))
    .limit(1);
  if (open) return fail("โต๊ะนี้มีลูกค้ากำลังใช้งาน กรุณาปิดโต๊ะก่อนลบ", "in_use");
  const [row] = await tx.delete(diningTables).where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.id, id))).returning({ id: diningTables.id });
  if (!row) return fail("ไม่พบโต๊ะ", "not_found");
  return ok(row);
}

export async function reorderTables(tx: Tx, tenantId: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    await tx.update(diningTables).set({ sort: i }).where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.id, ids[i]!)));
  }
}

/** Distinct zone names (active + inactive tables) for form suggestions. */
export async function listZoneNames(tx: Tx, tenantId: string): Promise<string[]> {
  const rows = await tx.select({ zone: diningTables.zone }).from(diningTables).where(eq(diningTables.tenantId, tenantId));
  return [...new Set(rows.map((r) => r.zone).filter((z): z is string => !!z))];
}
