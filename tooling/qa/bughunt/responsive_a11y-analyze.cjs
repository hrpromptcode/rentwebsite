// summarize responsive_a11y-crawl.jsonl: node responsive_a11y-analyze.cjs [slug] [field]
const fs = require("fs");
const L = fs.readFileSync(__dirname + "/responsive_a11y-crawl.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const slug = process.argv[2]; const field = process.argv[3];
const rows = L.filter((r) => !slug || slug === "all" || r.slug === slug);
const agg = {};
const add = (k, v, where) => { agg[k] ??= {}; agg[k][v] ??= new Set(); agg[k][v].add(where); };
for (const r of rows) {
  const w = `${r.slug}${r.route}@${r.width}${r.rm === "no-preference" ? "m" : ""}`;
  if (r.error) { add("error", r.error.slice(0, 120), w); continue; }
  if (r.status >= 400) add("status", String(r.status), w);
  if (r.top.sw > r.top.vw) add("overflowPage", `sw=${r.top.sw} vw=${r.top.vw}`, w);
  for (const k of ["overflow", "tap", "imgNoAlt", "imgDistorted", "noName", "noLabel", "thaiClip", "fixedOverlap", "hidden", "contrast"]) for (const v of r.top[k] || []) add(k, v.replace(/ L=-?\d+ R=\d+/, "").replace(/\[\d+,\d+ /, "["), w);
  for (const v of r.bottom.covered || []) if (!/covered by header/.test(v)) add("coveredBottom", v, w);
  for (const v of r.top.covered || []) if (!/covered by header/.test(v)) add("coveredTop", v, w);
  for (const v of r.bottom.hidden || []) add("hiddenBottom", v, w);
  for (const v of r.bottom.fixedOverlap || []) add("fixedOverlapBottom", v, w);
  for (const v of r.logs || []) if (!/Reduced Motion enabled/.test(v)) add("logs", v.slice(0, 300), w);
}
for (const [k, m] of Object.entries(agg)) {
  if (field && field !== k) continue;
  console.log(`\n### ${k} (${Object.keys(m).length} unique)`);
  for (const [v, s] of Object.entries(m).sort((a, b) => b[1].size - a[1].size).slice(0, field ? 200 : 25)) console.log(`  [${s.size}] ${v}  <- ${[...s].slice(0, 4).join(", ")}`);
}
