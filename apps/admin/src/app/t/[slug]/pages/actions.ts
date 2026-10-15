"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, navigation, pageVersions, pages, type NavItem, type SectionJson } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
import { slugify } from "@rentweb/core";
import { SECTION_DEFS } from "@rentweb/storefront/definitions";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, tenantHostnames, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

const sectionSchema = z.object({
  id: z.string().min(1).max(32),
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
  hidden: z.boolean().optional(),
});

const seoSchema = z
  .object({
    title: z.string().max(120).optional(),
    description: z.string().max(320).optional(),
    ogImage: z.string().max(500).optional(),
    noindex: z.boolean().optional(),
    canonical: z.string().max(500).optional(),
  })
  .partial();

const RESERVED_PAGE_SLUGS = new Set(["api", "rw", "account", "cart", "checkout", "products", "collections", "book", "services", "games", "topup", "wallet", "menu", "order", "reserve", "orders", "site-status"]);

function cleanSlug(input: string): string {
  const s = slugify(input, { allowUnicode: false }).slice(0, 60);
  return s || "page";
}

/** Validates every section against its definition; unknown types are kept as-is (hidden) so nothing is lost. */
function normalizeSections(input: unknown): { sections: SectionJson[]; error?: string } {
  const parsed = z.array(sectionSchema).safeParse(input);
  if (!parsed.success) return { sections: [], error: "ข้อมูลเซ็กชันไม่ถูกต้อง" };
  const out: SectionJson[] = [];
  for (const s of parsed.data) {
    const def = SECTION_DEFS[s.type];
    if (!def) {
      out.push({ ...s, props: s.props as Record<string, unknown>, hidden: true });
      continue;
    }
    const r = def.schema.safeParse(s.props);
    if (!r.success) {
      const first = r.error.issues[0];
      return { sections: [], error: `เซ็กชัน “${def.name.th}”: ${first?.path.join(".") ?? ""} ${first?.message ?? "ไม่ถูกต้อง"}`.trim() };
    }
    out.push({ id: s.id, type: s.type, props: r.data as Record<string, unknown>, ...(s.hidden ? { hidden: true } : {}) });
  }
  return { sections: out };
}

export async function createPage(slug: string, fd: FormData): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const title = String(fd.get("title") ?? "").trim();
  if (title.length < 1) return { ok: false, error: "กรุณาตั้งชื่อหน้า" };
  const rawSlug = String(fd.get("slug") ?? "").trim();
  const pageSlug = cleanSlug(rawSlug || title);
  if (RESERVED_PAGE_SLUGS.has(pageSlug)) return { ok: false, error: "slug นี้ถูกสงวนไว้สำหรับระบบ" };

  const id = await tenantTx(ctx.tenant.id, async (tx) => {
    const [exists] = await tx.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.slug, pageSlug))).limit(1);
    if (exists) return null;
    const [row] = await tx
      .insert(pages)
      .values({ tenantId: ctx.tenant.id, slug: pageSlug, title, kind: "page", status: "draft", sections: [], seo: { title }, showInNav: fd.get("showInNav") === "on" })
      .returning({ id: pages.id });
    return row!.id;
  });
  if (!id) return { ok: false, error: `มีหน้า /${pageSlug} อยู่แล้ว` };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "page.create", targetType: "page", targetId: id, diff: { slug: pageSlug, title } });
  revalidatePath(`/t/${slug}/pages`);
  redirect(`/t/${slug}/pages/${id}`);
}

const metaSchema = z.object({
  title: z.string().trim().min(1, "กรุณาตั้งชื่อหน้า").max(120),
  slug: z.string().trim().min(1).max(60),
  showInNav: z.boolean().default(false),
  seo: seoSchema.default({}),
});

export async function savePageDraft(slug: string, pageId: string, input: { sections: unknown; meta: z.input<typeof metaSchema> }): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const meta = metaSchema.safeParse(input.meta);
  if (!meta.success) return { ok: false, error: meta.error.issues[0]?.message ?? "ข้อมูลหน้าไม่ถูกต้อง" };
  const norm = normalizeSections(input.sections);
  if (norm.error) return { ok: false, error: norm.error };

  const result = await tenantTx(ctx.tenant.id, async (tx) => {
    const [page] = await tx.select().from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId))).limit(1);
    if (!page) return { error: "ไม่พบหน้านี้" };
    let newSlug = page.slug;
    if (page.kind !== "home") {
      newSlug = cleanSlug(meta.data.slug);
      if (RESERVED_PAGE_SLUGS.has(newSlug)) return { error: "slug นี้ถูกสงวนไว้สำหรับระบบ" };
      if (newSlug !== page.slug) {
        const [dup] = await tx.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.slug, newSlug))).limit(1);
        if (dup) return { error: `มีหน้า /${newSlug} อยู่แล้ว` };
      }
    }
    // keep a version snapshot of the previous draft when it changed
    if (JSON.stringify(page.sections) !== JSON.stringify(norm.sections)) {
      await tx.insert(pageVersions).values({ tenantId: ctx.tenant.id, pageId, sections: page.sections ?? [], createdBy: ctx.userId });
    }
    await tx
      .update(pages)
      .set({ title: meta.data.title, slug: newSlug, showInNav: meta.data.showInNav, seo: meta.data.seo, sections: norm.sections })
      .where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId)));
    return { slug: newSlug };
  });
  if ("error" in result) return { ok: false, error: result.error! };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "page.update", targetType: "page", targetId: pageId });
  revalidatePath(`/t/${slug}/pages`);
  revalidatePath(`/t/${slug}/pages/${pageId}`);
  return { ok: true, message: "บันทึกฉบับร่างแล้ว", data: { slug: result.slug } };
}

export async function publishPage(slug: string, pageId: string, input?: { sections: unknown; meta: z.input<typeof metaSchema> }): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (input) {
    const saved = await savePageDraft(slug, pageId, input);
    if (!saved.ok) return saved;
  }
  const ok = await tenantTx(ctx.tenant.id, async (tx) => {
    const [page] = await tx.select({ sections: pages.sections }).from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId))).limit(1);
    if (!page) return false;
    await tx
      .update(pages)
      .set({ status: "published", publishedSections: page.sections, publishedAt: new Date() })
      .where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId)));
    return true;
  });
  if (!ok) return { ok: false, error: "ไม่พบหน้านี้" };
  await invalidateTenant(ctx.tenant.id, await tenantHostnames(ctx.tenant.id));
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "page.publish", targetType: "page", targetId: pageId });
  revalidatePath(`/t/${slug}/pages`);
  revalidatePath(`/t/${slug}/pages/${pageId}`);
  return { ok: true, message: "เผยแพร่แล้ว หน้าร้านอัปเดตภายในไม่กี่วินาที" };
}

export async function unpublishPage(slug: string, pageId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const blocked = await tenantTx(ctx.tenant.id, async (tx) => {
    const [page] = await tx.select({ kind: pages.kind }).from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId))).limit(1);
    if (!page) return "ไม่พบหน้านี้";
    if (page.kind === "home") return "หน้าแรกต้องเผยแพร่เสมอ";
    await tx.update(pages).set({ status: "draft" }).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId)));
    return null;
  });
  if (blocked) return { ok: false, error: blocked };
  await invalidateTenant(ctx.tenant.id, await tenantHostnames(ctx.tenant.id));
  revalidatePath(`/t/${slug}/pages`);
  revalidatePath(`/t/${slug}/pages/${pageId}`);
  return { ok: true, message: "ซ่อนหน้าจากหน้าร้านแล้ว" };
}

export async function deletePage(slug: string, pageId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const blocked = await tenantTx(ctx.tenant.id, async (tx) => {
    const [page] = await tx.select({ kind: pages.kind, slug: pages.slug }).from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId))).limit(1);
    if (!page) return "ไม่พบหน้านี้";
    if (page.kind === "home") return "ลบหน้าแรกไม่ได้";
    await tx.delete(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId)));
    return null;
  });
  if (blocked) return { ok: false, error: blocked };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "page.delete", targetType: "page", targetId: pageId });
  revalidatePath(`/t/${slug}/pages`);
  redirect(`/t/${slug}/pages`);
}

/* ---------------- navigation ---------------- */

const navItemSchema: z.ZodType<NavItem> = z.lazy(() =>
  z.object({
    label: z.string().trim().min(1, "กรุณาใส่ชื่อเมนู").max(60),
    href: z.string().trim().min(1, "กรุณาใส่ลิงก์").max(500),
    external: z.boolean().optional(),
    children: z.array(navItemSchema).max(20).optional(),
  }),
);

export async function saveNavigation(slug: string, input: { header: unknown; footer: unknown }): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = z.object({ header: z.array(navItemSchema).max(30), footer: z.array(navItemSchema).max(30) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลเมนูไม่ถูกต้อง" };
  const strip = (items: NavItem[]): NavItem[] => items.map((i) => ({ label: i.label, href: i.href, ...(i.external ? { external: true } : {}), ...(i.children?.length ? { children: strip(i.children).map(({ children: _c, ...rest }) => rest) } : {}) }));
  await tenantTx(ctx.tenant.id, async (tx) => {
    for (const [location, items] of [
      ["header", strip(parsed.data.header)],
      ["footer", strip(parsed.data.footer)],
    ] as const) {
      await tx
        .insert(navigation)
        .values({ tenantId: ctx.tenant.id, location, items })
        .onConflictDoUpdate({ target: [navigation.tenantId, navigation.location], set: { items } });
    }
  });
  await invalidateTenant(ctx.tenant.id, await tenantHostnames(ctx.tenant.id));
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "navigation.update", targetType: "navigation" });
  revalidatePath(`/t/${slug}/navigation`);
  return { ok: true, message: "บันทึกเมนูนำทางแล้ว" };
}
