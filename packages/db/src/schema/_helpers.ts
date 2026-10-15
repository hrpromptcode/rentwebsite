import { bigint, timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/** Time-ordered UUID v7 primary key generated in the app layer (works on Postgres 15–17). */
export const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

/** Money is stored as integer satang (1 THB = 100 satang). */
export const money = (name: string) => bigint(name, { mode: "number" });

export const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
