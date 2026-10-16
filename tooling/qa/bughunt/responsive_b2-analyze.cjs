// responsive_b2: group raw crawl results (responsive_b2-crawl.jsonl) into candidate issues.  node qa/bughunt/responsive_b2-analyze.cjs [section]
const fs = require("fs");
const path = require("path");
const rows = fs.readFileSync(path.join(__dirname, "responsive_b2-crawl.jsonl"), "utf8").trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const only = process.argv[2];
const where = (r) => `${r.slug.replace("demo-", "")}${r.route}@${r.width}${r.rm === "reduce" ? "R" : "M"}`;
const group = (name, fn, max = 40) => {
  if (only && only !== name) return;
  const m = new Map();
  for (const r of rows) { if (r.error) continue; for (const [k, v] of fn(r) || []) { if (!m.has(k)) m.set(k, []); m.get(k).push(v ?? where(r)); } }
  console.log(`\n##### ${name}: ${m.size} groups`);
  [...m.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, max).forEach(([k, v]) => console.log(`${String(v.length).padStart(3)} ${k.slice(0, 260)}\n      ${[...new Set(v)].slice(0, 8).join(" ")}`));
};
const norm = (s) => s.replace(/#radix-[^.\s]+/g, "#radix").replace(/ L=-?\d+ R=-?\d+/, "").replace(/ \[[-\d, x]+\]/, "");
group("errors", (r) => [[`status=${r.status} final=${r.finalPath !== r.route ? r.finalPath : "same"}`]].filter(() => r.status >= 400 || r.finalPath !== r.route));
rows.filter((r) => r.error).forEach((r) => console.log("ERR", where(r), r.error.slice(0, 150)));
group("overflow", (r) => (Math.max(r.top.sw, r.bottom.sw) > r.top.vw ? [[`sw top=${r.top.sw} bottom=${r.bottom.sw} vw=${r.top.vw} | ${(r.top.sw > r.top.vw ? r.top.overflow : r.bottom.overflow).slice(0, 2).map(norm).join(" ; ")}`]] : []));
group("offscreen-noscroll", (r) => (r.bottom.overflow || []).map((o) => [norm(o)]));
group("hiddenBottom", (r) => (r.bottom.hidden || []).filter((h) => !/scale-\[1\.04\]/.test(h)).map((h) => [h.replace(/'.*$/, "")]));
group("headClip", (r) => [...(r.top.headClip || []).map((h) => ["TOP " + h]), ...(r.bottom.headClip || []).map((h) => ["BOT " + h])]);
group("thaiClip", (r) => (r.bottom.thaiClip || []).filter((t) => parseFloat(t.slice(5)) >= 2.5).map((t) => [t.replace(/^clip=[\d.]+px /, "").replace(/'.*$/, ""), `${where(r)}:${t.match(/^clip=([\d.]+)/)[1]}'${(t.match(/'(.*)'$/) || [])[1]}'`]));
group("reveal", (r) => (r.bottom.reveal || []).filter((x) => !/op=1\.00\|tf=none\|tr=none\|sc=none/.test(x)).map((x) => [x.replace(/^\d+\|/, "")]));
group("coveredBottom", (r) => (r.bottom.covered || []).map((c) => [norm(c)]));
group("coveredTop", (r) => (r.top.covered || []).map((c) => [norm(c)]));
group("fixedOverlap", (r) => [...(r.top.fixedOverlap || []), ...(r.bottom.fixedOverlap || []), ...(r.midFixed || [])].map((c) => [norm(c).replace(/overlap=\d+x\d+/, "")]));
group("tap390", (r) => (r.width === 390 ? (r.top.tap || []).map((t) => [t.replace(/'(.*)'$/, "").replace(/#radix-[^.\s]+/g, ""), `${where(r)} '${(t.match(/'(.*)'$/) || [])[1]}'`]) : []), 60);
group("noName", (r) => (r.top.noName || []).map((t) => [norm(t)]));
group("noLabel", (r) => (r.top.noLabel || []).map((t) => [norm(t)]));
group("imgNoAlt", (r) => (r.top.imgNoAlt || []).map((t) => [t]));
group("imgDistorted", (r) => (r.top.imgDistorted || []).map((t) => [t.replace(/box=\d+x\d+ /, "")]));
group("contrast", (r) => (r.top.contrast || []).map((t) => [t.replace(/^[\d.]+ /, "").replace(/'.*$/, ""), `${where(r)}:${t.split(" ")[0]}'${(t.match(/'(.*)'$/) || [])[1]}'`]));
group("logs", (r) => (r.logs || []).filter((l) => !/Reduced Motion enabled|scroll-behavior: smooth/.test(l)).map((l) => [l.slice(0, 250)]));
