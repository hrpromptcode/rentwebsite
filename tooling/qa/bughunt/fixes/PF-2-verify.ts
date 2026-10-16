/**
 * PF-2 (payments follow-up "admin uploads"): the admin media library (uploadMedia) and the design brand-asset upload
 * (uploadBrandAsset: logo / favicon / share image, also used by the section editor) decide the file type from the
 * bytes (sniffUpload) — no SVG / HTML, stored extension + MIME from the sniffed type, never from the client.
 * Calls the real server actions on the running admin (superadmin, tenant demo-shop) and checks the stored rows.
 * Uploaded rows are deleted again (deleteMedia). Run from tooling/:  npx tsx qa/bughunt/fixes/PF-2-verify.ts
 */
// @ts-expect-error plain .mjs helper
import { ADMIN, actionId, callAction, db, signIn } from "../security-http.mjs";

const SLUG = "demo-shop";
const sql = db();
let failures = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
};

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABVKJPPgAAAABJRU5ErkJggg==", "base64");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"><script>alert(1)</script></svg>');
const HTML = Buffer.from("<!doctype html><html><body><script>alert(1)</script></body></html>");
const PDF = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.from([0x0a, 0x25, 0xe2, 0xe3, 0x0a]), Buffer.from("1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")]);
const ICO = Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 32, 0]), Buffer.alloc(8)]);

const login = await signIn("admin@rentweb.local", "Admin1234!");
if (!login.cookie) throw new Error(`admin sign-in failed: ${login.status} ${login.body}`);
const cookie: string = login.cookie;

/** POST a server action whose args are [slug, FormData] (Next encodes the FormData as $K1 + "_1_"-prefixed entries). */
async function callUpload(id: string, path: string, entries: Array<[string, string | { name: string; type: string; data: Buffer }]>) {
  const body = new FormData();
  for (const [k, v] of entries) {
    if (typeof v === "string") body.append(`_1_${k}`, v);
    else body.append(`_1_${k}`, new Blob([v.data], { type: v.type }), v.name);
  }
  body.append("0", JSON.stringify([SLUG, "$K1"]));
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${ADMIN}${path}`, { method: "POST", redirect: "manual", headers: { "next-action": id, accept: "text/x-component", origin: ADMIN, cookie }, body });
    const text = await r.text();
    if (r.status < 500) {
      const m = text.match(/\{"ok":(true|false)[^\n]*\}/);
      const json = m ? (JSON.parse(m[0]) as { ok: boolean; error?: string; message?: string; url?: string; uploaded?: number }) : null;
      return { status: r.status, json, text };
    }
    await new Promise((res) => setTimeout(res, 10_000)); // dev server recompiling under other agents' edits
  }
  return { status: 500, json: null, text: "" };
}

const MEDIA_ID = actionId("uploadMedia", "media/actions");
const BRAND_ID = actionId("uploadBrandAsset", "design/actions");
const createdKeys: string[] = [];

// Guard (no writes either way): the old uploadBrandAsset throws on an unknown folder (500) and the old media action
// runs against a stale storage module. If the dev server still serves the old code, stop before the old code could
// store an SVG.
{
  const probe = await callUpload(BRAND_ID, `/t/${SLUG}/design`, [["folder", "../etc"], ["file", { name: "a.png", type: "image/png", data: PNG }]]);
  if (probe.status !== 200 || probe.json?.ok !== false) {
    console.log(`SKIP admin dev server is not running the new upload actions yet (probe ${probe.status}); reload it and re-run`);
    await sql.end();
    process.exit(2);
  }
}

async function rowFor(url: string | undefined) {
  if (!url) return null;
  const [row] = await sql`select id, key, mime from media where url=${url} order by created_at desc limit 1`;
  if (row) createdKeys.push(row.id);
  return row as { id: string; key: string; mime: string } | undefined;
}
async function lastRows(n: number, since: Date) {
  const [t] = await sql`select id from tenants where slug=${SLUG}`;
  const rows = await sql`select id, key, mime, alt from media where tenant_id=${t.id} and created_at >= ${since} order by created_at desc limit ${n}`;
  for (const r of rows) createdKeys.push(r.id);
  return rows as Array<{ id: string; key: string; mime: string; alt: string }>;
}

// ── media library ───────────────────────────────────────────────────────────────────────────────────────────────
{
  const since = new Date(Date.now() - 1000);
  const r = await callUpload(MEDIA_ID, `/t/${SLUG}/media`, [
    ["folder", "media"],
    ["files", { name: "qa-pf2-png-named.svg", type: "image/svg+xml", data: PNG }],
    ["files", { name: "qa-pf2-real.pdf", type: "application/pdf", data: PDF }],
    ["files", { name: "qa-pf2-svg-named.png", type: "image/png", data: SVG }],
    ["files", { name: "qa-pf2-html-named.pdf", type: "application/pdf", data: HTML }],
  ]);
  check("media: action answers", r.status === 200 && !!r.json, `status ${r.status}`);
  check("media: 2 of 4 accepted (PNG bytes + real PDF), SVG/HTML disguised files skipped", r.json?.ok === true && r.json.uploaded === 2, JSON.stringify(r.json));
  const rows = await lastRows(10, since);
  const png = rows.find((x) => x.alt === "qa-pf2-png-named");
  const pdf = rows.find((x) => x.alt === "qa-pf2-real");
  check("media: PNG uploaded as 'x.svg' / image/svg+xml is stored as .png image/png", !!png && png.key.endsWith(".png") && png.mime === "image/png", png ? `${png.key.split("/").pop()} ${png.mime}` : "missing");
  check("media: real PDF stored as .pdf application/pdf", !!pdf && pdf.key.endsWith(".pdf") && pdf.mime === "application/pdf", pdf ? `${pdf.key.split("/").pop()} ${pdf.mime}` : "missing");
  check("media: no stored row for the SVG / HTML payloads", !rows.some((x) => x.alt === "qa-pf2-svg-named" || x.alt === "qa-pf2-html-named"));
  const only = await callUpload(MEDIA_ID, `/t/${SLUG}/media`, [["files", { name: "qa-pf2-only.svg", type: "image/svg+xml", data: SVG }]]);
  check("media: an SVG-only upload is refused with the supported-types error", only.json?.ok === false && /ไม่รองรับ/.test(only.json.error ?? ""), only.json?.error ?? only.text.slice(0, 120));
}

// ── brand assets (logo / favicon / og image; section editor images) ───────────────────────────────────────────
{
  const svg = await callUpload(BRAND_ID, `/t/${SLUG}/design`, [["folder", "brand"], ["file", { name: "logo.svg", type: "image/svg+xml", data: SVG }]]);
  check("brand: SVG logo refused", svg.json?.ok === false && /SVG/.test(svg.json.error ?? ""), svg.json?.error ?? svg.text.slice(0, 120));
  const html = await callUpload(BRAND_ID, `/t/${SLUG}/design`, [["folder", "brand"], ["file", { name: "logo.png", type: "image/png", data: HTML }]]);
  check("brand: HTML declared as image/png refused", html.json?.ok === false, html.json?.error ?? html.text.slice(0, 120));
  const png = await callUpload(BRAND_ID, `/t/${SLUG}/design`, [["folder", "brand"], ["file", { name: "logo.svg", type: "image/svg+xml", data: PNG }]]);
  const pngRow = await rowFor(png.json?.url);
  check("brand: PNG bytes named logo.svg → stored .png image/png", png.json?.ok === true && !!pngRow && pngRow.key.endsWith(".png") && pngRow.mime === "image/png" && !!png.json.url?.endsWith(".png"), `${png.json?.url} ${pngRow?.mime}`);
  const ico = await callUpload(BRAND_ID, `/t/${SLUG}/design`, [["folder", "brand"], ["file", { name: "favicon.ico", type: "image/vnd.microsoft.icon", data: ICO }]]);
  const icoRow = await rowFor(ico.json?.url);
  check("brand: favicon.ico accepted → .ico image/x-icon", ico.json?.ok === true && !!icoRow && icoRow.key.endsWith(".ico") && icoRow.mime === "image/x-icon", `${ico.json?.url} ${icoRow?.mime}`);
  const bad = await callUpload(BRAND_ID, `/t/${SLUG}/design`, [["folder", "../etc"], ["file", { name: "a.png", type: "image/png", data: PNG }]]);
  check("brand: unknown folder refused (no throw)", bad.status === 200 && bad.json?.ok === false, bad.json?.error ?? `status ${bad.status}`);
}

// cleanup
const del = actionId("deleteMedia", "media/actions");
for (const id of [...new Set(createdKeys)]) await callAction(ADMIN, cookie, del, [SLUG, id], `/t/${SLUG}/media`).catch(() => {});
const [left] = await sql`select count(*)::int n from media where id = any(${[...new Set(createdKeys)]}::uuid[])`;
console.log(`cleanup: ${createdKeys.length ? `${[...new Set(createdKeys)].length - left.n} of ${[...new Set(createdKeys)].length} test rows deleted` : "nothing to delete"}`);
await sql.end();
console.log(failures ? `FAIL (${failures})` : "PASS all");
process.exit(failures ? 1 : 0);
