-- COR-26: before enforcing one open session per table, retire the duplicates parallel QR scans created
-- (keep the newest open session of each table; the older ones become "expired" so staff can still settle them).
-- table_sessions has FORCE ROW LEVEL SECURITY → act as platform for this transaction.
SELECT set_config('app.role', 'platform', true);--> statement-breakpoint
UPDATE "table_sessions" AS s SET "status" = 'expired', "closed_at" = now()
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "tenant_id", "table_id" ORDER BY "opened_at" DESC, "id" DESC) AS rn
  FROM "table_sessions" WHERE "status" IN ('open', 'bill_requested')
) AS d
WHERE s."id" = d."id" AND d.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_open_table_uq" ON "table_sessions" USING btree ("tenant_id","table_id") WHERE "table_sessions"."status" in ('open', 'bill_requested');
