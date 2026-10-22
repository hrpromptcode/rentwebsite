import { listTemplates } from "@rentweb/templates";
const [key, type] = process.argv.slice(2);
const t = listTemplates().find((x) => x.key === key)!;
for (const pg of t.pages) for (const s of pg.sections ?? []) if (s.type === type) console.log(pg.slug, JSON.stringify(s.props).slice(0, 400));
