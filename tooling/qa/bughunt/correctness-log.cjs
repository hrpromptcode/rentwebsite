// usage: node correctness-log.cjs < finding.json  (appends one validated JSON line)
const fs = require("fs");
const s = fs.readFileSync(0, "utf8");
const o = JSON.parse(s);
for (const k of ["id", "severity", "confidence", "bucket", "title", "where", "actual", "evidence"]) if (!o[k]) throw new Error("missing " + k);
fs.appendFileSync(__dirname + "/correctness.jsonl", JSON.stringify(o) + "\n");
console.log("logged", o.id);
