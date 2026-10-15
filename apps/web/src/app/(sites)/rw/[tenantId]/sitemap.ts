import type { MetadataRoute } from "next";
import { and, eq, pages, posts, products, services, games } from "@rentweb/db";
import { currentHost, getRuntime, tenantTx } from "@/lib/tenant";

export default async function sitemap({ params }: { params: Promise<{ tenantId: string }> }): Promise<MetadataRoute.Sitemap> {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) return [];
  const host = await currentHost();
  const origin = `${host.includes("localhost") ? "http" : "https"}://${host}`;
  const mods = runtime.config.modules;

  return tenantTx(tenantId, async (tx) => {
    const out: MetadataRoute.Sitemap = [{ url: `${origin}/`, changeFrequency: "daily", priority: 1 }];
    const pg = await tx.select({ slug: pages.slug, updatedAt: pages.updatedAt }).from(pages).where(and(eq(pages.tenantId, tenantId), eq(pages.status, "published")));
    for (const p of pg) if (p.slug !== "home") out.push({ url: `${origin}/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly", priority: 0.7 });
    const ps = await tx.select({ slug: posts.slug, updatedAt: posts.updatedAt }).from(posts).where(and(eq(posts.tenantId, tenantId), eq(posts.status, "published")));
    for (const p of ps) out.push({ url: `${origin}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly", priority: 0.5 });
    if (mods.includes("commerce")) {
      out.push({ url: `${origin}/products`, changeFrequency: "daily", priority: 0.9 });
      const pr = await tx.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.status, "active")));
      for (const p of pr) out.push({ url: `${origin}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly", priority: 0.8 });
    }
    if (mods.includes("booking")) {
      out.push({ url: `${origin}/book`, changeFrequency: "weekly", priority: 0.9 }, { url: `${origin}/services`, changeFrequency: "weekly", priority: 0.8 });
      const sv = await tx.select({ slug: services.slug, updatedAt: services.updatedAt }).from(services).where(and(eq(services.tenantId, tenantId), eq(services.active, true)));
      for (const s of sv) out.push({ url: `${origin}/services/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "monthly", priority: 0.7 });
    }
    if (mods.includes("topup")) {
      out.push({ url: `${origin}/games`, changeFrequency: "daily", priority: 0.9 });
      const gs = await tx.select({ slug: games.slug, updatedAt: games.updatedAt }).from(games).where(and(eq(games.tenantId, tenantId), eq(games.active, true)));
      for (const g of gs) out.push({ url: `${origin}/games/${g.slug}`, lastModified: g.updatedAt, changeFrequency: "weekly", priority: 0.8 });
    }
    if (mods.includes("restaurant")) out.push({ url: `${origin}/menu`, changeFrequency: "weekly", priority: 0.9 }, { url: `${origin}/reserve`, changeFrequency: "monthly", priority: 0.7 });
    return out;
  });
}
