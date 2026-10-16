// usage: node admin_core-log.cjs < finding.json  (appends one JSON line)
const fs = require("fs");
const path = require("path");
const input = fs.readFileSync(0, "utf8");
const j = JSON.parse(input);
const keys = ["id","severity","confidence","bucket","title","where","steps","expected","actual","evidence","suggestedFix"];
const out = {};
for (const k of keys) out[k] = j[k] ?? "";
fs.appendFileSync(path.join(__dirname, "admin_core.jsonl"), JSON.stringify(out) + "\n");
console.log("logged", out.id);
