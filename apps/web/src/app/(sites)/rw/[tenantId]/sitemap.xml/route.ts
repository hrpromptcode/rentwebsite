import { and, eq, games, pages, posts, products, services } from "@rentweb/db";
import { currentHost, getRuntime, tenantTx } from "@/lib/tenant";

type Entry = { url: string; lastModified?: Date | null; changeFrequency?: string; priority?: number };

function xml(entries: Entry[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(
      (e) =>
        `  <url><loc>${esc(e.url)}</loc>${e.lastModified ? `<lastmod>${e.lastModified.toISOString()}</lastmod>` : ""}${e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : ""}${e.priority != null ? `<priority>${e.priority}</priority>` : ""}</url>`,
    )
    .join("\n")}\n</urlset>\n`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) return new Response("not found", { status: 404 });
  const host = await currentHost();
  const origin = `${host.includes("localhost") ? "http" : "https"}://${host}`;
  const mods = runtime.config.modules;

  const entries = await tenantTx(tenantId, async (tx) => {
    const out: Entry[] = [{ url: `${origin}/`, changeFrequency: "daily", priority: 1 }];
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

  return new Response(xml(entries), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
