import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PRESETS, resolveTheme, themeToCss } from "@rentweb/core/theme";
import type { TenantConfig } from "@rentweb/core/tenant";
import { translator } from "@rentweb/i18n";
import { RenderSections, type StorefrontCtx } from "@rentweb/storefront";
import type { SectionJson } from "@rentweb/db";
import { fontClassNames } from "@/fonts";
import { LabHtmlAttrs } from "./lab-attrs";

/**
 * Dev-only review page for every storefront section type × variant (sections agent, docs/design §7), rendered with a
 * real resolved tenant theme. Query: ?preset=aurora|neon|… &type=hero,gallery &fx=auto|calm|off &mode=light|dark
 */
export const metadata: Metadata = { title: "Sections lab", robots: { index: false, follow: false } };

const u = (id: string, w = 1200) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=75`;
const av = (seed: string) => `https://i.pravatar.cc/160?u=${encodeURIComponent(seed)}`;
const IMG = {
  rack: "1445205170230-053b83016050",
  serum: "1617897903246-719242758050",
  mask: "1616394584738-fc6e612e71b9",
  stones: "1600334129128-685c5582fd35",
  donuts: "1551024601-bec78aea704b",
  cookies: "1558961363-fa8fdf82db35",
  concert: "1501281668745-f7f57925c3b4",
  retro: "1550745165-9bc0b252726f",
  skincare: "1612817288484-6f916006741a",
  dining: "1517248135467-4c7edcad34c4",
  food: "1414235077428-338989a2e8c0",
  gaming: "1542751371-adc38448a05e",
  office: "1497366216548-37526070297c",
  coffee: "1495474472287-4d71bcdd2085",
  room: "1631049307264-da0ec9d70304",
  yoga: "1544161515-4ab6ce6db874",
};
const PHOTOS = Object.values(IMG);
const img = (i: number, w = 1200) => u(PHOTOS[i % PHOTOS.length]!, w);

const ITEMS6 = [
  { icon: "Sparkles", title: "ออกแบบเฉพาะธุรกิจคุณ", description: "ทุกหน้าปรับสี ฟอนต์ และโลโก้ได้เอง โดยไม่ต้องเขียนโค้ด", image: img(0) },
  { icon: "ShoppingBag", title: "ขายของออนไลน์ครบวงจร", description: "ตะกร้า ชำระเงิน พร้อมเพย์ และแนบสลิปในที่เดียว", image: img(1) },
  { icon: "CalendarCheck", title: "จองคิวอัตโนมัติ", description: "ลูกค้าเลือกวันเวลาเอง ยืนยันทันที แจ้งเตือนผ่าน LINE", image: img(2) },
  { icon: "QrCode", title: "สแกนสั่งที่โต๊ะ", description: "เมนูภาพสวย สั่งผ่าน QR ไม่ต้องเรียกพนักงาน" },
  { icon: "ShieldCheck", title: "ปลอดภัยทุกธุรกรรม", description: "เข้ารหัสทุกหน้า ตรวจสลิปอัตโนมัติ" },
  { icon: "Rocket", title: "เปิดร้านได้ใน 5 นาที", description: "เลือกเทมเพลต ใส่ข้อมูล แล้วเผยแพร่ได้เลย" },
];
const QUOTES = [
  { quote: "เว็บสวยระดับแบรนด์ใหญ่ ลูกค้าทักมาถามว่าจ้างเอเจนซีที่ไหน ยอดจองเพิ่มขึ้นเกือบเท่าตัวในเดือนแรก", name: "คุณมะลิ", role: "เจ้าของสปา", avatar: av("mali"), rating: 5 },
  { quote: "ตั้งร้านเสร็จในบ่ายเดียว ระบบสลิปช่วยประหยัดเวลาไปเยอะมาก", name: "Somchai P.", role: "ร้านเสื้อผ้า", avatar: av("som"), rating: 5 },
  { quote: "ลูกค้าชอบเมนูภาพสวย สั่งผ่าน QR แล้วครัวได้ออเดอร์ทันที", name: "คุณต้น", role: "ร้านอาหาร", avatar: av("ton"), rating: 4 },
  { quote: "หน้าเว็บโหลดเร็ว เปิดบนมือถือแล้วลื่นมาก", name: "Ploy", role: "คาเฟ่", avatar: av("ploy"), rating: 5 },
];
const STEPS = [
  { title: "เลือกเทมเพลต", description: "10 สไตล์สำหรับ 10 ธุรกิจ", icon: "LayoutTemplate" },
  { title: "ใส่ข้อมูลร้าน", description: "โลโก้ สี สินค้า และบริการ" },
  { title: "เชื่อมการชำระเงิน", description: "พร้อมเพย์ บัตร หรือโอนแนบสลิป" },
  { title: "เผยแพร่", description: "ได้โดเมนพร้อม SSL ทันที" },
];
const PROJECTS = [
  { title: "Siam Atelier", category: "แฟชั่น / ร้านค้า", year: "2026", image: img(0, 900), summary: "ร้านผ้าทอมือแบบนิตยสาร", href: "#" },
  { title: "Lumière Clinic", category: "คลินิกความงาม", year: "2026", image: img(10, 900), summary: "จองคิวแพทย์และคอร์ส", href: "#" },
  { title: "บ้านริม", category: "ร้านอาหารไทย", year: "2025", image: img(10 + 2, 900), summary: "QR สั่งที่โต๊ะ + จองโต๊ะ", href: "#" },
  { title: "Maker Yard Bangkok", category: "อีเวนต์ / ตั๋ว", year: "2025", image: img(6, 900), summary: "ขายบัตรพร้อม QR เข้างาน", href: "#" },
];

type Sample = { label: string; type: string; props: Record<string, unknown> };

function samples(): Sample[] {
  const heroBase = {
    eyebrow: "คอลเลกชันฤดูฝน 2026",
    heading: "สวมใส่ความเรียบง่าย\nที่ไม่ธรรมดา",
    subheading: "ผ้าฝ้ายทอมือจากช่างฝีมือเชียงใหม่ ตัดเย็บทีละชิ้น ผลิตจำนวนจำกัด",
    primaryCta: { label: "ช้อปคอลเลกชันใหม่", href: "#" },
    secondaryCta: { label: "เรื่องราวของเรา", href: "#" },
    image: { url: img(0, 1400), alt: "ราวเสื้อผ้า" },
    imageSecondary: { url: img(1, 600), alt: "เซรั่ม" },
    badges: ["ส่งฟรีเมื่อครบ ฿990", "เปลี่ยนคืนได้ 7 วัน", "ผลิตในไทย"],
    stats: [
      { value: "12,000+", label: "ลูกค้าที่รัก" },
      { value: "4.9/5", label: "คะแนนรีวิว" },
      { value: "48 ชม.", label: "จัดส่งทั่วไทย" },
    ],
    cornerLabels: ["Monsoon ’26", "Bangkok — Chiang Mai"],
    cards: [0, 1, 2, 4, 5, 6, 8, 12].map((i, k) => ({ image: img(i, 500), alt: "ภาพ", title: ["Siam Atelier", "Lumière", "Sugar Puff", "Maker Yard", "GameHub", "สบาย สบาย", "บ้านทะเล", "บ้านริม"][k], tag: ["ร้านค้า", "คลินิก", "คาเฟ่", "อีเวนต์", "เกม", "สปา", "โรงแรม", "อาหาร"][k] })),
  };
  const gallery = PHOTOS.slice(0, 9).map((id, i) => ({ url: u(id, 1000), alt: `ภาพที่ ${i + 1}`, caption: ["บรรยากาศร้าน", "เมนูซิกเนเจอร์", "มุมพักผ่อน", "งานคืนวันศุกร์", "สตูดิโอ", "ห้องทรีตเมนต์", "คาเฟ่ยามเช้า", "เวิร์กช็อป", "ริมทะเล"][i] }));
  const out: Sample[] = [];
  for (const v of ["split", "centered", "fullscreen", "editorial", "stacked", "scatter", "cinematic"]) out.push({ label: `hero · ${v}`, type: "hero", props: { ...heroBase, variant: v, clock: v === "cinematic" || v === "editorial" } });
  for (const v of ["cards", "list", "bento", "icons", "sticky"])
    out.push({ label: `features · ${v}`, type: "features", props: { eyebrow: "ทำไมต้องเรา", heading: "ทุกอย่างที่ร้านคุณต้องใช้ ในเว็บเดียว", subheading: "ออกแบบมาเพื่อธุรกิจไทย ใช้ง่ายตั้งแต่วันแรก", variant: v, columns: 3, items: v === "icons" ? ITEMS6.slice(0, 4) : ITEMS6 } });
  out.push({ label: "text · normal", type: "text", props: { eyebrow: "เรื่องของเรา", heading: "เริ่มจากโต๊ะไม้ตัวเดียว\nในห้องแถวเก่า", body: "เราเชื่อว่าร้านเล็ก ๆ ก็ควรมีเว็บไซต์ที่สวยระดับเดียวกับแบรนด์ใหญ่\n\nทุกเทมเพลตจึงออกแบบโดยนักออกแบบมืออาชีพ ปรับได้ทุกสี ทุกฟอนต์ และยังเร็วบนมือถือ" } });
  out.push({ label: "text · large (scrub)", type: "text", props: { eyebrow: "แนวคิด", body: "เว็บไซต์ที่ดีไม่ใช่แค่สวย แต่ทุกการเลื่อนคือจังหวะ ทุกภาพคือฉาก และทุกปุ่มตอบสนองทันทีที่ลูกค้าแตะ", size: "large" } });
  for (const s of ["plain", "card", "overlap", "pinned"])
    out.push({ label: `image-text · ${s}`, type: "image-text", props: { eyebrow: "งานฝีมือ", heading: "ทุกชิ้นมีเรื่องราวของมือที่ทอมัน", body: "เราทำงานร่วมกับช่างทอผ้า 14 ครอบครัวในจังหวัดเชียงใหม่ ใช้ฝ้ายออร์แกนิกและสีย้อมธรรมชาติ", image: { url: img(2, 1400), alt: "ช่างทอผ้า" }, imagePosition: s === "card" ? "right" : "left", bullets: ["ฝ้ายออร์แกนิก 100%", "ย้อมสีธรรมชาติ", "ค่าแรงที่เป็นธรรม"], cta: { label: "อ่านเรื่องราวทั้งหมด", href: "#" }, style: s } });
  for (const l of ["grid", "masonry", "carousel", "filmstrip", "curved", "polaroid"]) out.push({ label: `gallery · ${l}`, type: "gallery", props: { heading: "บรรยากาศที่ร้าน", subheading: "แวะมานั่งเล่น ชิมขนม และถ่ายรูปมุมโปรด", layout: l, columns: 3, images: gallery } });
  for (const v of ["cards", "marquee", "spotlight", "chat"]) out.push({ label: `testimonials · ${v}`, type: "testimonials", props: { eyebrow: "รีวิว", heading: "เสียงจากลูกค้าจริง", variant: v, items: QUOTES } });
  for (const l of ["single", "two-column"]) out.push({ label: `faq · ${l}`, type: "faq", props: { eyebrow: "ช่วยเหลือ", heading: "คำถามที่พบบ่อย", subheading: "ไม่เจอคำตอบ ทักไลน์ได้ทุกวัน", layout: l, items: [{ q: "ใช้เวลาจัดส่งกี่วัน?", a: "กรุงเทพฯ 1–2 วัน ต่างจังหวัด 2–3 วันทำการ" }, { q: "เปลี่ยนไซซ์ได้ไหม?", a: "เปลี่ยนได้ภายใน 7 วัน สินค้าต้องอยู่ในสภาพเดิม" }, { q: "มีหน้าร้านไหม?", a: "มีที่นิมมานเหมินท์ ซอย 7 เปิดทุกวัน 10:00–20:00" }] } });
  for (const v of ["banner", "card", "split", "glow", "wordmark"]) out.push({ label: `cta · ${v}`, type: "cta", props: { heading: v === "wordmark" ? "มาคุยกันเถอะ" : "พร้อมเปิดร้านออนไลน์แล้วหรือยัง?", body: "ทดลองใช้ฟรี 14 วัน ไม่ต้องใช้บัตรเครดิต", primaryCta: { label: "เริ่มฟรีวันนี้", href: "#" }, secondaryCta: { label: "ดูตัวอย่าง", href: "#" }, variant: v, image: { url: img(8, 1200), alt: "คาเฟ่" } } });
  for (const v of ["classic", "chips"]) out.push({ label: `contact · ${v}`, type: "contact", props: { heading: "ติดต่อเรา", body: "ตอบกลับภายใน 1 วันทำการ", variant: v, interests: ["เว็บไซต์", "แอปมือถือ", "ระบบหลังบ้าน", "Data / Dashboard", "UX/UI"], budgets: ["< ฿300k", "฿300k–1M", "฿1M–3M", "฿3M+"], phone: "02-123-4567", email: "hello@example.com", lineId: "@rentweb", address: "99/9 ถนนสุขุมวิท กรุงเทพฯ 10110", showMap: false } });
  for (const v of ["row", "cards", "big"]) out.push({ label: `stats · ${v}`, type: "stats", props: { heading: v === "row" ? "" : "ตัวเลขที่เราภูมิใจ", variant: v, items: [{ value: 1250000, suffix: "+", label: "ออเดอร์ที่ผ่านระบบ" }, { value: 129, suffix: "+", label: "ร้านค้าที่เปิดใช้งาน" }, { value: 98, suffix: "%", label: "ลูกค้ากลับมาใช้ซ้ำ" }, { value: 24, suffix: " ชม.", label: "ทีมดูแลตลอดวัน" }] } });
  for (const m of [true, false]) out.push({ label: `logos · marquee=${m}`, type: "logos", props: { heading: "องค์กรที่ไว้วางใจเรา", marquee: m, names: ["Siam Retail Group", "Krungthep Health", "Chao Phraya Logistics", "Lanna Foods", "Andaman Resorts", "Isan Agritech"] } });
  for (const s of ["text", "outline", "badges", "giant"]) out.push({ label: `marquee · ${s}`, type: "marquee", props: { items: ["ส่งฟรีทั่วไทย", "ผลิตจำนวนจำกัด", "เปลี่ยนคืนได้ 7 วัน", "ของแท้จากช่างเชียงใหม่"], style: s, speed: 30 } });
  out.push({ label: "pricing", type: "pricing", props: { eyebrow: "ราคา", heading: "แพ็กเกจที่โตไปกับธุรกิจ", subheading: "เปลี่ยนแพ็กเกจได้ทุกเมื่อ", plans: [{ name: "เริ่มต้น", price: "฿299", period: "เดือน", description: "สำหรับร้านเล็ก", features: ["1 เว็บไซต์", "สินค้า 50 รายการ", "พร้อมเพย์"], cta: { label: "เลือกแพ็กเกจ", href: "#" } }, { name: "มืออาชีพ", price: "฿699", period: "เดือน", description: "ยอดนิยม", features: ["โดเมนของคุณ", "สินค้าไม่จำกัด", "จองคิว + LINE"], cta: { label: "เลือกแพ็กเกจ", href: "#" }, highlighted: true, badge: "ขายดี" }, { name: "ธุรกิจ", price: "฿15,000", period: "ปี", description: "หลายสาขา", features: ["ทีมงาน 10 คน", "รายงานขั้นสูง", "ซัพพอร์ตด่วน"], cta: { label: "ติดต่อฝ่ายขาย", href: "#" } }] } });
  for (const v of ["grid", "cards", "large", "list"]) out.push({ label: `team · ${v}`, type: "team", props: { eyebrow: "ทีม", heading: "คนที่จะดูแลคุณ", variant: v, members: ["อรุณ", "พิมพ์", "ธนา", "ณิชา", "กานต์"].map((n, i) => ({ name: n, role: ["ผู้ก่อตั้ง", "ดีไซเนอร์", "นักพัฒนา", "ฝ่ายลูกค้า", "การตลาด"][i], avatar: `https://i.pravatar.cc/600?img=${i + 11}`, bio: "ประสบการณ์กว่า 10 ปีในการสร้างแบรนด์ให้ธุรกิจไทย", href: i % 2 ? "#" : undefined })) } });
  out.push({ label: "video", type: "video", props: { heading: "เบื้องหลังการทอผ้า", url: "https://www.youtube.com/watch?v=ScMzIvxBSi4", aspect: "16/9" } });
  for (const v of ["horizontal", "vertical", "cards", "numbered", "tunnel"]) out.push({ label: `steps · ${v}`, type: "steps", props: { eyebrow: "วิธีเริ่ม", heading: "เปิดร้านออนไลน์ใน 4 ขั้นตอน", variant: v, items: STEPS } });
  out.push({ label: "spacer · divider", type: "spacer", props: { size: "lg", divider: true } });
  for (const sc of [false, true]) out.push({ label: `announcement · scroll=${sc}`, type: "announcement", props: { text: "🎉 โปรโมชันพิเศษ ส่งฟรีเมื่อสั่งครบ 500 บาท", cta: { label: "ช้อปเลย", href: "#" }, scroll: sc } });
  out.push({ label: "curved-gallery", type: "curved-gallery", props: { bigTitle: "WORKS", bigTitleSuffix: "©19—26", heading: "ผลงานที่เราภูมิใจ", items: PROJECTS.concat(PROJECTS).map((p, i) => ({ image: img(i, 1024), title: p.title, subtitle: `${p.category} · ${p.year}`, tag: String(i + 1).padStart(2, "0"), href: "#" })), cta: { label: "ดูผลงานทั้งหมด", href: "#" } } });
  for (const m of ["card", "arch", "full", "device", "plate"]) out.push({ label: `sticky-story · ${m}`, type: "sticky-story", props: { eyebrow: "กว่าจะเป็นเสื้อหนึ่งตัว", heading: "จากเส้นด้าย ถึงตู้เสื้อผ้าของคุณ", mediaStyle: m, items: ["ปลูกฝ้าย", "ย้อมคราม", "ทอมือ", "ตัดเย็บ"].map((t, i) => ({ title: t, kicker: `0${i + 1} · ขั้นตอน`, body: "ทุกขั้นตอนทำด้วยมือโดยช่างในชุมชน ใช้เวลาหลายสัปดาห์ต่อหนึ่งผืน", image: img(i * 3, 1100), chips: ["ออร์แกนิก", "ทำมือ"] })) } });
  out.push({ label: "tunnel", type: "tunnel", props: { eyebrow: "กระบวนการ", heading: "โปร่งใสทุกสัปดาห์", steps: STEPS.map((s) => ({ title: s.title, body: s.description })) } });
  for (const st of ["solid", "outline", "gradient"]) out.push({ label: `giant-wordmark · ${st}`, type: "giant-wordmark", props: { text: "NORTHSTAR", style: st, effect: "rise", caption: "Software & Design Studio — Bangkok" } });
  for (const c of ["poster", "editorial", "numbered"]) out.push({ label: `horizontal-scroll · ${c}`, type: "horizontal-scroll", props: { eyebrow: "คลาสเรียน", heading: "เลือกคลาสที่ใช่", cardStyle: c, ratio: c === "editorial" ? "16/10" : "4/5", items: ["Hatha", "Vinyasa", "Yin", "Pilates", "Sound Bath", "Breathwork"].map((t, i) => ({ image: img(i + 2, 1100), title: t, body: "60 นาที · ทุกระดับ", tag: "ใหม่", href: i % 2 ? "#" : undefined })) } });
  for (const l of ["list-hover", "grid-staggered"]) out.push({ label: `project-list · ${l}`, type: "project-list", props: { bigTitle: "WORKS", heading: "ผลงานล่าสุด", layout: l, items: PROJECTS } });
  for (const sc of ["shader", "particle-morph", "breathing-orb"]) out.push({ label: `interlude · ${sc}`, type: "interlude", props: { scene: sc, heading: "หายใจเข้า แล้วค่อย ๆ ปล่อย", body: "ช่วงเวลาเล็ก ๆ ระหว่างวัน", words: sc === "particle-morph" ? ["RentWeb"] : [], cta: { label: "จองคลาส", href: "#" } } });
  return out;
}

export default async function SectionsLab({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  const presetKey = q.preset && PRESETS[q.preset] ? q.preset : "aurora";
  const theme = resolveTheme({ preset: presetKey, ...(q.mode === "dark" || q.mode === "light" ? { mode: q.mode } : {}) });
  const css = themeToCss(theme);
  const types = new Set((q.type ?? "").split(",").filter(Boolean));
  const fx = q.fx === "calm" || q.fx === "off" ? q.fx : undefined;
  const list = samples().filter((s) => !types.size || types.has(s.type));

  const tenant = {
    id: "lab",
    slug: "lab",
    name: "Siam Atelier",
    status: "active",
    planKey: "pro",
    siteType: "shop",
    locale: "th",
    timezone: "Asia/Bangkok",
    currency: "THB",
    settings: { contact: { phone: "02-123-4567", email: "hello@example.com", lineId: "@rentweb", hours: [{ day: "จันทร์–ศุกร์", time: "10:00–20:00" }, { day: "เสาร์–อาทิตย์", time: "10:00–22:00" }] } },
    modules: [],
    moduleConfig: {},
    themeRaw: {},
  } as unknown as TenantConfig;
  const ctx: StorefrontCtx = { tenant, theme, locale: "th", t: translator("th"), origin: "http://localhost:3000", customer: null, cartCount: 0 };
  const dark = theme.mode === "dark";

  return (
    <div className={`${fontClassNames} ${css.htmlClass} min-h-dvh bg-background text-foreground`} {...css.dataAttrs}>
      <style>{css.styleTag}</style>
      <LabHtmlAttrs attrs={css.dataAttrs} dark={dark} />
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 px-[var(--gutter)] py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <strong className="font-mono text-xs tracking-[0.08em] uppercase">Sections lab</strong>
          <span className="text-muted-foreground">{list.length} samples</span>
          <nav aria-label="preset" className="flex flex-wrap gap-1.5">
            {Object.values(PRESETS).map((p) => (
              <Link key={p.key} href={`?preset=${p.key}${q.type ? `&type=${q.type}` : ""}${fx ? `&fx=${fx}` : ""}`} className={`rounded-full border px-2.5 py-1 text-xs ${p.key === presetKey ? "border-foreground bg-foreground text-background" : "border-border"}`}>
                {p.key}
              </Link>
            ))}
          </nav>
          <nav aria-label="fx" className="flex gap-1.5">
            {["auto", "calm", "off"].map((f) => (
              <Link key={f} href={`?preset=${presetKey}${q.type ? `&type=${q.type}` : ""}${f === "auto" ? "" : `&fx=${f}`}`} className={`rounded-full border px-2.5 py-1 font-mono text-xs ${(fx ?? "auto") === f ? "border-primary text-primary" : "border-border"}`}>
                fx:{f}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="overflow-x-clip">
        {list.map((s, i) => {
          const section: SectionJson = { id: `lab-${i}`, type: s.type, props: fx ? { ...s.props, fx } : s.props } as SectionJson;
          return (
            <div key={i} id={`s-${i}`} data-lab-sample={s.label}>
              <div className="flex items-center gap-3 border-y border-dashed border-border bg-muted/60 px-[var(--gutter)] py-1.5 font-mono text-[11px] text-muted-foreground">
                <a href={`?preset=${presetKey}&type=${s.type}${fx ? `&fx=${fx}` : ""}`} className="underline-offset-2 hover:underline">
                  {String(i + 1).padStart(2, "0")} · {s.label}
                </a>
              </div>
              <RenderSections sections={[section]} ctx={{ ...ctx }} />
            </div>
          );
        })}
      </main>
    </div>
  );
}
