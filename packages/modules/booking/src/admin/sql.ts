import { getTableName, sql, type AnyColumn } from "drizzle-orm";

/**
 * Fully-qualified column reference for the OUTER table inside a correlated subquery in a select field.
 * Drizzle renders column chunks of a single-table select as bare identifiers, so
 * `where v.patient_id = ${patients.id}` would become `= "id"` (the inner table's id). Use `qualified(patients.id)`.
 */
export const qualified = (c: AnyColumn) => sql.raw(`"${getTableName(c.table)}"."${c.name}"`);
