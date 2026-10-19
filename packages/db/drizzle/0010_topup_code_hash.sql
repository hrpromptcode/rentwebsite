ALTER TABLE "code_stock" DROP CONSTRAINT "code_stock_package_id_game_packages_id_fk";
--> statement-breakpoint
ALTER TABLE "code_stock" ADD COLUMN "code_hash" text;--> statement-breakpoint
ALTER TABLE "code_stock" ADD CONSTRAINT "code_stock_package_id_game_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."game_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_stock_tenant_hash_uq" ON "code_stock" USING btree ("tenant_id","code_hash");