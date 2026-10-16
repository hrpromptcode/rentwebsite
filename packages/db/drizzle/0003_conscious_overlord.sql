ALTER TABLE "bookings" ADD COLUMN "extra_staff_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "seats_per_booking" integer;--> statement-breakpoint
-- SBR-001/SBR-004 (booking packet): staffed services with capacity > 1 were sold one seat per booking at the full price (couple package "(2 ท่าน)"). Keep their per-booking price: one booking now takes the whole session (seats_per_booking = capacity) and reserves that many staff.
UPDATE "services" SET "seats_per_booking" = "capacity" WHERE "capacity" > 1 AND "requires_staff" = true AND "seats_per_booking" IS NULL;
