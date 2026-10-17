/**
 * admin_core_b4 unit regressions (pure helpers, no servers needed):
 *  ADMIN_B2-01 page-meta planMetaSave / effectiveMeta / hasUnpublishedChanges
 *  ADMIN_B2-02 preview-token sign / verify (tamper, expiry, wrong tenant)
 *  ADMIN_B2-03 reservedPageSlugs per enabled module
 *  ADMIN_B2-08 signup-rules checkName / checkPassword
 *  ADMIN_B2-15/16 media limits mirror @rentweb/core/storage
 *  ADMIN_B2-18 nav-href checkNavHref
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/ADMIN_CORE_B4-unit-verify.ts
 */
import { MAX_UPLOAD_BYTES, MEDIA_LIBRARY_KINDS } from "@rentweb/core/storage";
import { effectiveMeta, hasUnpublishedChanges, planMetaSave, reservedPageSlugs } from "../../../../apps/admin/src/app/t/[slug]/pages/page-meta";
import { signPreviewToken, verifyPreviewToken } from "@rentweb/core/preview-token";
import { checkNavHref } from "../../../../apps/admin/src/lib/nav-href";
import { checkName, checkPassword } from "../../../../apps/admin/src/lib/signup-rules";
import { MAX_FILES_PER_UPLOAD, MEDIA_MAX_BYTES, MEDIA_TYPES_LABEL } from "../../../../apps/admin/src/app/t/[slug]/media/limits";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};

/* ---- ADMIN_B2-01 ---- */
const live = { status: "published", title: "About", slug: "about", showInNav: true, seo: { title: "About us" } };
const edited = { title: "About NEW", slug: "about-new", showInNav: false, seo: { title: "SEO NEW", noindex: true } };
const plan1 = planMetaSave(live, edited);
check("B2-01 published page: draft save keeps live columns", plan1.live === null && plan1.draftMeta?.slug === "about-new" && plan1.draftMeta?.seo.noindex === true, plan1);
const plan2 = planMetaSave(live, { title: "About", slug: "about", showInNav: true, seo: { title: "About us", description: "" } });
check("B2-01 unchanged meta on published page -> draft_meta null", plan2.live === null && plan2.draftMeta === null, plan2);
const plan3 = planMetaSave({ ...live, status: "draft" }, edited);
check("B2-01 never-published page writes live columns directly", plan3.live?.slug === "about-new" && plan3.draftMeta === null, plan3);
check("B2-01 editor shows draft meta when pending", effectiveMeta({ ...live, draftMeta: { ...edited } }).title === "About NEW");
check("B2-01 editor shows live meta otherwise", effectiveMeta({ ...live, draftMeta: null }).slug === "about");
check("B2-01 pending flag: meta", hasUnpublishedChanges({ status: "published", sections: [], publishedSections: [], draftMeta: { ...edited } }));
check("B2-01 pending flag: sections", hasUnpublishedChanges({ status: "published", sections: [{ id: "a" }], publishedSections: [], draftMeta: null }));
check("B2-01 pending flag: none", !hasUnpublishedChanges({ status: "published", sections: [{ id: "a" }], publishedSections: [{ id: "a" }], draftMeta: null }));
check("B2-01 pending flag: draft page never 'pending'", !hasUnpublishedChanges({ status: "draft", sections: [{ id: "a" }], publishedSections: null, draftMeta: null }));

/* ---- ADMIN_B2-02 ---- */
const tid = "01a14029-0480-768b-9665-6161a17c1ff0";
const pid = "01a14029-0480-768b-9665-000000000001";
const tok = signPreviewToken({ tenantId: tid, pageId: pid });
const ok = verifyPreviewToken(tok, { expectedTenantId: tid });
check("B2-02 valid token verifies", ok.ok && ok.pageId === pid && ok.tenantId === tid, ok);
check("B2-02 wrong tenant refused", verifyPreviewToken(tok, { expectedTenantId: "other" }).ok === false);
const [body, sig] = tok.split(".");
const forged = Buffer.from(JSON.stringify({ t: tid, p: "01a14029-0000-0000-0000-000000000099", e: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
check("B2-02 forged payload refused", verifyPreviewToken(`${forged}.${sig}`).ok === false);
check("B2-02 tampered signature refused", verifyPreviewToken(`${body}.${sig!.slice(0, -2)}xx`).ok === false);
const old = signPreviewToken({ tenantId: tid, pageId: pid, now: Date.now() - 31 * 60_000 });
const exp = verifyPreviewToken(old);
check("B2-02 token older than 30 min expired", !exp.ok && exp.reason === "expired", exp);
check("B2-02 garbage refused", !verifyPreviewToken("abc").ok && !verifyPreviewToken("").ok && !verifyPreviewToken("a.b.c").ok);

/* ---- ADMIN_B2-03 ---- */
const salon = reservedPageSlugs(["cms", "booking"]);
const clinic = reservedPageSlugs(["cms", "booking", "clinic"]);
const corp = reservedPageSlugs(["cms"]);
check("B2-03 booking reserves staff/services/book", ["staff", "services", "book", "bookings"].every((s) => salon.has(s)));
check("B2-03 clinic reserves packages", clinic.has("packages") && !salon.has("packages"));
check("B2-03 commerce reserves products/cart/checkout/collections/orders", ["products", "cart", "checkout", "collections", "orders"].every((s) => reservedPageSlugs(["commerce"]).has(s)));
check("B2-03 restaurant reserves menu/order/reserve/reservations/t", ["menu", "order", "reserve", "reservations", "t"].every((s) => reservedPageSlugs(["restaurant"]).has(s)));
check("B2-03 always reserved: api/rw/account/preview", ["api", "rw", "account", "preview", "site-status"].every((s) => corp.has(s)));
check("B2-03 corporate may use services/staff/packages/contact/blog", ["services", "staff", "packages", "contact", "blog", "about"].every((s) => !corp.has(s)), [...corp]);

/* ---- ADMIN_B2-08 ---- */
check("B2-08 empty name refused", !checkName("").ok && !checkName("   ").ok && !checkName("ก").ok);
check("B2-08 5000-char name refused", !checkName("ก".repeat(5000)).ok);
const n = checkName("  สมชาย   ใจดี ");
check("B2-08 name trimmed + collapsed", n.ok && n.name === "สมชาย ใจดี", n);
check("B2-08 8 spaces refused", checkPassword("        ") !== null, checkPassword("        "));
check("B2-08 short refused", checkPassword("Ab1") !== null);
check("B2-08 common refused", checkPassword("password123") !== null && checkPassword("12345678") !== null);
check("B2-08 letters only refused", checkPassword("abcdefghij") !== null);
check("B2-08 repeated chars refused", checkPassword("aaaa1111") !== null && checkPassword("abababab12") === null, [checkPassword("aaaa1111"), checkPassword("abababab12")]);
check("B2-08 contains e-mail refused", checkPassword("somchai2024", { email: "somchai@example.com" }) !== null);
check("B2-08 good passwords accepted", checkPassword("Admin1234!") === null && checkPassword("Passw0rd!x") === null && checkPassword("รหัสลับ2567") === null, [checkPassword("Admin1234!"), checkPassword("Passw0rd!x"), checkPassword("รหัสลับ2567")]);

/* ---- ADMIN_B2-15 / 16 ---- */
check("B2-15 client limit mirrors MAX_UPLOAD_BYTES", MEDIA_MAX_BYTES === MAX_UPLOAD_BYTES, { MEDIA_MAX_BYTES, MAX_UPLOAD_BYTES });
check("B2-15 files per upload", MAX_FILES_PER_UPLOAD === 20);
const labelKinds = MEDIA_TYPES_LABEL.toLowerCase().replace(/jpg/, "jpeg").split(/,\s*/);
check("B2-16 hint lists exactly MEDIA_LIBRARY_KINDS (no SVG)", !/svg/i.test(MEDIA_TYPES_LABEL) && labelKinds.length === MEDIA_LIBRARY_KINDS.length && MEDIA_LIBRARY_KINDS.every((k) => labelKinds.includes(k)), { labelKinds, MEDIA_LIBRARY_KINDS });

/* ---- ADMIN_B2-18 ---- */
const bad = ["javascript:alert(document.domain)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", " javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd", "//evil.example", "/\\evil.example", "contact", "www.facebook.com/page", "https://", "mailto:", ""];
for (const b of bad) check(`B2-18 refused ${JSON.stringify(b)}`, !checkNavHref(b).ok, checkNavHref(b));
const good = ["/", "/about", "/products?sort=new", "#contact", "/เกี่ยวกับเรา", "https://example.com/qa", "http://example.com", "mailto:hello@example.com", "tel:+6621234567", "line://ti/p/@shop", "sms:+66812345678"];
for (const g of good) check(`B2-18 allowed ${JSON.stringify(g)}`, checkNavHref(g).ok, checkNavHref(g));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
