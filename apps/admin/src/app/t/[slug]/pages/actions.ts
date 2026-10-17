"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, navigation, ne, pageVersions, pages, type NavItem, type SectionJson, type Tx } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
import { isUuid, slugify } from "@rentweb/core";
import { SECTION_DEFS } from "@rentweb/storefront/definitions";
import { auditLog } from "@/lib/audit";
import { checkNavHref } from "@/lib/nav-href";
import { signPreviewToken } from "@rentweb/core/preview-token";
import { assertRole, getTenantCtx, tenantHostnames, tenantTx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";
import { cleanSeo, hasUnpublishedChanges, planMetaSave, reservedPageSlugs } from "./page-meta";

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

const RESERVED_MSG = "slug นี้ถูกสงวนไว้สำหรับระบบ (เป็นที่อยู่ของหน้าในโมดูลที่เปิดใช้)";

/** Another page already uses `slug` live, or has it as its pending (draft) slug. */
async function slugTaken(tx: Tx, tenantId: string, exceptPageId: string | null, slug: string): Promise<boolean> {
  const rows = await tx
    .select({ slug: pages.slug, draftMeta: pages.draftMeta })
    .from(pages)
    .where(exceptPageId ? and(eq(pages.tenantId, tenantId), ne(pages.id, exceptPageId)) : eq(pages.tenantId, tenantId));
  return rows.some((r) => r.slug === slug || r.draftMeta?.slug === slug);
}

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
  if (reservedPageSlugs(ctx.modules).has(pageSlug)) return { ok: false, error: RESERVED_MSG };

  const id = await tenantTx(ctx.tenant.id, async (tx) => {
    if (await slugTaken(tx, ctx.tenant.id, null, pageSlug)) return null;
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
  if (!isUuid(pageId)) return { ok: false, error: "ไม่พบหน้านี้" };
  const reserved = reservedPageSlugs(ctx.modules);

  const result = await tenantTx(ctx.tenant.id, async (tx) => {
    const [page] = await tx.select().from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId))).limit(1);
    if (!page) return { error: "ไม่พบหน้านี้" };
    let newSlug = page.slug;
    if (page.kind !== "home") {
      newSlug = cleanSlug(meta.data.slug);
      if (newSlug !== page.slug) {
        // a page that already sits on a now-reserved slug may keep it; moving onto one is refused
        if (reserved.has(newSlug)) return { error: RESERVED_MSG };
        if (await slugTaken(tx, ctx.tenant.id, pageId, newSlug)) return { error: `มีหน้า /${newSlug} อยู่แล้ว` };
      }
    }
    // keep a version snapshot of the previous draft when it changed
    if (JSON.stringify(page.sections) !== JSON.stringify(norm.sections)) {
      await tx.insert(pageVersions).values({ tenantId: ctx.tenant.id, pageId, sections: page.sections ?? [], createdBy: ctx.userId });
    }
    // ADMIN_B2-01: a published page keeps serving its live title/slug/SEO/nav flag; edits wait in draft_meta
    const plan = planMetaSave(page, { title: meta.data.title, slug: newSlug, showInNav: meta.data.showInNav, seo: meta.data.seo });
    await tx
      .update(pages)
      .set({
        sections: norm.sections,
        draftMeta: plan.draftMeta,
        ...(plan.live ? { title: plan.live.title, slug: plan.live.slug, showInNav: plan.live.showInNav, seo: plan.live.seo } : {}),
      })
      .where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId)));
    return { slug: newSlug, published: page.status === "published", pending: hasUnpublishedChanges({ status: page.status, sections: norm.sections, publishedSections: page.publishedSections, draftMeta: plan.draftMeta }) };
  });
  if ("error" in result) return { ok: false, error: result.error! };
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "page.update", targetType: "page", targetId: pageId });
  revalidatePath(`/t/${slug}/pages`);
  revalidatePath(`/t/${slug}/pages/${pageId}`);
  return {
    ok: true,
    message: result.published && result.pending ? "บันทึกฉบับร่างแล้ว — หน้าร้านยังแสดงฉบับที่เผยแพร่อยู่จนกว่าจะกด “เผยแพร่”" : "บันทึกฉบับร่างแล้ว",
    data: { slug: result.slug, pending: result.pending },
  };
}

export async function publishPage(slug: string, pageId: string, input?: { sections: unknown; meta: z.input<typeof metaSchema> }): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (input) {
    const saved = await savePageDraft(slug, pageId, input);
    if (!saved.ok) return saved;
  }
  if (!isUuid(pageId)) return { ok: false, error: "ไม่พบหน้านี้" };
  const reserved = reservedPageSlugs(ctx.modules);
  const res = await tenantTx(ctx.tenant.id, async (tx): Promise<{ error: string } | { meta: Record<string, unknown> | null }> => {
    const [page] = await tx.select().from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId))).limit(1);
    if (!page) return { error: "ไม่พบหน้านี้" };
    const dm = page.draftMeta;
    const nextSlug = dm && page.kind !== "home" ? dm.slug : page.slug;
    if (nextSlug !== page.slug) {
      if (reserved.has(nextSlug)) return { error: RESERVED_MSG };
      if (await slugTaken(tx, ctx.tenant.id, pageId, nextSlug)) return { error: `มีหน้า /${nextSlug} อยู่แล้ว` };
    }
    // ADMIN_B2-01: publishing is the only moment the live meta of a published page changes
    await tx
      .update(pages)
      .set({
        status: "published",
        publishedSections: page.sections,
        publishedAt: new Date(),
        draftMeta: null,
        ...(dm ? { title: dm.title, slug: nextSlug, showInNav: !!dm.showInNav, seo: cleanSeo(dm.seo) } : {}),
      })
      .where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId)));
    return { meta: dm ? { from: { title: page.title, slug: page.slug }, to: { title: dm.title, slug: nextSlug } } : null };
  });
  if ("error" in res) return { ok: false, error: res.error };
  await invalidateTenant(ctx.tenant.id, await tenantHostnames(ctx.tenant.id));
  await auditLog({ tenantId: ctx.tenant.id, actorType: ctx.impersonating ? "superadmin" : "user", actorId: ctx.userId, action: "page.publish", targetType: "page", targetId: pageId, ...(res.meta ? { diff: res.meta } : {}) });
  revalidatePath(`/t/${slug}/pages`);
  revalidatePath(`/t/${slug}/pages/${pageId}`);
  return { ok: true, message: "เผยแพร่แล้ว หน้าร้านอัปเดตภายในไม่กี่วินาที" };
}

/**
 * ADMIN_B2-02: signed, short-lived link to the storefront's draft preview route (`/preview?token=…`), which renders
 * pages.sections + pages.draft_meta of exactly this page. Any member may preview: the editor already shows them the draft.
 */
export async function createPagePreviewLink(slug: string, pageId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "viewer");
  if (!isUuid(pageId)) return { ok: false, error: "ไม่พบหน้านี้" };
  const [page] = await tenantTx(ctx.tenant.id, (tx) => tx.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, pageId))).limit(1));
  if (!page) return { ok: false, error: "ไม่พบหน้านี้" };
  const token = signPreviewToken({ tenantId: ctx.tenant.id, pageId: page.id });
  return { ok: true, data: { url: `${ctx.storefrontUrl}/preview?token=${encodeURIComponent(token)}` } };
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
    // ADMIN_B2-18: only same-site paths, http(s), mailto:, tel:, sms:, line: (never javascript:/data:)
    href: z
      .string()
      .trim()
      .superRefine((v, c) => {
        const r = checkNavHref(v);
        if (!r.ok) c.addIssue({ code: "custom", message: r.error });
      }),
    external: z.boolean().optional(),
    children: z.array(navItemSchema).max(20).optional(),
  }),
);

export async function saveNavigation(slug: string, input: { header: unknown; footer: unknown }): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  const parsed = z.object({ header: z.array(navItemSchema).max(30), footer: z.array(navItemSchema).max(30) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลเมนูไม่ถูกต้อง" };
  // "external" (open in a new tab) only applies to absolute http(s) links
  const strip = (items: NavItem[]): NavItem[] => items.map((i) => ({ label: i.label, href: i.href, ...(i.external && /^https?:/i.test(i.href) ? { external: true } : {}), ...(i.children?.length ? { children: strip(i.children).map(({ children: _c, ...rest }) => rest) } : {}) }));
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
