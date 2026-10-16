// usage: node admin_b2-addf.cjs <file.json>   (file holds one finding object or an array) -> appends to admin_b2.jsonl
const fs = require("fs");
const path = require("path");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const target = path.join(__dirname, "admin_b2.jsonl");
const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l).id) : [];
for (const f of Array.isArray(data) ? data : [data]) {
  if (existing.includes(f.id)) { console.log("skip dup", f.id); continue; }
  fs.appendFileSync(target, JSON.stringify(f) + "\n");
  console.log("logged", f.id);
}
