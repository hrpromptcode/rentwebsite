import type { Metadata } from "next";
import type { TenantRuntime } from "@rentweb/core/tenant";

/**
 * Tenant-site metadata helpers shared by the site layout, CMS pages and CMS fallbacks under module routes.
 *
 * Next.js merges metadata per top-level key and a key that is present-but-undefined (`description: undefined`,
 * `openGraph: undefined`) REPLACES the layout's value — so page metadata must only contain keys that carry a value,
 * and `openGraph` must be complete (a child openGraph object replaces the parent's whole object). SS-07.
 */
export interface SiteSeo {
  title: string;
  description?: string;
  siteName: string;
  ogImage?: string;
  locale: string;
}

export function siteSeo(runtime: TenantRuntime): SiteSeo {
  const { config, theme } = runtime;
  const seo = (config.settings.seo as { title?: string; description?: string } | undefined) ?? {};
  const description = seo.description || theme.brand.tagline || (config.settings.tagline as string | undefined) || undefined;
  return {
    title: seo.title || config.name,
    ...(description ? { description } : {}),
    siteName: config.name,
    ...(theme.brand.ogImage ? { ogImage: theme.brand.ogImage } : {}),
    locale: config.locale === "th" ? "th_TH" : "en_US",
  };
}

/** First user-perceived character (Thai-aware: keeps combining vowels/tone marks with their consonant). */
function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "•";
  try {
    const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
    const first = seg.segment(trimmed)[Symbol.iterator]().next().value?.segment;
    if (first) return first.toLocaleUpperCase();
  } catch {
    /* ignore */
  }
  return Array.from(trimmed)[0]!.toLocaleUpperCase();
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Default favicon when the tenant has not uploaded one: the name's initial on the brand primary colour (SS-10). */
export function defaultIconSvg(name: string, bg: string, fg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${xmlEsc(bg)}"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif" font-size="36" font-weight="700" fill="${xmlEsc(fg)}">${xmlEsc(initialOf(name))}</text></svg>`;
}

export function siteIcons(runtime: TenantRuntime): NonNullable<Metadata["icons"]> {
  const { config, theme } = runtime;
  if (theme.brand.favicon) return { icon: theme.brand.favicon, apple: theme.brand.favicon };
  const svg = defaultIconSvg(config.name, theme.light.primary, theme.light.primaryForeground);
  return { icon: [{ url: `data:image/svg+xml,${encodeURIComponent(svg)}`, type: "image/svg+xml" }] };
}

/** Site-wide defaults (the tenant layout's metadata). */
export function siteMetadata(runtime: TenantRuntime): Metadata {
  const site = siteSeo(runtime);
  return {
    title: { default: site.title, template: `%s · ${site.siteName}` },
    ...(site.description ? { description: site.description } : {}),
    icons: siteIcons(runtime),
    openGraph: {
      title: site.title,
      ...(site.description ? { description: site.description } : {}),
      siteName: site.siteName,
      ...(site.ogImage ? { images: [site.ogImage] } : {}),
      locale: site.locale,
      type: "website",
    },
    ...(runtime.config.status === "trialing" ? { robots: { index: false, follow: false } } : {}),
  };
}

export interface PageSeoInput {
  title: string;
  description?: string | null;
  ogImage?: string | null;
  noindex?: boolean;
  canonical?: string | null;
}

/**
 * Metadata for one page: its own title/description/og image, falling back to the site defaults for anything unset.
 * Keeps the trialing-tenant noindex from the layout (robots is only emitted when this page changes it).
 */
export function pageMetadata(runtime: TenantRuntime, page: PageSeoInput): Metadata {
  const site = siteSeo(runtime);
  const description = page.description || site.description;
  const image = page.ogImage || site.ogImage;
  const trialing = runtime.config.status === "trialing";
  return {
    title: page.title,
    ...(description ? { description } : {}),
    openGraph: {
      title: `${page.title} · ${site.siteName}`,
      ...(description ? { description } : {}),
      siteName: site.siteName,
      ...(image ? { images: [image] } : {}),
      locale: site.locale,
      type: "website",
    },
    ...(page.noindex && !trialing ? { robots: { index: false, follow: true } } : {}),
    ...(page.canonical ? { alternates: { canonical: page.canonical } } : {}),
  };
}

/** pageMetadata for a CMS page row (pages.seo json + title). */
export function cmsPageMetadata(runtime: TenantRuntime, page: { title: string; seo: Record<string, unknown> }): Metadata {
  const seo = page.seo as { title?: string; description?: string; ogImage?: string; noindex?: boolean; canonical?: string };
  return pageMetadata(runtime, {
    title: seo.title || page.title,
    description: seo.description,
    ogImage: seo.ogImage,
    noindex: seo.noindex === true,
    canonical: seo.canonical,
  });
}
