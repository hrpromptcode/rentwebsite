import "server-only";
import * as React from "react";
import { ArrowUpRight, PencilLine } from "lucide-react";
import Link from "next/link";
import { ThaiWrap } from "@rentweb/ui/motion/thai-wrap";
import { and, eq, pages } from "@rentweb/db";
import { resolveTheme } from "@rentweb/core/theme";
import { assetUrl, fmtRelative } from "@/lib/format";
import { tenantTx, type TenantCtx } from "@/lib/tenant";

export interface SitePreviewData {
  url: string;
  host: string;
  name: string;
  tagline: string | null;
  headline: string | null;
  image: string | null;
  cta: string | null;
  logo: string | null;
  live: boolean;
  statusLabel: string;
  homeId: string | null;
  updatedAt: Date | null;
  colors: { background: string; foreground: string; primary: string; primaryForeground: string; muted: string; border: string };
}

const IMG_RE = /^(https?:\/\/|\/)[^\s"']+$/i;
const IMG_HINT = /images\.unsplash\.com|\.(jpe?g|png|webp|avif)(\?|$)|\/uploads\//i;
const IMG_KEY = /image|photo|media|poster|background|cover|src|picture|bg/i;
const TEXT_KEYS = ["title", "heading", "headline"];

/**
 * First image-looking URL in a section's props (depth-first, image-ish keys first). An image-ish key marks its whole
 * subtree, so `{ image: { url } }` and `{ media: [{ src }] }` both resolve.
 */
function findImage(v: unknown, key = "", depth = 0, inImg = false): string | null {
  if (depth > 5 || v == null) return null;
  const imgish = inImg || IMG_KEY.test(key);
  if (typeof v === "string") return imgish && IMG_RE.test(v) && IMG_HINT.test(v) ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = findImage(x, key, depth + 1, imgish);
      if (r) return r;
    }
    return null;
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => Number(IMG_KEY.test(b)) - Number(IMG_KEY.test(a)));
    for (const [k, x] of entries) {
      const r = findImage(x, k, depth + 1, imgish);
      if (r) return r;
    }
  }
  return null;
}

/** Label of the hero's main button, if the section has one. */
function findCta(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  for (const k of ["primaryCta", "cta", "button"]) {
    const v = props[k] as { label?: unknown } | undefined;
    const t = v && typeof v === "object" ? plain(v.label) : null;
    if (t) return t.slice(0, 28);
  }
  return plain(props.ctaLabel)?.slice(0, 28) ?? null;
}

function plain(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/<[^>]+>/g, "").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 90) : null;
}

function sized(url: string): string {
  const abs = assetUrl(url);
  if (!/images\.unsplash\.com/.test(abs)) return abs;
  const u = new URL(abs);
  // the window is 16:10 — crop server-side instead of shipping a tall 3:4 hero
  u.searchParams.delete("ar");
  u.searchParams.set("w", "720");
  u.searchParams.set("h", "450");
  u.searchParams.set("q", "70");
  u.searchParams.set("auto", "format");
  u.searchParams.set("fit", "crop");
  u.searchParams.set("crop", "faces,entropy");
  return u.toString();
}

const STATUS: Record<string, { label: string; live: boolean }> = {
  active: { label: "ออนไลน์", live: true },
  trialing: { label: "ออนไลน์", live: true },
  past_due: { label: "ออนไลน์ · ค้างชำระ", live: true },
  suspended: { label: "ปิดชั่วคราว", live: false },
  cancelled: { label: "ปิดแล้ว", live: false },
};

export async function getSitePreview(ctx: TenantCtx): Promise<SitePreviewData> {
  const tenantId = ctx.tenant.id;
  const [home] = await tenantTx(tenantId, (tx) =>
    tx
      .select({ id: pages.id, sections: pages.sections, publishedSections: pages.publishedSections, updatedAt: pages.updatedAt, publishedAt: pages.publishedAt })
      .from(pages)
      .where(and(eq(pages.tenantId, tenantId), eq(pages.kind, "home")))
      .limit(1),
  );
  const sections = (home?.publishedSections ?? home?.sections ?? []).filter((s) => !s.hidden);
  let image: string | null = null;
  let headline: string | null = null;
  let cta: string | null = null;
  for (const s of sections.slice(0, 4)) {
    image ??= findImage(s.props);
    if (!headline) for (const k of TEXT_KEYS) headline ??= plain(s.props?.[k]);
    cta ??= findCta(s.props as Record<string, unknown> | undefined);
    if (image && headline && cta) break;
  }
  const theme = resolveTheme(ctx.tenant.theme);
  const pal = theme.mode === "dark" ? theme.dark : theme.light;
  const settings = (ctx.tenant.settings ?? {}) as { tagline?: string };
  const st = STATUS[ctx.tenant.status] ?? { label: ctx.tenant.status, live: false };
  return {
    url: ctx.storefrontUrl,
    host: ctx.hostname,
    name: theme.brand.logoText || ctx.tenant.name,
    tagline: plain(settings.tagline) ?? plain(theme.brand.tagline),
    headline,
    image: image ? sized(image) : null,
    cta,
    logo: theme.brand.logo ? assetUrl(theme.brand.logo) : null,
    live: st.live,
    statusLabel: st.label,
    homeId: home?.id ?? null,
    updatedAt: home?.publishedAt ?? home?.updatedAt ?? null,
    colors: { background: pal.background, foreground: pal.foreground, primary: pal.primary, primaryForeground: pal.primaryForeground, muted: pal.muted, border: pal.border },
  };
}

/**
 * "Your site, live" card for the dashboard header: a miniature browser window drawn in the TENANT's own theme colours
 * (from its resolved theme — never admin colours) with its real home-page hero photo, headline and logo. No iframe, no
 * WebGL (the storefront's 3D scenes stay on the storefront). The window is one link to the live site (new tab).
 */
export function SitePreview({ data, slug }: { data: SitePreviewData; slug: string }) {
  const c = data.colors;
  const style = {
    "--sp-bg": c.background,
    "--sp-fg": c.foreground,
    "--sp-primary": c.primary,
    "--sp-primary-fg": c.primaryForeground,
    "--sp-muted": c.muted,
    "--sp-border": c.border,
  } as React.CSSProperties;
  return (
    <div className="adm-site-preview">
      <a href={data.url} target="_blank" rel="noreferrer" className="adm-sp-window group" style={style} aria-label={`เปิดเว็บไซต์ ${data.name} ในแท็บใหม่`}>
        <span className="adm-sp-chrome" aria-hidden>
          <span className="adm-sp-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="adm-sp-url">
            <span className="adm-sp-lock" />
            {data.host}
          </span>
          <ArrowUpRight className="adm-sp-go size-3.5" />
        </span>
        <span className="adm-sp-page" aria-hidden>
          {data.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.image} alt="" className="adm-sp-img" loading="eager" decoding="async" fetchPriority="low" />
          ) : (
            <span className="adm-sp-img is-empty" />
          )}
          <span className="adm-sp-scrim" />
          <span className="adm-sp-nav">
            {data.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logo} alt="" className="adm-sp-logo" />
            ) : (
              <span className="adm-sp-name">{data.name}</span>
            )}
            <span className="adm-sp-links">
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className="adm-sp-copy">
            <span className="adm-sp-headline">
              <ThaiWrap text={data.headline ?? data.name} />
            </span>
            {data.tagline && <span className="adm-sp-tagline">{data.tagline}</span>}
            <span className="adm-sp-cta">{data.cta ?? <i />}</span>
          </span>
        </span>
      </a>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium" data-live={data.live ? "" : undefined}>
          <span className="adm-live" aria-hidden />
          {data.statusLabel}
        </span>
        {data.updatedAt && <span className="text-muted-foreground">อัปเดตหน้าแรก {fmtRelative(data.updatedAt)}</span>}
        {data.homeId && (
          <Link href={`/t/${slug}/pages/${data.homeId}`} className="adm-link -my-3 ml-auto inline-flex items-center gap-1 py-3 font-medium">
            <PencilLine className="size-3.5" aria-hidden />
            แก้ไขหน้าแรก
          </Link>
        )}
      </div>
    </div>
  );
}
