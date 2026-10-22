import { listTemplates } from "@rentweb/templates";
const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
const len = (s: string) => [...seg.segment(s.replace(/\s+/g, ""))].length;
for (const t of listTemplates()) {
  for (const pg of t.pages) {
    for (const s of pg.sections ?? []) {
      if (s.type !== "hero") continue;
      const p = s.props as Record<string, unknown>;
      const h = String(p.heading ?? "");
      const lines = h.split("\n");
      console.log(`${t.key}/${pg.slug} ${p.variant} size=${p.headingSize} total=${len(h.replace("{*}", ""))} lines=[${lines.map(len).join(",")}] cycle=${(p.cycleWords as string[] | undefined)?.length ?? 0} | ${JSON.stringify(h)}`);
    }
  }
}
