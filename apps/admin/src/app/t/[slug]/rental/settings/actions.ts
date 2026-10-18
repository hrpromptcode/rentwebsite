"use server";

import { revalidatePath } from "next/cache";
import { getAdminDb } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
import { saveRentalModuleConfig } from "@rentweb/module-rental/admin";
import { fieldErrors, rentalSettingsSchema, type FormResult, type RentalSettingsInput } from "@rentweb/module-rental/admin/schemas";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, tenantHostnames } from "@/lib/tenant";

/** moduleConfig.rental: check-in/out times, cancellation window, deposit policy, booking horizon, hold time. */
export async function saveRentalSettingsAction(slug: string, input: RentalSettingsInput): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const parsed = rentalSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", fieldErrors: fieldErrors(parsed.error) };
  const next = await saveRentalModuleConfig(getAdminDb(), ctx.tenant.id, parsed.data);
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "settings.update", targetType: "tenant", targetId: ctx.tenant.id, diff: { section: "rental", depositPercent: next.depositPercent, freeCancelDays: next.freeCancelDays } });
  // the storefront caches the tenant runtime (incl. moduleConfig): drop it so the new policy applies at once
  await invalidateTenant(ctx.tenant.id, await tenantHostnames(ctx.tenant.id));
  revalidatePath(`/t/${slug}/rental/settings`);
  revalidatePath(`/t/${slug}/rental/bookings`);
  return { ok: true, message: "บันทึกนโยบายการจองแล้ว" };
}
