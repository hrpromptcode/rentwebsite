// Repairs/edits storefront_shop.jsonl. Usage: node storefront_shop-jsonl.cjs [patch.json]
// patch.json: array of {id, set: {field: value}, append: {field: text}} or {add: finding}
const fs = require("fs");
const path = require("path");
const f = path.join(__dirname, "storefront_shop.jsonl");
const raw = fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean);
const rows = raw.map((l) => {
  try {
    return JSON.parse(l);
  } catch {
    return JSON.parse(l.replace(/\\(?!["\\/bfnrtu])/g, "\\\\"));
  }
});
const patchFile = process.argv[2];
if (patchFile) {
  const patches = JSON.parse(fs.readFileSync(patchFile, "utf8"));
  for (const p of patches) {
    if (p.add) {
      rows.push(p.add);
      continue;
    }
    const r = rows.find((x) => x.id === p.id);
    if (!r) throw new Error("no " + p.id);
    Object.assign(r, p.set || {});
    for (const [k, v] of Object.entries(p.append || {})) r[k] = (r[k] || "") + v;
  }
}
fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(rows.length, "rows:", rows.map((r) => `${r.id}/${r.severity}`).join(" "));
