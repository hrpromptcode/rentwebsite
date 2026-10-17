/**
 * Pure helpers for CMS page meta (no Next / DB imports, so tooling scripts can unit-test them).
 *
 * Draft vs live (ADMIN_B2-01): the live columns pages.title / slug / seo / show_in_nav are what the storefront
 * serves. While a page is published, "บันทึกร่าง" stores meta edits in pages.draft_meta and only publishPage
 * copies them to the live columns. Pages that are not published are invisible on the storefront, so their
 * draft saves write the live columns directly (draft_meta stays null).
 */
import { MODULES, type ModuleKey } from "@rentweb/core/modules";
import type { PageDraftMeta, SeoJson } from "@rentweb/db";

/** Storefront paths that exist for every tenant (routes outside the CMS catch-all, or reserved for the platform). */
const ALWAYS_RESERVED = ["api", "rw", "account", "site-status", "preview", "uploads"];

/**
 * Storefront route folders that the module registry (MODULES[*].storefrontRoutes in @rentweb/core) does not list
 * yet. Only nested routes today (/bookings/[id], /reservations/[number], /orders/[orderId]) - reserved so a CMS
 * page cannot sit on top of a module's URL space.
 */
const EXTRA_MODULE_ROUTES: Partial<Record<ModuleKey, string[]>> = {
  booking: ["bookings"],
  clinic: ["bookings"],
  restaurant: ["orders", "reservations"],
};

/**
 * Page slugs the storefront would never show because a module route answers that path first (ADMIN_B2-03).
 * Module routes fall back to the CMS page while their module is disabled, so only enabled modules reserve slugs.
 */
export function reservedPageSlugs(modules: readonly string[]): Set<string> {
  const out = new Set(ALWAYS_RESERVED);
  for (const m of modules) {
    if (m === "cms" || !(m in MODULES)) continue;
    const key = m as ModuleKey;
    for (const route of MODULES[key].storefrontRoutes) {
      const seg = route.replace(/^\/+/, "").split("/")[0];
      if (seg) out.add(seg);
    }
    for (const seg of EXTRA_MODULE_ROUTES[key] ?? []) out.add(seg);
  }
  return out;
}

export interface PageMetaValue {
  title: string;
  slug: string;
  showInNav: boolean;
  seo: SeoJson;
}

/** Drops empty / undefined SEO keys so {} and {title: undefined} compare equal. */
export function cleanSeo(seo: SeoJson | null | undefined): SeoJson {
  const out: SeoJson = {};
  if (!seo) return out;
  if (seo.title) out.title = seo.title;
  if (seo.description) out.description = seo.description;
  if (seo.ogImage) out.ogImage = seo.ogImage;
  if (seo.noindex) out.noindex = true;
  if (seo.canonical) out.canonical = seo.canonical;
  return out;
}

export function sameMeta(a: PageMetaValue, b: PageMetaValue): boolean {
  const sa = cleanSeo(a.seo);
  const sb = cleanSeo(b.seo);
  const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]) as Set<keyof SeoJson>;
  for (const k of keys) if (sa[k] !== sb[k]) return false;
  return a.title === b.title && a.slug === b.slug && a.showInNav === b.showInNav;
}

/** The meta the editor shows: pending draft edits when there are any, otherwise the live values. */
export function effectiveMeta(row: { title: string; slug: string; showInNav: boolean; seo: SeoJson | null; draftMeta: PageDraftMeta | null }): PageMetaValue {
  if (row.draftMeta) return { title: row.draftMeta.title, slug: row.draftMeta.slug, showInNav: !!row.draftMeta.showInNav, seo: cleanSeo(row.draftMeta.seo) };
  return { title: row.title, slug: row.slug, showInNav: row.showInNav, seo: cleanSeo(row.seo) };
}

/**
 * Where a draft save writes the meta. Published page: into draft_meta (null when it equals the live values);
 * otherwise straight into the live columns.
 */
export function planMetaSave(row: { status: string; title: string; slug: string; showInNav: boolean; seo: SeoJson | null }, next: PageMetaValue): { live: PageMetaValue | null; draftMeta: PageDraftMeta | null } {
  const value: PageMetaValue = { ...next, seo: cleanSeo(next.seo) };
  if (row.status !== "published") return { live: value, draftMeta: null };
  const live: PageMetaValue = { title: row.title, slug: row.slug, showInNav: row.showInNav, seo: cleanSeo(row.seo) };
  return { live: null, draftMeta: sameMeta(live, value) ? null : value };
}

/** True when a published page has edits (sections or meta) that the storefront does not show yet. */
export function hasUnpublishedChanges(row: { status: string; sections: unknown; publishedSections: unknown; draftMeta: PageDraftMeta | null }): boolean {
  if (row.status !== "published") return false;
  if (row.draftMeta) return true;
  if (row.publishedSections == null) return false; // legacy rows: the storefront falls back to sections
  return JSON.stringify(row.sections ?? []) !== JSON.stringify(row.publishedSections ?? []);
}
