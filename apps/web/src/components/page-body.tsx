import type { ResolvedTheme } from "@rentweb/core";
import type { SectionJson } from "@rentweb/db";

/** Section types that paint their own full-bleed photo under a transparent header (core hero + module heroes). */
const HERO_TYPES = new Set(["hero", "stay-search", "event-hero"]);

/** True when the site header overlays the page content (floating, or transparent + sticky). */
export function headerOverlays(theme: ResolvedTheme): boolean {
  return theme.layout.header === "floating" || (theme.layout.headerTransparent && theme.layout.headerSticky);
}

/**
 * Adds top padding when the header overlays content and the page doesn't start with a hero.
 * `flush`: the page paints its own full-bleed intro / hero under the header (e.g. a module stage or poster hero) and
 * offsets its own content with `headerOverlays(theme)` — no padding is added.
 */
export function PageBody({ theme, sections = [], flush = false, children }: { theme: ResolvedTheme; sections?: SectionJson[]; flush?: boolean; children: React.ReactNode }) {
  const startsWithHero = flush || HERO_TYPES.has(sections.find((s) => !s.hidden)?.type ?? "");
  return <div className={headerOverlays(theme) && !startsWithHero ? "pt-20 md:pt-28" : undefined}>{children}</div>;
}
