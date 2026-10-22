/**
 * Booking-module art direction (docs/design/hi-end-direction.md §5.3 clinic, §5.5 salon/spa, §5.8 course/studio).
 * The MOTIF follows the business (siteType / modules); every colour still comes from the tenant theme.
 *  - clinic  → arch frames, glass panels, soft light
 *  - spa     → pebble frames that slowly morph, stone/linen calm, slow water
 *  - studio  → tall pill frames, breath, warm paper
 *  - default → rounded frames
 */
export type Look = "clinic" | "spa" | "studio" | "default";

export function lookOf(t: { siteType?: string | null; modules?: readonly string[] | null }): Look {
  const site = (t.siteType ?? "").toLowerCase();
  if (site === "clinic" || t.modules?.includes("clinic")) return "clinic";
  if (site === "salon" || site === "spa") return "spa";
  if (site === "course" || site === "studio") return "studio";
  return "default";
}

/** Photo / portrait frame shape per look (class names live in hi/styles.tsx). */
export function frameClass(look: Look, kind: "portrait" | "media" = "media"): string {
  switch (look) {
    case "clinic":
      return "bk-arch";
    case "spa":
      return kind === "portrait" ? "bk-pebble" : "bk-soft";
    case "studio":
      return kind === "portrait" ? "bk-capsule" : "bk-soft";
    default:
      return "bk-round";
  }
}

/** The mono index label "02 / SERVICES" used in intros. */
export const INDEX_LABEL: Record<string, string> = {
  services: "SERVICES",
  staff: "TEAM",
  classes: "CLASSES",
  schedule: "TIMETABLE",
  instructors: "TEACHERS",
  packages: "PASSES",
  book: "BOOKING",
};

export const pad2 = (n: number) => String(n).padStart(2, "0");
