import { getTableName, sql, type AnyColumn } from "drizzle-orm";

/**
 * Fully-qualified column reference for the OUTER table inside a correlated subquery that lives in a
 * select field. Drizzle rewrites every column chunk of a single-table select (no joins) to a bare
 * identifier, so `where oi.order_id = ${orders.id}` becomes `"order_id" = "id"` and compares the inner
 * table's own id. `qualified(orders.id)` renders `"orders"."id"` in every context.
 */
export const qualified = (c: AnyColumn) => sql.raw(`"${getTableName(c.table)}"."${c.name}"`);
