import type { ResolvedTheme } from "@rentweb/core";
import type { SectionJson } from "@rentweb/db";

/** Section types that paint their own full-bleed photo under a transparent header (core hero + module heroes). */
const HERO_TYPES = new Set(["hero", "stay-search", "event-hero"]);

/** Adds top padding when the header overlays content and the page doesn't start with a hero. */
export function PageBody({ theme, sections, children }: { theme: ResolvedTheme; sections: SectionJson[]; children: React.ReactNode }) {
  const overlay = theme.layout.header === "floating" || (theme.layout.headerTransparent && theme.layout.headerSticky);
  const startsWithHero = HERO_TYPES.has(sections.find((s) => !s.hidden)?.type ?? "");
  return <div className={overlay && !startsWithHero ? "pt-20 md:pt-28" : undefined}>{children}</div>;
}
