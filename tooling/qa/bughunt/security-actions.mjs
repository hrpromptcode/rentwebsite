// Collects server action ids from Next dev manifests: prints "<app> <id> <exportName> <file>"
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
const files = execSync('find apps/admin/.next/dev/server apps/web/.next/dev/server -name server-reference-manifest.json', { encoding: "utf8" }).trim().split("\n");
const seen = new Map();
for (const f of files) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  for (const [id, v] of Object.entries(j.node ?? {})) {
    if (seen.has(id)) continue;
    const mods = Object.entries(v.workers ?? {});
    const name = v.exportedName ?? v.name ?? "";
    const file = v.filename ?? (mods[0]?.[1]?.moduleId ?? "");
    seen.set(id, `${f.includes("apps/admin") ? "admin" : "web"} ${id} ${name} ${file}`);
  }
}
for (const v of seen.values()) console.log(v);
