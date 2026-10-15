"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, customers, eq } from "@rentweb/db";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

const schema = z.object({
  notes: z.string().max(5000).nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20),
  tier: z.enum(["member", "vip", "agent"]).default("member"),
});

export async function updateCustomer(slug: string, customerId: string, input: z.input<typeof schema>): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const tags = [...new Set(parsed.data.tags.map((t) => t.toLowerCase()))];
  const updated = await tenantTx(ctx.tenant.id, async (tx) => {
    const r = await tx
      .update(customers)
      .set({ notes: parsed.data.notes, tags, tier: parsed.data.tier })
      .where(and(eq(customers.tenantId, ctx.tenant.id), eq(customers.id, customerId)))
      .returning({ id: customers.id });
    return r.length > 0;
  });
  if (!updated) return { ok: false, error: "ไม่พบลูกค้า" };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "customer.update", targetType: "customer", targetId: customerId });
  revalidatePath(`/t/${slug}/customers/${customerId}`);
  revalidatePath(`/t/${slug}/customers`);
  return { ok: true, message: "บันทึกข้อมูลลูกค้าแล้ว" };
}

export async function toggleCustomerBlock(slug: string, customerId: string, block: boolean): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  await tenantTx(ctx.tenant.id, (tx) =>
    tx
      .update(customers)
      .set({ blockedAt: block ? new Date() : null })
      .where(and(eq(customers.tenantId, ctx.tenant.id), eq(customers.id, customerId))),
  );
  revalidatePath(`/t/${slug}/customers/${customerId}`);
  return { ok: true, message: block ? "บล็อกลูกค้าแล้ว" : "ปลดบล็อกแล้ว" };
}
