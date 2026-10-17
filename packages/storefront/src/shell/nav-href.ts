import type { NavItem } from "@rentweb/db";

/**
 * Storefront side of ADMIN_B2-18 (defence in depth). Same allow-list as the admin's navigation editor
 * (apps/admin/src/lib/nav-href.ts `checkNavHref`; keep the two in sync): same-site paths ("/about", not "//host"),
 * "#anchor", absolute http(s) URLs and mailto:, tel:, sms:, line:. Anything else (javascript:, data:, vbscript:,
 * protocol-relative, backslashes, control characters / whitespace, bare words) is not rendered at all.
 * Pure, no Next / app imports.
 */
const APP_SCHEMES = new Set(["mailto", "tel", "sms", "line"]);

export type NavHrefKind = "internal" | "web" | "app";

/** Classifies an href, or returns null when it must not be rendered. */
export function navHrefKind(input: unknown): NavHrefKind | null {
  if (typeof input !== "string") return null;
  const href = input.trim();
  if (!href || href.length > 500) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(href)) return null;
  if (href.startsWith("#")) return "internal";
  if (href.startsWith("/")) return href.startsWith("//") ? null : "internal";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (!scheme) return null;
  if (scheme === "http" || scheme === "https") {
    try {
      return new URL(href).hostname ? "web" : null;
    } catch {
      return null;
    }
  }
  if (APP_SCHEMES.has(scheme)) return href.length > scheme.length + 1 ? "app" : null;
  return null;
}

export const isSafeNavHref = (href: unknown): href is string => navHrefKind(href) !== null;

/**
 * Drops items (and children) whose href fails the allow-list, trims hrefs, and keeps `external` only for absolute
 * http(s) links (the only kind the admin lets owners mark "open in a new tab").
 */
export function safeNav(items: NavItem[] | null | undefined): NavItem[] {
  if (!Array.isArray(items)) return [];
  const out: NavItem[] = [];
  for (const it of items) {
    if (!it || typeof it.label !== "string" || !it.label.trim()) continue;
    const kind = navHrefKind(it.href);
    if (!kind) continue;
    const children = it.children?.length ? safeNav(it.children) : undefined;
    out.push({ label: it.label, href: it.href.trim(), ...(children?.length ? { children } : {}), ...(it.external === true && kind === "web" ? { external: true } : {}) });
  }
  return out;
}

/** Anchor props for a nav item: external items open in a new tab without handing the opener / referrer over. */
export function navTarget(item: Pick<NavItem, "external">): { target?: "_blank"; rel?: string } {
  return item.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
