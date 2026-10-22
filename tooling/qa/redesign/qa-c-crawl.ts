/**
 * qa-c (phase 3 visual QA) crawler for demo-topup, demo-hotel, demo-events.
 *   cd tooling && pnpm exec tsx qa/redesign/qa-c-crawl.ts --site=topup|hotel|events [--only=home,games] [--w=1440,390]
 *        [--mode=normal|reduce|nogl] [--frames=8] [--tag=before] [--noshots] [--fps] [--links]
 * Per page: HTTP status, horizontal overflow (+ offenders), live canvases per viewport frame, scene statuses, console /
 * hydration errors, h1, tap targets < 44 px, broken / low-res images, heading line breaks inside a Thai word, simple AA
 * contrast on solid backgrounds. Screenshots: viewport frames → contact sheets
 *   screenshots/redesign-qa-c-<site>-<page>-<w>[-mode][-tag]-<n>.png   (operational pages: one full-page shot)
 * --mode=nogl launches Chromium without GPU flags and makes getContext("webgl*") return null (no-WebGL fallback pass).
 * --links prints every same-origin link found in the home header / footer (to check that every nav target is crawled).
 */
import "../../load-env";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, asc, customers, desc, eq, getAdminDb, isNotNull, rentalStays, tenants, ticketOrders, tickets } from "@rentweb/db";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const SITE = (arg("site") ?? "topup") as "topup" | "hotel" | "events";
const ONLY = new Set((arg("only") ?? "").split(",").filter(Boolean));
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const MODE = (arg("mode") ?? "normal") as "normal" | "reduce" | "nogl";
const MAX_FRAMES = Number(arg("frames") ?? 8);
const TAG = arg("tag") ? `-${arg("tag")}` : "";
const NOSHOTS = process.argv.includes("--noshots");
const FPS = process.argv.includes("--fps");
const LINKS = process.argv.includes("--links");
const OUT = path.resolve(process.cwd(), "screenshots");
const BASE = `http://demo-${SITE}.localhost:3000`;
const testPhone = () => `086${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

type Pg = { name: string; path: string; login?: boolean; full?: boolean; frames?: number };

function bkkToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

let loginPhone: string | null = null;

async function pagesFor(): Promise<Pg[]> {
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, `demo-${SITE}`)).limit(1);
  if (!t) throw new Error(`demo-${SITE} missing`);
  if (SITE === "topup") {
    let o: Record<string, { number: string; k: string }> | null = null;
    try {
      const j = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "qa/topup-journey-results.json"), "utf8"));
      o = j.orders;
      loginPhone = j.loginPhone ?? null;
    } catch {
      /* no journey run */
    }
    const k = (x?: { number: string; k: string }) => (x ? `/topup/${x.number}?k=${encodeURIComponent(x.k)}` : null);
    return [
      { name: "home", path: "/", frames: 14 },
      { name: "games", path: "/games" },
      { name: "games-voucher", path: "/games?cat=voucher" },
      { name: "games-empty", path: "/games?q=zzzz", frames: 2 },
      { name: "game", path: "/games/rov" },
      { name: "roblox", path: "/games/roblox" },
      { name: "status", path: "/topup/status", full: true },
      { name: "status-found", path: o ? `/topup/status?number=${o.apiOrder!.number}` : "", full: true },
      { name: "status-miss", path: "/topup/status?number=TP-999999", full: true },
      { name: "order-api", path: k(o?.apiOrder) ?? "", full: true },
      { name: "order-code", path: k(o?.stockOrder) ?? "", full: true },
      { name: "order-wallet", path: k(o?.walletOrder) ?? "", full: true },
      { name: "order-manual", path: k(o?.manualOrder) ?? "", full: true },
      { name: "order-public", path: o ? `/topup/${o.apiOrder!.number}` : "", full: true },
      { name: "how-to", path: "/how-to" },
      { name: "about", path: "/about" },
      { name: "contact", path: "/contact" },
      { name: "terms", path: "/terms", full: true },
      { name: "privacy", path: "/privacy", full: true },
      { name: "login", path: "/account/login", full: true },
      { name: "game-in", path: "/games/rov", login: true },
      { name: "steam-in", path: "/games/steam-wallet", login: true },
      { name: "wallet", path: "/wallet", login: true, full: true },
      { name: "account", path: "/account", login: true, full: true },
      { name: "account-topups", path: "/account/topups", login: true, full: true },
    ].filter((p) => p.path);
  }
  if (SITE === "hotel") {
    const stays = await db.select({ id: rentalStays.id, status: rentalStays.status, key: rentalStays.accessKey, phone: rentalStays.guestPhone }).from(rentalStays).where(eq(rentalStays.tenantId, t.id)).orderBy(asc(rentalStays.createdAt));
    const by = (s: string) => stays.find((x) => x.status === s);
    loginPhone = (by("confirmed")?.phone ?? "0813330001").replace(/^\+66/, "0").replace(/\D/g, "");
    const F = addDays(bkkToday(), 45);
    const T = addDays(F, 2);
    const list: Pg[] = [
      { name: "home", path: "/", frames: 16 },
      { name: "facilities", path: "/facilities" },
      { name: "location", path: "/location" },
      { name: "about", path: "/about" },
      { name: "contact", path: "/contact" },
      { name: "terms", path: "/terms", full: true },
      { name: "privacy", path: "/privacy", full: true },
      { name: "rooms", path: "/rooms", frames: 10 },
      { name: "rooms-q", path: `/rooms?from=${F}&to=${T}&guests=2`, frames: 3 },
      { name: "room", path: "/rooms/beachfront-pool-villa" },
      { name: "room-deluxe", path: "/rooms/deluxe-seaview" },
      { name: "room-q", path: `/rooms/family-villa?from=${F}&to=${T}&guests=4` },
      { name: "stay", path: "/stay", full: true },
      { name: "stay-results", path: `/stay?from=${F}&to=${T}&guests=2`, full: true },
      { name: "stay-none", path: `/stay?from=${F}&to=${T}&guests=12`, full: true },
      { name: "book", path: `/stay/book?type=deluxe-seaview&from=${F}&to=${T}&guests=2`, full: true },
      { name: "book-bad", path: `/stay/book?type=deluxe-seaview&from=${F}&to=${addDays(F, 40)}&guests=2`, full: true },
    ];
    for (const st of ["pending", "confirmed", "checked_in", "checked_out", "cancelled"]) {
      const s = by(st);
      if (s) list.push({ name: `stays-${st}`, path: `/stays/${s.id}?k=${encodeURIComponent(s.key)}`, full: true });
    }
    if (stays[0]) list.push({ name: "stays-denied", path: `/stays/${stays[0].id}`, full: true });
    list.push({ name: "account", path: "/account", login: true, full: true }, { name: "account-stays", path: "/account/stays", login: true, full: true }, { name: "account-stays-past", path: "/account/stays?scope=past", login: true, full: true });
    return list;
  }
  // events
  const rows = await db.select({ id: ticketOrders.id, status: ticketOrders.status, k: ticketOrders.accessKey, total: ticketOrders.total }).from(ticketOrders).where(eq(ticketOrders.tenantId, t.id)).orderBy(desc(ticketOrders.createdAt)).limit(200);
  const pick = (s: string, f?: (r: (typeof rows)[number]) => boolean) => rows.find((r) => r.status === s && (!f || f(r)));
  const paid = pick("paid");
  const [tk] = paid ? await db.select({ code: tickets.code }).from(tickets).where(and(eq(tickets.tenantId, t.id), eq(tickets.orderId, paid.id))).limit(1) : [];
  const [owner] = await db.select({ phone: customers.phone }).from(ticketOrders).innerJoin(customers, eq(customers.id, ticketOrders.customerId)).where(and(eq(ticketOrders.tenantId, t.id), isNotNull(ticketOrders.customerId), eq(ticketOrders.status, "paid"))).limit(1);
  loginPhone = owner?.phone ? owner.phone.replace(/^\+66/, "0").replace(/\D/g, "") : null;
  const k = (r?: { id: string; k: string }) => (r ? `/tickets/${r.id}?k=${encodeURIComponent(r.k)}` : "");
  return [
    { name: "home", path: "/", frames: 16 },
    { name: "venue", path: "/venue" },
    { name: "about", path: "/about" },
    { name: "contact", path: "/contact" },
    { name: "terms", path: "/terms", full: true },
    { name: "privacy", path: "/privacy", full: true },
    { name: "events", path: "/events" },
    { name: "events-past", path: "/events?scope=past" },
    { name: "events-music", path: `/events?category=${encodeURIComponent("ดนตรี")}`, frames: 3 },
    { name: "events-empty", path: "/events?q=zzzzqqq", frames: 2 },
    { name: "event", path: "/events/riverside-live", frames: 10 },
    { name: "event-talk", path: "/events/design-talk-2026" },
    { name: "event-run", path: "/events/khlong-san-night-run" },
    { name: "event-ws", path: "/events/leather-workshop" },
    { name: "event-past", path: "/events/maker-market-7" },
    { name: "order-paid", path: k(paid), full: true },
    { name: "order-pending", path: k(pick("pending", (r) => r.total > 0)), full: true },
    { name: "order-cancelled", path: k(pick("cancelled")), full: true },
    { name: "order-refunded", path: k(pick("refunded")), full: true },
    { name: "order-locked", path: paid ? `/tickets/${paid.id}` : "", full: true },
    { name: "ticket", path: tk?.code ? `/tickets/t/${tk.code}` : "", full: true },
    { name: "account", path: "/account", login: true, full: true },
    { name: "account-tickets", path: "/account/tickets", login: true, full: true },
    { name: "account-tickets-past", path: "/account/tickets?scope=past", login: true, full: true },
  ].filter((p) => p.path);
}

async function login(ctx: BrowserContext) {
  const p = await ctx.newPage();
  try {
    await stableGoto(p, `${BASE}/account/login?next=%2Faccount`, "load");
    await p.fill("#otp-target", loginPhone ?? testPhone());
    await p.locator('form button[type="submit"]').click();
    await p.locator("#otp-code").waitFor({ timeout: 60_000 });
    let code = "";
    for (let i = 0; i < 20 && !code; i++) {
      code = (await p.evaluate(() => document.body.innerText)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1] ?? "";
      if (!code) await p.waitForTimeout(500);
    }
    await p.fill("#otp-code", code);
    if (await p.locator("#otp-name").isVisible().catch(() => false)) await p.fill("#otp-name", "ทดสอบ ดีไซน์");
    await p.locator('form button[type="submit"]').click();
    await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60_000 });
  } finally {
    await p.close();
  }
}

/** in-page audit (runs after the page was scrolled through once so reveals have played). */
function audit(SHELL: boolean) {
  const vw = document.documentElement.clientWidth;
  const out: Record<string, unknown> = {};
  out.overflow = document.documentElement.scrollWidth - vw;
  const desc = (el: Element) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof (el as HTMLElement).className === "string" ? `.${(el as HTMLElement).className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}` : "";
    const txt = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 28);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? `"${txt}"` : ""}`;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && !el.closest('[aria-hidden="true"],[inert]');
  };
  // horizontal offenders
  if ((out.overflow as number) > 0) {
    const off: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0) {
        let clipped = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const o = getComputedStyle(a).overflowX;
          if (o !== "visible") {
            clipped = true;
            break;
          }
        }
        if (!clipped) off.push(`${desc(el)}→${Math.round(r.right - vw)}`);
      }
      if (off.length > 6) break;
    }
    out.offenders = off;
  }
  // tap targets
  const small: string[] = [];
  for (const el of Array.from(document.querySelectorAll('a[href],button,select,textarea,input:not([type=hidden]),[role=tab],[role=radio],[role=button],[role=checkbox],summary'))) {
    if (!visible(el)) continue;
    let target: Element = el;
    if (el.tagName === "INPUT" && /checkbox|radio/.test((el as HTMLInputElement).type)) target = el.closest("label") ?? el;
    const r = target.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (el.tagName === "A" && cs.display === "inline" && el.closest("p,dd,blockquote")) continue; // inline prose links
    if (!SHELL && el.closest("header,footer,.rw-chat,[data-shell]")) continue; // shared shell → reported once with --shell
    if (cs.opacity === "0" || (el as HTMLInputElement).type === "file") continue;
    if (r.width < 44 - 0.5 || r.height < 44 - 0.5) small.push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  out.small = [...new Set(small)];
  // images
  const broken: string[] = [];
  const lowres: string[] = [];
  for (const img of Array.from(document.images)) {
    if (!visible(img)) continue;
    const r = img.getBoundingClientRect();
    if (img.complete && img.naturalWidth === 0) broken.push(img.currentSrc || img.src);
    else if (img.complete && img.naturalWidth > 0) {
      const fit = getComputedStyle(img).objectFit;
      const sx = img.naturalWidth / r.width;
      const sy = img.naturalHeight / r.height;
      const scale = fit === "cover" ? Math.max(Math.min(sx, sy), 0) : Math.min(sx, sy);
      if (scale < 0.8 && r.width > 120) lowres.push(`${(img.alt || img.currentSrc).slice(0, 40)} ${img.naturalWidth}px@${Math.round(r.width)}`);
    }
  }
  out.broken = broken;
  out.lowres = lowres;
  // line breaks inside Thai text nodes (every visible text node, not only headings): the char offsets where a new line
  // starts go back to Node, which checks them against Node's ICU word boundaries (the browser line breaker splits words
  // its own dictionary lacks, e.g. "ที|มงาน", and the in-page segmenter shares that dictionary).
  const clipped: string[] = [];
  for (const h of Array.from(document.querySelectorAll("h1,h2,h3"))) {
    const he = h as HTMLElement;
    if (visible(h) && he.scrollWidth > he.clientWidth + 2 && getComputedStyle(he).overflowX !== "visible") clipped.push(desc(h));
  }
  const thaiBreaks: Array<{ ctx: string; text: string; at: number[] }> = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const pe = n.parentElement;
      if (!pe || !/[฀-๿]/.test((n as Text).data) || (n as Text).data.trim().length < 4) return NodeFilter.FILTER_REJECT;
      if (pe.closest('script,style,noscript,.sr-only,[aria-hidden="true"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let budget = 30000;
  for (let n = tw.nextNode() as Text | null; n && budget > 0; n = tw.nextNode() as Text | null) {
    if (!visible(n.parentElement!)) continue;
    const s = n.data;
    budget -= s.length;
    const at: number[] = [];
    let prevTop: number | null = null;
    let prevH = 0;
    for (let i = 0; i < s.length; i++) {
      if (/[ัิ-ฺ็-๎\s⁠​]/.test(s[i]!)) continue;
      const rg = document.createRange();
      rg.setStart(n, i);
      rg.setEnd(n, i + 1);
      const rc = rg.getClientRects()[0];
      if (!rc || rc.width === 0) continue;
      if (prevTop !== null && rc.top > prevTop + prevH * 0.6) at.push(i);
      prevTop = rc.top;
      prevH = rc.height;
    }
    if (at.length) thaiBreaks.push({ ctx: desc(n.parentElement!), text: s, at });
  }
  out.thaiBreaks = thaiBreaks;
  out.clipped = clipped;
  // contrast on solid backgrounds
  const parse = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0]!, g: p[1]!, b: p[2]!, a: p[3] ?? 1 };
  };
  const lum = (c: { r: number; g: number; b: number }) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const lowc: string[] = [];
  const seen = new Set<Element>();
  for (const el of Array.from(document.querySelectorAll("p,span,a,button,h1,h2,h3,h4,li,label,small,dt,dd,td,th,strong,em,div"))) {
    if (seen.size > 2500) break;
    const direct = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1);
    if (!direct || !visible(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    let fg = parse(cs.color);
    if (!fg || fg.a < 0.15) continue;
    if (!SHELL && el.closest("header,footer,.rw-chat,[data-shell]")) continue;
    let op = 1;
    let bg: { r: number; g: number; b: number; a: number } | null = null;
    let unknown = false;
    for (let a: Element | null = el; a; a = a.parentElement) {
      const as = getComputedStyle(a);
      op *= Number(as.opacity);
      if (as.backgroundImage !== "none" || as.backdropFilter !== "none" || (as.filter !== "none" && a !== el) || as.mixBlendMode !== "normal") {
        unknown = true;
        break;
      }
      const b = parse(as.backgroundColor);
      if (b && b.a > 0.92) {
        bg = b;
        break;
      }
      if (b && b.a > 0.05) {
        unknown = true;
        break;
      }
    }
    if (unknown || !bg || op < 0.98) continue;
    // clipped away by an overflow container (roll / mask-reveal duplicates) → not visible text
    const er = el.getBoundingClientRect();
    let hidden = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflow === "visible") continue;
      const ar = a.getBoundingClientRect();
      const ix = Math.max(0, Math.min(er.right, ar.right) - Math.max(er.left, ar.left));
      const iy = Math.max(0, Math.min(er.bottom, ar.bottom) - Math.max(er.top, ar.top));
      if (ix * iy < er.width * er.height * 0.5) {
        hidden = true;
        break;
      }
    }
    if (hidden) continue;
    if (fg.a < 1) fg = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
    const L1 = lum(fg);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.6 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) lowc.push(`${desc(el)} ${ratio.toFixed(2)}`);
  }
  out.lowcontrast = [...new Set(lowc)].slice(0, 12);
  out.h1 = Array.from(document.querySelectorAll("h1")).map((h) => (h.getAttribute("aria-label") ?? h.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60));
  out.scenes = Array.from(document.querySelectorAll("[data-scene-status]")).map((e) => e.getAttribute("data-scene-status"));
  return out;
}

async function scrollThrough(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 450) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "instant" as ScrollBehavior }), y);
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(600);
}

async function sheets(browser: Browser, files: string[], base: string, mobile: boolean, caps: string[]) {
  const cols = mobile ? 5 : 2;
  const per = mobile ? 10 : 6;
  const outs: string[] = [];
  for (let s = 0; s * per < files.length; s++) {
    const chunk = files.slice(s * per, s * per + per);
    const cells = chunk.map((f, i) => `<figure><img src="${pathToFileURL(f).href}"><figcaption>${caps[s * per + i]}</figcaption></figure>`).join("");
    const html = `<!doctype html><html><body style="margin:0;background:#151515;color:#bbb;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${cells}</div><style>figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 0}</style></body></html>`;
    const tmp = path.join(OUT, `.qac-sheet-${Date.now()}.html`);
    fs.writeFileSync(tmp, html);
    const sp = await browser.newPage({ viewport: { width: mobile ? 1980 : 1800, height: 900 } });
    await sp.goto(pathToFileURL(tmp).href);
    await sp.waitForLoadState("load");
    const out = `${base}-${s + 1}.png`;
    await sp.screenshot({ path: out, fullPage: true });
    await sp.close();
    fs.unlinkSync(tmp);
    outs.push(out);
  }
  for (const f of files) fs.unlinkSync(f);
  return outs;
}

async function fps(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const w = window as unknown as { __f: number[]; __run: boolean };
    w.__f = [];
    w.__run = true;
    let last = performance.now();
    const tick = (t: number) => {
      w.__f.push(t - last);
      last = t;
      if (w.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const vh = page.viewportSize()!.height;
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    await page.mouse.wheel(0, vh * 0.12);
    await page.waitForTimeout(40);
  }
  const f = await page.evaluate(() => {
    const w = window as unknown as { __f: number[]; __run: boolean };
    w.__run = false;
    return w.__f.slice(2);
  });
  const total = f.reduce((a, b) => a + b, 0);
  const sorted = [...f].sort((a, b) => a - b);
  return { fps: Math.round((f.length / total) * 1000), p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), long: f.filter((x) => x > 50).length, frames: f.length };
}

const pages = (await pagesFor()).filter((p) => !ONLY.size || ONLY.has(p.name));
const browser = await chromium.launch({ args: MODE === "nogl" ? [] : ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const report: string[] = [];
const log = (x: string) => {
  report.push(x);
  console.log(x);
};
for (const w of WIDTHS) {
  const mobile = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: MODE === "reduce" ? "reduce" : "no-preference" });
  await isolateHmr(ctx);
  // tsx (esbuild keepNames) wraps nested functions in __name(); page.evaluate(audit) needs the helper in the page
  await ctx.addInitScript({ content: "window.__name = (f) => f;" });
  if (MODE === "nogl") {
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error patched for the no-WebGL pass
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        // @ts-expect-error passthrough
        return orig.call(this, type, ...rest);
      };
    });
  }
  let loggedIn = false;
  for (const pg of [...pages.filter((p) => !p.login), ...pages.filter((p) => p.login)]) {
    if (pg.login && !loggedIn) {
      await login(ctx).catch((e) => log(`login failed: ${(e as Error).message.split("\n")[0]}`));
      loggedIn = true;
    }
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(m.text().slice(0, 220));
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 220)}`));
    const name = `${pg.name}-${w}${MODE !== "normal" ? `-${MODE}` : ""}${TAG}`;
    try {
      const res = await stableGoto(page, `${BASE}${pg.path}`, "load");
      await page.waitForTimeout(pg.name === "home" ? 4000 : 2200);
      if (LINKS && pg.name === "home") {
        const links = await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll("header a[href], footer a[href], nav a[href]")).map((a) => a.getAttribute("href")!).filter((h) => h.startsWith("/")))]);
        log(`links(${w}): ${links.join(" ")}`);
      }
      const vh = page.viewportSize()!.height;
      const files: string[] = [];
      const caps: string[] = [];
      let maxCanvas = 0;
      const liveCanvases = () => page.evaluate(() => Array.from(document.querySelectorAll("canvas")).filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && getComputedStyle(c).display !== "none"; }).length).catch(() => -1);
      if (!NOSHOTS && !pg.full) {
        const nmax = pg.frames ?? MAX_FRAMES;
        for (let i = 0; i < nmax; i++) {
          const f = path.join(OUT, `.qac-${name}-f${String(i).padStart(2, "0")}.png`);
          await page.waitForTimeout(i === 0 ? 200 : 1000);
          await page.screenshot({ path: f });
          const c = await liveCanvases();
          maxCanvas = Math.max(maxCanvas, c);
          files.push(f);
          caps.push(`${pg.name} ${w} f${i} · canvas ${c}`);
          const before = await page.evaluate(() => window.scrollY);
          for (let s = 0; s < 4; s++) {
            await page.mouse.wheel(0, Math.round((vh * 0.85) / 4));
            await page.waitForTimeout(60);
          }
          await page.waitForTimeout(350);
          let after = await page.evaluate(() => window.scrollY);
          if (after < before + vh * 0.5) {
            await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), before + vh * 0.85);
            await page.waitForTimeout(200);
            after = await page.evaluate(() => window.scrollY);
          }
          if (after <= before + 4) break;
        }
      } else {
        maxCanvas = await liveCanvases();
      }
      await scrollThrough(page);
      const info = (await page.evaluate(audit, process.argv.includes("--shell"))) as Record<string, unknown>;
      // Node-side check of the browser's Thai line breaks against Node ICU word boundaries
      const segN = new Intl.Segmenter("th", { granularity: "word" });
      const midword: string[] = [];
      for (const b of (info.thaiBreaks as Array<{ ctx: string; text: string; at: number[] }>) ?? []) {
        const bounds = new Set<number>([0, b.text.length]);
        for (const x of segN.segment(b.text)) bounds.add(x.index);
        for (const i of b.at) {
          let j = i - 1;
          while (j >= 0 && /[⁠​]/.test(b.text[j]!)) j--;
          if (j >= 0 && /\s/.test(b.text[j]!)) continue;
          if (!bounds.has(i) && /[฀-๿]/.test(b.text[i]!) && /[฀-๿]/.test(b.text[j] ?? "")) midword.push(`${b.ctx} |${b.text.slice(Math.max(0, i - 8), i)}⏎${b.text.slice(i, i + 8)}|`);
        }
      }
      info.midword = [...new Set(midword)];
      let fpsInfo = "";
      if (FPS && pg.name === "home") fpsInfo = ` fps=${JSON.stringify(await fps(page))}`;
      let shots: string[] = [];
      if (!NOSHOTS) {
        if (pg.full) {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
          await page.waitForTimeout(700);
          const f = path.join(OUT, `redesign-qa-c-${SITE}-${name}.png`);
          await page.screenshot({ path: f, fullPage: true });
          shots = [f];
        } else shots = await sheets(browser, files, path.join(OUT, `redesign-qa-c-${SITE}-${name}`), mobile, caps);
      }
      const L = (k: string) => {
        const v = info[k] as unknown[] | undefined;
        return v && v.length ? `\n    ${k}(${v.length}): ${v.slice(0, 8).join(" ; ")}` : "";
      };
      log(
        `${name}: HTTP ${res?.status()} overflow=${info.overflow}px canvasMax=${maxCanvas} scenes=[${(info.scenes as string[]).join(",")}] h1=${JSON.stringify(info.h1)} errors=${errors.length}${fpsInfo}${errors.length ? `\n    errors: ${[...new Set(errors)].slice(0, 4).join("\n    ")}` : ""}${L("offenders")}${L("small")}${L("broken")}${L("lowres")}${L("midword")}${L("clipped")}${L("lowcontrast")}${shots.length ? `\n    shots: ${shots.map((s) => path.basename(s)).join(" ")}` : ""}`,
      );
    } catch (e) {
      log(`${name}: CRASH ${(e as Error).message.split("\n")[0]}`);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
process.exit(0);
