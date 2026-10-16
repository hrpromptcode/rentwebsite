// One-off (AC-01): copy files the admin wrote to apps/admin/public/uploads (before uploads were unified)
// into the shared storefront directory apps/web/public/uploads. Never overwrites, never deletes.
//   node tooling/qa/bughunt/fixes/AC-01-copy-admin-uploads.mjs
import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const from = path.join(root, "apps/admin/public/uploads");
const to = process.env.UPLOADS_DIR ? path.resolve(root, process.env.UPLOADS_DIR) : path.join(root, "apps/web/public/uploads");
let copied = 0, skipped = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const src = path.join(dir, name);
    if (statSync(src).isDirectory()) { walk(src); continue; }
    const dst = path.join(to, path.relative(from, src));
    if (existsSync(dst)) { skipped++; continue; }
    cpSync(src, dst, { recursive: false, force: false });
    copied++;
  }
}
if (existsSync(from)) walk(from);
console.log(`copied ${copied}, already present ${skipped} (${from} -> ${to})`);
