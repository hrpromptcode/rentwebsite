// usage: node responsive_a11y-log.cjs '<json>'  -> appends one finding line to responsive_a11y.jsonl
const fs = require("fs");
const arg = process.argv[2]; const j = JSON.parse(arg.trim().startsWith("{") ? arg : fs.readFileSync(arg, "utf8"));
for (const k of ["id", "severity", "confidence", "bucket", "title", "where", "steps", "expected", "actual", "evidence", "suggestedFix"]) if (!(k in j)) throw new Error("missing " + k);
fs.appendFileSync(__dirname + "/responsive_a11y.jsonl", JSON.stringify(j) + "\n");
console.log("logged", j.id);
