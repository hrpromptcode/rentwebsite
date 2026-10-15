"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSlugAvailable, provisionTenant } from "@rentweb/core/tenant";
import { PRESETS } from "@rentweb/core/theme";
import { RESERVED_SUBDOMAINS } from "@rentweb/core/env";
import { tenantSlug } from "@rentweb/core";
import { getTemplate } from "@rentweb/templates";
import { auditLog } from "@/lib/audit";
import { requireSession } from "@/lib/session";
import type { ActionResult } from "@/components/ui/form";

export async function checkSlugAction(raw: string): Promise<{ slug: string; available: boolean; reason?: string }> {
  await requireSession("/onboarding");
  const slug = tenantSlug(raw);
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return { slug, available: false, reason: "ใช้ a-z 0-9 และขีดกลาง (3–40 ตัวอักษร)" };
  if (RESERVED_SUBDOMAINS.has(slug) || slug.startsWith("demo-")) return { slug, available: false, reason: "ชื่อนี้ถูกสงวนไว้" };
  const available = await isSlugAvailable(slug);
  return { slug, available, reason: available ? undefined : "ชื่อนี้ถูกใช้แล้ว" };
}

const createSchema = z.object({
  template: z.string().min(1),
  name: z.string().trim().min(2, "ชื่อร้านต้องมีอย่างน้อย 2 ตัวอักษร").max(60),
  slug: z.string().min(3).max(40),
  preset: z.string().min(1),
});

export async function createSiteAction(input: z.input<typeof createSchema>): Promise<ActionResult> {
  const session = await requireSession("/onboarding");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const { template: templateKey, name, preset } = parsed.data;
  const template = getTemplate(templateKey);
  if (!template) return { ok: false, error: "ไม่พบเทมเพลต" };
  if (!PRESETS[preset]) return { ok: false, error: "ไม่พบธีมที่เลือก" };
  const check = await checkSlugAction(parsed.data.slug);
  if (!check.available) return { ok: false, error: check.reason ?? "ชื่อเว็บไม่ว่าง" };

  const result = await provisionTenant({
    name,
    slug: check.slug,
    template,
    ownerUserId: session.user.id,
    themeOverrides: { preset },
  });
  await auditLog({ tenantId: result.tenantId, actorType: "user", actorId: session.user.id, action: "tenant.create", targetType: "tenant", targetId: result.tenantId, diff: { template: templateKey, preset, slug: result.slug } });
  redirect(`/t/${result.slug}/dashboard?welcome=1`);
}
