# Fix packet: admin_core_b4

Status: DONE (2026-10-17) — 14 findings handled: 12 FIXED, ADMIN_B2-02 admin side FIXED + storefront route FOLLOW-UP, RESPONSIVE_B2-16 owned part FIXED + 3 inputs FOLLOW-UP (other owners). Final: `pnpm --filter @rentweb/admin typecheck`, `@rentweb/db typecheck` + `test` (7/7), `@rentweb/tooling typecheck` green; the 4 new verify .ts scripts also typecheck clean; all verify scripts PASS. Schema change: pages.draft_meta (migration 0005_daily_rogue.sql, applied).
Verify scripts (run from `tooling/`): `pnpm exec tsx qa/bughunt/fixes/<script>` / `node qa/bughunt/fixes/<script>.mjs`.

| ID | Outcome | What changed (files) | How verified |
|----|---------|----------------------|--------------|
| ADMIN_B2-11 (admin side) | FIXED | settings/actions.ts addDomain / verifyDomain / removeDomain now call platform_b4's `claimCustomDomain` / `verifyCustomDomain` / `removeCustomDomain` from @rentweb/core/tenant (normalised input, another tenant's pending claim no longer blocks, TXT must match this claim's token, CNAME check, only `active` routes, host cache invalidated); audit codes kept. settings/domains/page.tsx passes `domainDnsInstructions()` per custom domain; domains-panel.tsx shows a per-status explanation (pending/failed = 'ยังไม่เปิดใช้ … หลังยืนยัน DNS สำเร็จเท่านั้น', active = ยืนยันแล้ว), two numbered records with full Host names (TXT `_rentweb.<host>` — the old UI said `_rentweb` only, which put the record on the wrong name for www hosts — and CNAME `<host>` -> `<slug>.<root>`), last check result, 'ตรวจสอบ DNS' button. Also fixed a 54 px horizontal overflow of the page at 390 (grid min-content: grid-cols-[minmax(0,1fr)] + min-w-0 on the copy buttons). | ADMIN_B2-11-12-18-verify.ts at 1440 + 390: help text, TXT name `_rentweb.www.qa-b2-sppp.test`, CNAME target shown; 'ตรวจสอบ DNS' on the failed domain -> 'ไม่พบ TXT record ที่ _rentweb.www.qa-b2-sppp.test ที่ตรงกับรหัสยืนยันของร้าน', status stays failed; adding 'https://QA-B4-x.TEST/x' stores qa-b4-x.test as pending with the 'เปิดใช้หลังยืนยันเท่านั้น' toast; removed again. _b4-overflow.ts: scrollWidth 390 at 390. Screenshots bughunt-admin_b2-b4-domains-{1440,390}.png |
| ADMIN_B2-12 | FIXED | (auth)/login/login-form.tsx: sign-up link carries `?next=` (label 'สมัครบัญชีเพื่อเข้าร่วมทีม' for /invite/ targets). (auth)/signup/page.tsx reads + sanitizes next (sanitizeNext), signed-in users go to next, and for /invite/<token> looks up the open invitation (tenant name + e-mail). signup-form.tsx: invite banner/title, e-mail prefilled, after sign-up router.push(safeNext(next, '/onboarding')), 'เข้าสู่ระบบ' link keeps next too. | ADMIN_B2-11-12-18-verify.ts at 390 (fresh invitation on qa-b2-shop-sppp, signed-out browser): /invite/<t> -> /login?next=%2Finvite%2F<t>; sign-up href /signup?next=%2Finvite%2F<t>; sign-up page shows 'สมัครบัญชีเพื่อเข้าร่วมทีม … QA B2 Shop sppp' with the invited e-mail; after sign-up URL = /invite/<t>; 'ยอมรับคำเชิญ' -> /t/qa-b2-shop-sppp/dashboard with role staff (user, membership and invitation deleted). Screenshot bughunt-admin_b2-b4-signup-invite-390.png |
| ADMIN_B2-18 | FIXED (admin) + storefront FOLLOW-UP | New apps/admin/src/lib/nav-href.ts checkNavHref: allows '/path' (not '//'), '#anchor', absolute http(s) with a host, mailto:/tel:/sms:/line:; refuses javascript:/data:/vbscript:/file:/other schemes, whitespace or control characters (java\tscript:), backslashes, bare words ('contact', 'www.x.com/…') with a Thai hint. pages/actions.ts navItemSchema uses it (server); `external` is only kept for http(s) links. nav-editor.tsx shows the same message under the field while typing (aria-invalid). No stored javascript:/data: hrefs exist in the DB (checked). | ADMIN_B2-11-12-18-verify.ts: 'javascript:alert(document.domain)' -> inline error + save refused 'ไม่อนุญาตลิงก์แบบ “javascript:” …', navigation rows unchanged; https://example.com/qa-b4 saves with external:true (navigation restored). Unit: 14 refused / 11 allowed hrefs PASS. |
| RESPONSIVE_B2-11 | FIXED (admin-core) + FOLLOW-UP (module dialogs) | New apps/admin/src/lib/use-return-focus.ts (`useReturnFocus(fallbackRef?)` -> {onOpenAutoFocus, onCloseAutoFocus}: remembers document.activeElement when the dialog opens and focuses it again on close, or the fallback when the opener unmounted). Applied to: components/shell/app-shell.tsx phone drawer (fallback = 'เปิดเมนู' button, which also gets aria-expanded), components/ui/confirm-button.tsx (shared by ~30 admin screens incl. module pages), section-editor.tsx add-section dialog / SEO dialog / mobile props sheet, media-grid.tsx detail + delete dialogs. | ADMIN_B2-11-12-18-verify.ts: 390 drawer Esc -> focus 'เปิดเมนู'; ConfirmButton (domains 'ลบ') Esc -> focus back on 'ลบ'. ADMIN_B2-01-02-03-verify.ts: SEO dialog Esc -> 'ตั้งค่าหน้า & SEO'. ADMIN_B2-14-15-16-17-verify.ts: media dialog Esc -> its thumbnail. |
| RESPONSIVE_B2-16 | FIXED in owned code + FOLLOW-UP (the 3 reported inputs are outside this packet) | components/editor/auto-form.tsx ImageField: the URL input now has a real `<Label htmlFor>` (sr-only 'ลิงก์รูปภาพ (<field>)') instead of only aria-label/placeholder. The reported inputs live in packages/modules/booking/src/admin/ui/inputs.tsx:144, apps/admin/src/app/t/[slug]/products/product-form.tsx:282 and apps/admin/src/app/t/[slug]/clinic/visits/[id]/visit-form.tsx:475 (other owners) — see follow-ups. | ADMIN_B2-14-15-16-17-verify.ts: section image URL field has labels.length > 0 for staff and manager. |
| ADMIN_B2-14 | FIXED | media/actions.ts new uploadSectionImage (staff+, same role as savePageDraft; image kinds only JPG/PNG/WebP/GIF/AVIF; returns a Result, never throws). section-editor.tsx uses it instead of the admin-only design uploadBrandAsset, checks the 10 MB limit first and toasts every failure (try/catch); the upload button is hidden for viewers. auto-form.tsx ImageField: busy state reset in finally, explicit accept list. | ADMIN_B2-14-15-16-17-verify.ts: as qa-b2 staff and manager on qa-b2-shop-sppp home editor -> hero image upload fills /uploads/… URL, no page errors, media rows recorded; SVG -> toast 'ชนิดไฟล์ไม่รองรับ (JPG, PNG, WebP, GIF, AVIF)' (rows/files removed). Screenshot bughunt-admin_b2-b4-section-upload-staff-1440.png |
| ADMIN_B2-15 | FIXED | apps/admin/src/proxy.ts: matcher entries are objects with `missing: [{ type: 'header', key: 'next-action' }]`, so server-action POSTs no longer pass through the proxy (whose body buffer truncates at proxyClientMaxBodySize = 10 MB); actions authenticate themselves and keep serverActions.bodySizeLimit 12mb. next.config.ts left unchanged on purpose (editing it restarts the shared dev server). media-grid.tsx: client checks size/count (Thai per-file message 'ไฟล์ใหญ่เกิน 10 MB (11.0 MB)'), uploads ONE file per request sequentially with progress 'กำลังอัปโหลด n/N', summarises successes + skipped files. New media/limits.ts (shared limits/labels). uploadMedia returns per-file errors in its message and never throws for role. | ADMIN_B2-14-15-16-17-verify.ts: 3 x 4 MB + 1 x exactly 10 MB (request body > 10 MB) + 1 x 11 MB -> 4 uploaded, toast 'อัปโหลด 4 ไฟล์ · ข้าม 1 …11mb.png: ไฟล์ใหญ่เกิน 10 MB (11.0 MB)', no 'Unexpected end of form'. Unit: MEDIA_MAX_BYTES == core MAX_UPLOAD_BYTES. |
| ADMIN_B2-16 | FIXED | media-grid.tsx hint now 'รองรับ JPG, PNG, WebP, GIF, AVIF, PDF, MP4, WebM' from media/limits.ts MEDIA_TYPES_LABEL; file input accept list matches. | verify script: hint has no SVG, lists AVIF/WebM; unit: label == MEDIA_LIBRARY_KINDS. |
| ADMIN_B2-17 | FIXED | New media/usage.ts findMediaUsage (storage key matched in pages.sections / published_sections / seo / draft_meta, posts, products, product_variants, categories, services, staff, clinic_packages, menu_categories, menu_items, games, game_packages, and tenants.theme). media/actions.ts getMediaUsage + deleteMedia(slug, id, { confirmInUse }) refuses an in-use file without confirmation (lists up to 5 usages), audit records the usages. media-grid.tsx: 'ลบไฟล์' looks up usages, then a dialog lists them with links (or 'ไม่พบการใช้งาน'), destructive 'ลบทั้งที่ยังใช้อยู่'. | verify script: file referenced by a published page -> direct deleteMedia call ok:false 'ไฟล์นี้ยังถูกใช้อยู่ใน หน้าเว็บ “QAB4 …”', file kept; UI dialog lists the page, confirm deletes with toast '… 1 จุดที่ใช้ไฟล์นี้จะไม่แสดงรูป'; unused file -> plain confirmation. Screenshot bughunt-admin_b2-b4-media-inuse-1440.png |
| ADMIN_B2-01 | FIXED | Schema: packages/db/src/schema/cms.ts `pages.draft_meta jsonb` (+ type PageDraftMeta) -> migration packages/db/drizzle/0005_daily_rogue.sql (`ALTER TABLE pages ADD COLUMN draft_meta jsonb`, applied). New pure apps/admin/src/app/t/[slug]/pages/page-meta.ts (planMetaSave / effectiveMeta / hasUnpublishedChanges / cleanSeo). pages/actions.ts savePageDraft: on a PUBLISHED page title/slug/SEO/noindex/OG/showInNav go to draft_meta (null when equal to live) and the live columns stay; unpublished pages still write the live columns (nothing is visible). publishPage copies draft_meta to the live columns (slug re-checked: reserved + uniqueness incl. other pages' draft slugs), clears it, audit diff from/to. Slug uniqueness now also checks other pages' pending draft slugs. pages/[id]/page.tsx loads effectiveMeta + liveSlug + pending flag; section-editor.tsx shows 'มีการแก้ไขที่ยังไม่เผยแพร่', '(หน้าร้านยังใช้ /<live> จนกว่าจะเผยแพร่)', SEO dialog note + 'บันทึกร่าง' label, Save disabled for viewers; pages list badge 'มีแก้ไขรอเผยแพร่' and the live-link icon only for published pages. | ADMIN_B2-01-02-03-verify.ts (browser + DB + storefront): draft save of title/slug/SEO/description/noindex -> live columns unchanged, draft_meta set, storefront old URL 200 with old <title>, new URL 404, editor shows pending notes and reloads the draft values; publish -> live slug/title/noindex updated, draft_meta null, new URL 200 with new <title>, old URL 404 (test page deleted). ADMIN_CORE_B4-unit-verify.ts page-meta cases PASS. Screenshot tooling/screenshots/bughunt-admin_b2-b4-editor-draft-1440.png |
| ADMIN_B2-02 | FIXED (admin side) + storefront FOLLOW-UP | New apps/admin/src/lib/preview-token.ts (HMAC-SHA256 token {t: tenantId, p: pageId, e: exp}, 30 min TTL, key derived from SECRETS_ENCRYPTION_KEY with the core/crypto dev fallback; verifyPreviewToken checks signature, expiry, tenant). pages/actions.ts createPagePreviewLink (any member; the editor already shows them the draft) returns `<storefront>/preview?token=…`. section-editor.tsx 'ดูตัวอย่าง' opens the tab synchronously, saves unsaved edits as a DRAFT first (never publishes), then navigates it to the signed link; the old live link moved to the ⋯ menu as 'เปิดหน้าที่เผยแพร่อยู่' (published pages only). 'preview' is a reserved page slug. Chosen over rendering inside the admin: sections are storefront server components that need the tenant theme/fonts/header/footer and tenant-host API routes, which only the storefront has. | ADMIN_B2-01-02-03-verify.ts: popup URL = http://qa-b2-shop-sppp.localhost:3000/preview?token=…, token verifies for this tenant + page; tamper / forged payload / expired / wrong tenant refused (unit). Storefront route still 404 until the follow-up below lands. |
| ADMIN_B2-03 | FIXED | page-meta.ts reservedPageSlugs(modules): always api, rw, account, site-status, preview, uploads; plus the first segment of MODULES[m].storefrontRoutes for every ENABLED non-cms module (commerce products/collections/cart/checkout/orders, booking book/services/staff, clinic packages, restaurant menu/t/order/reserve, topup games/topup/wallet) and the nested module folders the registry misses (bookings, reservations, orders). Module routes fall back to the CMS page when their module is off (apps/web lib/cms-fallback.tsx), so a cms-only site may now use /services, /staff, /packages… (the corporate template already ships /services). Used by createPage, savePageDraft (only when the slug changes) and publishPage; pages list flags an existing page whose slug is now shadowed ('ถูกหน้าโมดูลบัง'). | ADMIN_B2-01-02-03-verify.ts: 'staff' refused on qa-b2-salon-sppp, 'packages' refused on qa-b2-clinic-sppp (Thai reserved message, no page), 'staff' accepted on qa-b2-corp-sppp (page deleted afterwards). Unit: reserved sets per module PASS. |
| ADMIN_B2-06 | FIXED | apps/admin/src/app/t/[slug]/dashboard/queries.ts: checklist built from the enabled modules. No item module (cms-only): content item = "แก้ไขและเผยแพร่หน้าเว็บของคุณ" (done when any page was published after provisioning: published_at > createdAt+5 min, or steps.content), linking to the home-page editor. Payments item only when a payment-taking module (PAYMENT_MODULES from kpis.ts) is enabled. The optional "โดเมนส่วนตัว (ถ้ามี)" item no longer holds the bar below 100 % (ChecklistItem.optional). | ADMIN_B2-06-verify.mjs (live): qa-b2-corp-sppp shows no payments / no real-item row, page row links to /pages/<home id>; with logo/theme/LINE steps + home published now -> 100 %; restored afterwards; qa-b2-shop-sppp still has both rows: 7/7 PASS. |
| ADMIN_B2-08 | FIXED | New apps/admin/src/lib/signup-rules.ts (checkName: trim + collapse whitespace, 2-120 chars; checkPassword: 8-128, not blank, >=2 of letter/digit/symbol, not repeated chars, small common-password list, not containing the e-mail local part). apps/admin/src/lib/auth-config.ts: Better Auth `hooks.before` (createAuthMiddleware) enforces them on /sign-up/email, /update-user (name), /change-password, /reset-password, /set-password with Thai APIError messages and stores the normalised name; maxPasswordLength 128. signup-form.tsx uses the same rules client-side. apps/admin/src/lib/auth.ts: the globalThis-cached auth instance is rebuilt when auth-config.ts reloads (otherwise config changes needed a dev-server restart). | ADMIN_B2-08-verify.mjs (live API): empty / whitespace / 5000-char name, 8 spaces, 7 chars, password123, letters-only -> 400 with Thai message and no user row; valid sign-up 200 with name stored trimmed (test users deleted): 16/16 PASS. ADMIN_CORE_B4-unit-verify.ts rule cases PASS. |

## Follow-ups for other packets

### apps/web owner — ADMIN_B2-02 storefront draft preview route (exact spec)

The admin now links "ดูตัวอย่าง" to `<storefront>/preview?token=<token>` (tenant host, so the proxy rewrites it to
`rw/[tenantId]/preview`). Until this route exists that URL is a 404. `preview` is a reserved page slug, so no CMS page can collide.

1. Share the verifier: move `apps/admin/src/lib/preview-token.ts` (node:crypto only, no app imports) to
   `packages/core/src/preview-token.ts`, add `"./preview-token": "./src/preview-token.ts"` to packages/core/package.json
   exports, and change the one admin import (`apps/admin/src/app/t/[slug]/pages/actions.ts`) to `@rentweb/core/preview-token`
   (and the import in tooling/qa/bughunt/fixes/ADMIN_CORE_B4-unit-verify.ts + ADMIN_B2-01-02-03-verify.ts).
   Token = `base64url(JSON {t: tenantId, p: pageId, e: expUnixSeconds}).base64url(HMAC-SHA256)`, key = HMAC(SECRETS_ENCRYPTION_KEY, "rentweb:page-preview:v1"), TTL 30 min.
2. New `apps/web/src/app/(sites)/rw/[tenantId]/preview/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, pages, type SectionJson } from "@rentweb/db";
import { RenderSections } from "@rentweb/storefront";
import { verifyPreviewToken } from "@rentweb/core/preview-token";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { PageBody } from "@/components/page-body";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ตัวอย่างฉบับร่าง", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ token?: string }> }) {
  const { tenantId } = await params;
  const check = verifyPreviewToken((await searchParams).token, { expectedTenantId: tenantId });
  if (!check.ok) notFound(); // optional: Thai "ลิงก์ตัวอย่างหมดอายุ กด ดูตัวอย่าง ในหลังบ้านอีกครั้ง" when check.reason === "expired"
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  const [row] = await tenantTx(tenantId, (tx) => tx.select().from(pages).where(and(eq(pages.tenantId, tenantId), eq(pages.id, check.pageId))).limit(1));
  if (!row) notFound();
  const title = row.draftMeta?.title ?? row.title;
  const sections = (row.sections ?? []) as SectionJson[]; // DRAFT sections, not publishedSections
  const ctx = await buildCtx(runtime);
  return (
    <>
      <div role="status" className="sticky top-0 z-50 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
        ตัวอย่างฉบับร่าง “{title}” — ยังไม่เผยแพร่ ลูกค้ายังไม่เห็นการแก้ไขนี้
      </div>
      <PageBody theme={runtime.theme} sections={sections}>
        <RenderSections sections={sections} ctx={ctx} pageTitle={title} />
      </PageBody>
    </>
  );
}
```
   Response must not be cached (dynamic) and must send noindex. Verify with
   `pnpm exec tsx qa/bughunt/fixes/ADMIN_B2-01-02-03-verify.ts` (its INFO line should then report 200) and check that the
   draft heading (not the published one) is rendered.

### apps/web owner — ADMIN_B2-18 storefront part
- Header / footer / mobile nav renderers: for `item.external === true` render `target="_blank" rel="noopener noreferrer"`.
  (The admin now only stores `external` for http(s) links.)
- Defence in depth: skip nav items whose href fails the same rule (`/…` not `//`, `#…`, http(s), mailto:, tel:, sms:, line:);
  the rule is `checkNavHref` in apps/admin/src/lib/nav-href.ts (pure; can move to packages/core the same way as the preview token).
  No such rows exist in the DB today.

### booking-module / products / clinic owners — RESPONSIVE_B2-16
Give the image-URL inputs a real name (same as the page builder now has):
- packages/modules/booking/src/admin/ui/inputs.tsx:144 (services + staff forms)
- apps/admin/src/app/t/[slug]/products/product-form.tsx:282
- apps/admin/src/app/t/[slug]/clinic/visits/[id]/visit-form.tsx:475
e.g. `aria-label="ลิงก์รูปภาพ"` or `<Label htmlFor=… className="sr-only">ลิงก์รูปภาพ</Label>` + matching `id`.

### restaurant / clinic owners — RESPONSIVE_B2-11 remaining dialogs
The controlled dialogs listed in the finding (restaurant/menu/menu-managers.tsx 'จัดการหมวด', menu modifiers 'เพิ่มกลุ่มตัวเลือก',
restaurant/tables 'เพิ่มโต๊ะ' + 'สร้าง QR ใหม่', restaurant/reservations/reservation-dialog.tsx, clinic patients / visits / packages)
are outside this packet. Fix each in one line: `const returnFocus = useReturnFocus();` (from `@/lib/use-return-focus`) and
`<DialogContent {...returnFocus}>` (compose if the content already sets onOpenAutoFocus/onCloseAutoFocus). Anything built on
`components/ui/confirm-button.tsx` is already fixed.

### core owner (optional) — ADMIN_B2-03
`MODULES[*].storefrontRoutes` in packages/core/src/modules/index.ts misses real route folders: booking `/bookings`,
clinic `/bookings`, restaurant `/orders` + `/reservations`. apps/admin/src/app/t/[slug]/pages/page-meta.ts adds them locally
(EXTRA_MODULE_ROUTES); once the registry lists them that map can go.

### anyone touching uploads
`experimental.proxyClientMaxBodySize` was NOT raised (editing apps/admin/next.config.ts restarts the shared dev server);
server actions skip the proxy instead (apps/admin/src/proxy.ts). If a non-action route under /t, /console or /onboarding ever
accepts large bodies, raise `proxyClientMaxBodySize` to match `serverActions.bodySizeLimit` (12mb).

## Notes for a successor
- Live verify scripts (run from `tooling/`): `pnpm exec tsx qa/bughunt/fixes/ADMIN_CORE_B4-unit-verify.ts` (pure, 59 checks),
  `node qa/bughunt/fixes/ADMIN_B2-08-verify.mjs`, `MSYS_NO_PATHCONV=1 node qa/bughunt/fixes/ADMIN_B2-06-verify.mjs`,
  `pnpm exec tsx qa/bughunt/fixes/ADMIN_B2-01-02-03-verify.ts`, `… ADMIN_B2-14-15-16-17-verify.ts`, `… ADMIN_B2-11-12-18-verify.ts`.
  All clean up after themselves (pages, media rows + files, domains, invitations, users, navigation).
- `_b4-overflow.ts <paths…>` measures horizontal overflow at 390 for the qa-b2 owner; `_b4-smoke.mjs` / `_b4-grep.mjs` do quick
  signed-in GETs; `_b4-cleanup-users.mjs 'qa-b4-…%'` removes stray test users.
- Better Auth config is cached on globalThis; apps/admin/src/lib/auth.ts now rebuilds it when auth-config.ts reloads, so hook
  changes take effect without a dev-server restart.
- Heredocs through the Bash tool collapse `\\` to `\`; write files containing regex backslashes with the Write/Edit tools.
