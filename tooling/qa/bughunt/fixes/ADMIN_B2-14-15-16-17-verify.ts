/**
 * Media regressions (browser + DB) on qa-b2-shop-sppp (admin_b2-creds.json):
 *  B2-16 hint lists the accepted types only (no SVG)
 *  B2-15 one request per file: 3 x 4 MB + 1 x exactly 10 MB upload (that request body is over the old 10 MB proxy
 *        buffer once multipart overhead is added), an 11 MB file is skipped with the Thai size message
 *  B2-17 deleting an in-use file lists the page that uses it and needs a second confirmation; an unused file says so;
 *        the server refuses an in-use delete without confirmInUse (direct action call)
 *  B2-14 staff + manager can upload a section image in the page builder (URL filled, no page error); SVG -> Thai toast
 *  RESPONSIVE_B2-11 the media detail dialog returns focus to its thumbnail
 * Every qa-b4 media row / file / page created here is removed at the end.
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/ADMIN_B2-14-15-16-17-verify.ts
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { and, eq, like, media, pages } from "@rentweb/db";
import { getStorage } from "@rentweb/core/storage";
import { ADMIN, anyToast, done, go, launch, newCtx, newPage, rand, readCreds, shot, stateFor, toast, tt } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};
const c = readCreds();
const shop = c.tenants.find((t: { key: string }) => t.key === "shop") as { slug: string; id: string };
const r = rand();
const prefix = `qa-b4-${r}`;
const qaMedia = () => tt(shop.id, (tx) => tx.select().from(media).where(and(eq(media.tenantId, shop.id), like(media.alt, `${prefix}%`))));
const createdPages: string[] = [];

function actionIdFor(name: string, fileHint: string): string | null {
  const root = path.resolve(process.cwd(), "..");
  const files = execSync("find apps/admin/.next/dev/server -name server-reference-manifest.json", { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  for (const f of files) {
    const j = JSON.parse(readFileSync(path.join(root, f), "utf8")) as { node?: Record<string, { exportedName?: string; name?: string; filename?: string }> };
    for (const [id, v] of Object.entries(j.node ?? {})) if ((v.exportedName ?? v.name) === name && (v.filename ?? "").includes(fileHint)) return id;
  }
  return null;
}

const browser = await launch();
try {
  const st = await stateFor(browser, "owner", c.owner.email, c.owner.password);
  const ctx = await newCtx(browser, { storageState: st });
  await isolateHmr(ctx);
  const page = await newPage(ctx);
  await go(page, `/t/${shop.slug}/media`);
  const hint = await page.getByText(/รองรับ JPG/).first().innerText();
  check("B2-16 hint has no SVG and lists AVIF/WebM", !/svg/i.test(hint) && hint.includes("AVIF") && hint.includes("WebM"), hint);

  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 120, height: 80 } });
  const pad = (n: number) => Buffer.concat([png, Buffer.alloc(n - png.length, 0)]);
  const MB = 1024 * 1024;
  const files = [
    ...[0, 1, 2].map((i) => ({ name: `${prefix}-4mb-${i}.png`, mimeType: "image/png", buffer: pad(4 * MB) })),
    { name: `${prefix}-10mb.png`, mimeType: "image/png", buffer: pad(10 * MB) }, // exactly the limit: request body > 10 MB proxy buffer
    { name: `${prefix}-11mb.png`, mimeType: "image/png", buffer: pad(11 * MB) },
  ];
  const t1 = await anyToast(page, () => page.locator('input[type="file"]').setInputFiles(files), 240_000);
  await page.waitForTimeout(1500);
  const rows1 = await qaMedia();
  check("B2-15 4 files under 10 MB uploaded (one request each)", rows1.length === 4, { count: rows1.length, toast: t1 });
  check("B2-15 11 MB file skipped with Thai size message", /ข้าม 1/.test(t1) && /11mb\.png: ไฟล์ใหญ่เกิน 10 MB/.test(t1) && !/Unexpected end of form/i.test(t1), t1);

  // B2-17: one file used by a published page, one unused
  const tIn = await toast(page, /อัปโหลด 1 ไฟล์แล้ว/, () => page.locator('input[type="file"]').setInputFiles({ name: `${prefix}-inuse.png`, mimeType: "image/png", buffer: png }), 90_000);
  const [inuse] = (await qaMedia()).filter((m) => m.alt === `${prefix}-inuse`);
  check("B2-17 in-use test file uploaded", !!inuse, tIn);
  const [pg] = await tt(shop.id, (tx) =>
    tx
      .insert(pages)
      .values({ tenantId: shop.id, slug: `${prefix}-img`, title: `QAB4 รูปใช้งาน ${r}`, kind: "page", status: "published", sections: [{ id: "qab4img1", type: "image-text", props: { image: { url: inuse!.url, alt: "x" }, heading: "QAB4" } }], publishedSections: [{ id: "qab4img1", type: "image-text", props: { image: { url: `http://${shop.slug}.localhost:3000${inuse!.url}`, alt: "x" }, heading: "QAB4" } }], seo: {}, publishedAt: new Date() })
      .returning({ id: pages.id }),
  );
  createdPages.push(pg!.id);

  // server refuses an in-use delete without confirmInUse
  const delId = actionIdFor("deleteMedia", "media/actions");
  if (delId) {
    const res = await page.evaluate(
      async ({ id, args, url }) => {
        const r = await fetch(url, { method: "POST", headers: { "next-action": id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" }, body: JSON.stringify(args) });
        return r.text();
      },
      { id: delId, args: [shop.slug, inuse!.id], url: `${ADMIN}/t/${shop.slug}/media` },
    );
    check("B2-17 server refuses in-use delete without confirmation", /"ok":false/.test(res) && res.includes("ยังถูกใช้อยู่ใน") && res.includes(`QAB4 รูปใช้งาน ${r}`), res.slice(0, 300));
  } else console.log("INFO deleteMedia action id not in manifest yet (skipped direct probe)");
  check("B2-17 file still there", (await qaMedia()).some((m) => m.id === inuse!.id));

  await go(page, `/t/${shop.slug}/media`);
  const thumb = page.getByRole("button", { name: `เปิด ${prefix}-inuse` });
  await thumb.focus();
  await thumb.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check("RESPONSIVE_B2-11 media dialog returns focus to the thumbnail", await page.evaluate((n) => document.activeElement?.getAttribute("aria-label") === n, `เปิด ${prefix}-inuse`));
  await thumb.click();
  await page.getByRole("dialog").getByRole("button", { name: /ลบไฟล์/ }).click();
  const confirmDlg = page.getByRole("dialog").filter({ hasText: "ใช้อยู่ 1 แห่ง" });
  await confirmDlg.waitFor({ timeout: 60_000 });
  const txt = await confirmDlg.innerText();
  check("B2-17 confirm lists where the file is used", txt.includes(`QAB4 รูปใช้งาน ${r}`) && txt.includes("หน้าเว็บ"), txt.replace(/\s+/g, " ").slice(0, 200));
  await page.screenshot({ path: shot("b4-media-inuse-1440") });
  const tDel = await toast(page, /ลบไฟล์แล้ว/, () => confirmDlg.getByRole("button", { name: /ลบทั้งที่ยังใช้อยู่/ }).click());
  check("B2-17 in-use delete after confirmation", !(await qaMedia()).some((m) => m.id === inuse!.id) && /1 จุด/.test(tDel), tDel);

  const unused = rows1[0]!;
  await go(page, `/t/${shop.slug}/media`);
  await page.getByRole("button", { name: `เปิด ${unused.alt}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: /ลบไฟล์/ }).click();
  const plain = page.getByRole("dialog").filter({ hasText: "ไม่พบการใช้งาน" });
  await plain.waitFor({ timeout: 60_000 });
  await toast(page, /ลบไฟล์แล้ว/, () => plain.getByRole("button", { name: /^ลบไฟล์$/ }).click());
  check("B2-17 unused file: plain confirmation + deleted", !(await qaMedia()).some((m) => m.id === unused.id));
  await ctx.close();

  // B2-14: section image upload as staff and manager
  for (const role of ["staff", "manager"] as const) {
    const rs = await stateFor(browser, role, c.team[role].email, c.team[role].password);
    const rctx = await newCtx(browser, { storageState: rs });
    await isolateHmr(rctx);
    const p = await newPage(rctx);
    const [home] = await tt(shop.id, (tx) => tx.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, shop.id), eq(pages.kind, "home"))));
    await go(p, `/t/${shop.slug}/pages/${home!.id}`);
    await p.getByRole("button", { name: /เพิ่มเซ็กชัน/ }).first().click();
    await p.getByRole("dialog").getByRole("button", { name: /ฮีโร่/ }).first().click();
    const field = p.locator("fieldset").filter({ has: p.locator('input[type="file"]') }).first();
    const fileInput = field.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: "attached" });
    const urlInput = field.locator('input[id$="-url"]').first();
    await fileInput.setInputFiles({ name: `${prefix}-${role}-hero.png`, mimeType: "image/png", buffer: png });
    await p.waitForFunction((sel) => (document.querySelector(sel) as HTMLInputElement | null)?.value.includes("/uploads/") ?? false, `fieldset input[id$="-url"]`, { timeout: 90_000 }).catch(() => {});
    const val = await urlInput.inputValue();
    const labelled = await urlInput.evaluate((el) => (el as HTMLInputElement).labels?.length ?? 0);
    check(`B2-14 ${role} section image upload fills the URL`, val.includes("/uploads/"), { val, errors: p.__errors.filter((e) => !/hydrat|Download the React DevTools/i.test(e)) });
    check(`RESPONSIVE_B2-16 section image URL field has a <label> (${role})`, labelled > 0);
    const tSvg = await anyToast(p, () => fileInput.setInputFiles({ name: `${prefix}.svg`, mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') }), 60_000);
    check(`B2-14 ${role} SVG refused with a toast`, /ชนิดไฟล์ไม่รองรับ/.test(tSvg), tSvg);
    if (role === "staff") await p.screenshot({ path: shot("b4-section-upload-staff-1440") });
    await rctx.close();
  }
  const roleRows = (await qaMedia()).filter((m) => /-(staff|manager)-hero$/.test(m.alt ?? ""));
  check("B2-14 uploads recorded in the media library", roleRows.length === 2, roleRows.map((m) => m.alt));
} finally {
  await browser.close();
  const left = await qaMedia();
  for (const m of left) await getStorage().delete(m.key).catch(() => {});
  if (left.length) await tt(shop.id, (tx) => tx.delete(media).where(and(eq(media.tenantId, shop.id), like(media.alt, `${prefix}%`))));
  for (const id of createdPages) await tt(shop.id, (tx) => tx.delete(pages).where(and(eq(pages.tenantId, shop.id), eq(pages.id, id))));
  console.log(`cleanup: ${left.length} media rows, ${createdPages.length} pages`);
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
