import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
// Collects server-action ids from the admin dev build (routes must have been compiled once by visiting them).
const files = execSync("find apps/admin/.next -name server-reference-manifest.json", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const seen = new Map();
for (const f of files) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  for (const [id, v] of Object.entries(j.node ?? {})) {
    if (seen.has(id)) continue;
    seen.set(id, `${id} ${v.exportedName ?? v.name ?? ""} ${v.filename ?? ""}`);
  }
}
const lines = [...seen.values()];
writeFileSync("tooling/qa/bughunt/topup_admin-actionids.txt", lines.join("\n") + "\n");
console.log(`${lines.length} action ids (${files.length} manifests); topup: ${lines.filter((l) => l.includes("topup")).length}`);
