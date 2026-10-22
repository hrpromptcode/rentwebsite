import { listTemplates } from "@rentweb/templates";
import { SECTION_DEFS } from "../../../packages/storefront/src/definitions/index";
let bad = 0;
for (const t of listTemplates()) for (const pg of t.pages) for (const s of [...(pg.sections ?? []), ...((pg as { neutralSections?: typeof pg.sections }).neutralSections ?? [])]) {
  const def = SECTION_DEFS[s.type];
  if (!def) continue;
  const r = def.schema.safeParse(s.props);
  if (!r.success) { bad++; console.log("INVALID", t.key, pg.slug, s.type); continue; }
  if (JSON.stringify(r.data) !== JSON.stringify(s.props)) { bad++; console.log("DIFF", t.key, pg.slug, s.type); }
}
console.log(bad ? `${bad} sections change on re-parse` : "all template sections stable on re-parse");
