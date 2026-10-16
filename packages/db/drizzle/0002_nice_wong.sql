ALTER TABLE "carts" ADD COLUMN "merged_into_id" uuid;--> statement-breakpoint
CREATE INDEX "payments_status_expires_idx" ON "payments" USING btree ("status","expires_at") WHERE "payments"."expires_at" is not null;--> statement-breakpoint
-- COR-04: merge duplicate cart lines (created by parallel add-to-cart) into the oldest line before adding the unique constraint
WITH ranked AS (
  SELECT "id", "cart_id", "product_id", "variant_id",
         row_number() OVER (PARTITION BY "cart_id", "product_id", "variant_id" ORDER BY "created_at", "id") AS rn,
         sum("quantity") OVER (PARTITION BY "cart_id", "product_id", "variant_id") AS total_qty
  FROM "cart_items"
), keepers AS (
  UPDATE "cart_items" ci SET "quantity" = LEAST(r.total_qty, 99)
  FROM ranked r WHERE ci."id" = r."id" AND r.rn = 1 AND r.total_qty <> ci."quantity"
  RETURNING ci."id"
)
DELETE FROM "cart_items" ci USING ranked r WHERE ci."id" = r."id" AND r.rn > 1;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_line_uq" UNIQUE NULLS NOT DISTINCT("cart_id","product_id","variant_id");
