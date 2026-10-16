import "server-only";
import "@/modules"; // registers module sections + payment handlers for every server entry point
import { cache } from "react";
import { headers } from "next/headers";
import { and, desc, eq, getDb, navigation, pages, withTenant, type NavItem, type SectionJson, type Tx } from "@rentweb/db";
import { getTenantRuntime, type TenantRuntime } from "@rentweb/core/tenant";
import { translator } from "@rentweb/i18n";

export const getRuntime = cache(async (tenantId: string): Promise<TenantRuntime | null> => getTenantRuntime(tenantId));

/** Tenant id injected by proxy.ts (only trustworthy because /_sites is blocked from direct access). */
export async function currentTenantId(): Promise<string | null> {
  const h = await headers();
  return h.get("x-tenant-id");
}

export async function currentHost(): Promise<string> {
  const h = await headers();
  return h.get("x-tenant-host") ?? h.get("host") ?? "";
}

export function tenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(getDb(), tenantId, fn);
}

export interface PublishedPage {
  id: string;
  slug: string;
  title: string;
  kind: string;
  sections: SectionJson[];
  seo: Record<string, unknown>;
}

export const getPublishedPage = cache(async (tenantId: string, slug: string): Promise<PublishedPage | null> => {
  return tenantTx(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(pages)
      .where(and(eq(pages.tenantId, tenantId), eq(pages.slug, slug), eq(pages.status, "published")))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      kind: row.kind,
      sections: (row.publishedSections ?? row.sections ?? []) as SectionJson[],
      seo: (row.seo ?? {}) as Record<string, unknown>,
    };
  });
});

export const getNavigation = cache(async (tenantId: string): Promise<{ header: NavItem[]; footer: NavItem[] }> => {
  return tenantTx(tenantId, async (tx) => {
    const rows = await tx.select().from(navigation).where(eq(navigation.tenantId, tenantId));
    const find = (loc: string) => (rows.find((r) => r.location === loc)?.items ?? []) as NavItem[];
    return { header: find("header"), footer: find("footer") };
  });
});

export const listNavPages = cache(async (tenantId: string) => {
  return tenantTx(tenantId, (tx) =>
    tx
      .select({ slug: pages.slug, title: pages.title })
      .from(pages)
      .where(and(eq(pages.tenantId, tenantId), eq(pages.status, "published"), eq(pages.showInNav, true)))
      .orderBy(desc(pages.sort)),
  );
});

export function makeT(locale: string) {
  return translator(locale);
}
