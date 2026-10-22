import type { TemplateDefinition, TemplatePage } from "@rentweb/core/tenant";
import { codeStock, games, gamePackages, topupBlacklist, topupSuppliers } from "@rentweb/db";
import { encryptToString } from "@rentweb/core/crypto";
import { section, hero, marquee, gameGrid, topupFeed, steps, features, faq, cta, stats, testimonials } from "@rentweb/storefront/definitions";
import { aboutPage, contactPage, legalPages, u, avatar } from "./shared";

/** Game covers (the seed's game images and the hero's 3D card stack share them). */
const COVER = {
  rov: "1542751371-adc38448a05e",
  "free-fire": "1511512578047-dfb367046420",
  genshin: "1538481199705-c710c4e965fc",
  valorant: "1552820728-8b83bb6b773f",
  // qa-c: was 1593305841991-05c297ba4575 (a TV showing another game's "WARZONE" logo) → esports players under stage light
  "pubg-mobile": "1560253023-3ec5d502959f",
  roblox: "1612287230202-1ff1d85d1bdf",
  mlbb: "1580327344181-c1163234e5a0",
  "steam-wallet": "1550745165-9bc0b252726f",
} as const;

/**
 * Hero card stack (§5.2): all eight demo games orbiting the portal ring, each linking to its top-up page (the kit's
 * static fan scales its card width by count, so 8 cards stay inside the media column under reduced motion / no WebGL).
 */
const HERO_CARDS: Array<{ slug: keyof typeof COVER; title: string; tag: string }> = [
  { slug: "rov", title: "RoV", tag: "MOBILE" },
  { slug: "free-fire", title: "Free Fire", tag: "MOBILE" },
  { slug: "genshin", title: "Genshin Impact", tag: "MOBILE" },
  { slug: "valorant", title: "Valorant", tag: "PC" },
  { slug: "pubg-mobile", title: "PUBG Mobile", tag: "MOBILE" },
  { slug: "mlbb", title: "Mobile Legends", tag: "MOBILE" },
  { slug: "roblox", title: "Roblox", tag: "VOUCHER" },
  { slug: "steam-wallet", title: "Steam Wallet", tag: "CODE" },
];

/** Player FAQ (home + how-to). */
const FAQ = [
  { q: "ต้องให้รหัสผ่านไหม?", a: "ไม่ต้องครับ ใช้แค่ UID (และ Server/Zone สำหรับบางเกม) เราไม่มีการล็อกอินเข้าบัญชีของคุณ" },
  { q: "ใช้เวลานานแค่ไหน?", a: "แพ็กเกจที่เป็นระบบอัตโนมัติเข้าภายใน 10–60 วินาที แพ็กเกจเติมมือใช้เวลา 5–30 นาที (แสดงไว้ที่แพ็กเกจ)" },
  { q: "เติมไม่เข้าทำอย่างไร?", a: "ระบบจะคืนเงินเข้ากระเป๋าอัตโนมัติ หากไม่ได้รับภายใน 30 นาที ทัก LINE พร้อมเลขที่รายการ" },
  { q: "เงินในกระเป๋าถอนได้ไหม?", a: "กระเป๋าเงินใช้สำหรับเติมเกมในเว็บนี้เท่านั้น ไม่สามารถถอนเป็นเงินสดได้" },
];

/**
 * Home page sections (GameHub, docs/design/hi-end-direction.md §5.2); `neutral` = the variant for a new (non-demo) shop
 * (ADMIN-17: no "40+ เกม", volumes, ratings or sample games it does not have — its hero falls back to the preset scene).
 */
/**
 * qa-c: the shared About page is a scroll-lit statement + a contact card (text only) → the demo copy gets the arcade
 * signature between the two: a giant outline marquee of the games it serves and the HUD odometers (new shops keep the
 * neutral text-only page).
 */
function withHud(page: TemplatePage): TemplatePage {
  const hud = [
    section(marquee, { items: ["RoV", "FREE FIRE", "GENSHIN IMPACT", "VALORANT", "PUBG MOBILE", "ROBLOX", "MOBILE LEGENDS", "STEAM WALLET"], style: "outline", speed: 26, separator: "◆" }),
    section(stats, { variant: "cards", items: [{ value: 1, suffix: ".2M+", label: "รายการสำเร็จ" }, { value: 48, suffix: " เกม", label: "รองรับ" }, { value: 99, suffix: ".8%", label: "อัตราสำเร็จ" }, { value: 24, suffix: " ชม.", label: "เปิดบริการ" }] }),
  ];
  const sections = page.sections ?? [];
  return { ...page, sections: [...sections.slice(0, -1), ...hud, ...sections.slice(-1)] };
}

function homeSections(neutral: boolean) {
  return [
    section(hero, {
      variant: "split",
      scene: "auto",
      cards: neutral ? [] : HERO_CARDS.map((c) => ({ image: u(COVER[c.slug], 600), alt: c.title, title: c.title, tag: c.tag, href: `/games/${c.slug}` })),
      eyebrow: "ระบบอัตโนมัติ 24 ชม.",
      heading: "เติมเกมไว\nภายใน 10 วินาที",
      subheading: neutral
        ? "เลือกเกม เลือกแพ็กเกจ กรอก UID แล้วชำระเงิน ระบบเติมให้อัตโนมัติ จ่ายผ่าน PromptPay หรือกระเป๋าเงินในเว็บ"
        : "RoV · Free Fire · Genshin · Valorant · PUBG และเกมยอดนิยมอีกมากมาย ราคาถูกกว่าเติมตรง จ่ายผ่าน PromptPay หรือกระเป๋าเงินในเว็บ",
      primaryCta: { label: "เลือกเกมที่จะเติม", href: "/games" },
      secondaryCta: { label: "เติมเงินกระเป๋า +2%", href: "/wallet" },
      image: { url: "", alt: "" },
      background: "theme",
      badges: ["ตรวจสลิปอัตโนมัติ", "คืนเงิน 100% ถ้าเติมไม่สำเร็จ", "ราคาสมาชิกถูกกว่า"],
      cornerLabels: ["[ ONLINE ] AUTO TOP-UP", "SERVER TH · 24/7"],
      clock: true,
      stats: neutral ? [] : [{ value: "1.2M+", label: "รายการเติมสำเร็จ" }, { value: "10 วิ", label: "เวลาเติมเฉลี่ย" }, { value: "4.9/5", label: "คะแนนจากผู้ใช้" }],
    }),
    section(marquee, { items: neutral ? ["เติมเกมออนไลน์", "บัตรและโค้ดเกม", "ระบบอัตโนมัติ 24 ชม.", "ตรวจสลิปอัตโนมัติ", "กระเป๋าเงินในเว็บ"] : ["RoV", "FREE FIRE", "GENSHIN IMPACT", "VALORANT", "PUBG MOBILE", "ROBLOX", "HONKAI STAR RAIL", "MOBILE LEGENDS", "STEAM WALLET"], style: "outline", speed: 22, separator: "◆" }),
    // choosing a game is the job: the grid comes right after the hero (§5.2 #3), then the live feed (hidden while empty)
    section(gameGrid, { heading: "เลือกเกมที่ต้องการเติม", subheading: "กด เลือกแพ็กเกจ กรอก UID แล้วจ่ายเงิน ระบบเติมให้อัตโนมัติ", showSearch: true, variant: "tiles" }),
    section(topupFeed, { heading: "เติมล่าสุด (สด)", limit: 8 }),
    section(steps, {
      eyebrow: "ใช้งานง่าย",
      heading: "เติมเกมใน 3 ขั้นตอน",
      variant: "numbered",
      items: [
        { title: "เลือกเกมและแพ็กเกจ", description: "กรอก UID / Server ให้ถูกต้อง ระบบจะตรวจสอบชื่อตัวละครให้", icon: "Gamepad2" },
        { title: "ชำระเงิน", description: "PromptPay QR, แนบสลิป, หรือตัดจากกระเป๋าเงินในเว็บ (ได้โบนัส 2%)", icon: "QrCode" },
        { title: "รับของทันที", description: "ระบบเติมอัตโนมัติภายใน 10 วินาที แจ้งเตือนผ่าน LINE เมื่อสำเร็จ", icon: "Zap" },
      ],
    }),
    section(features, {
      variant: "bento",
      eyebrow: "ทำไมต้อง GameHub",
      heading: "เติมที่นี่ สบายใจกว่า",
      items: [
        { icon: "ShieldCheck", title: "ปลอดภัย ไม่ต้องให้รหัสผ่าน", description: "เติมผ่าน UID เท่านั้น ไม่มีการล็อกอินแทน บัญชีไม่โดนแบน", image: u("1538481199705-c710c4e965fc", 1200) },
        { icon: "BadgePercent", title: "ราคาสมาชิก 3 ระดับ", description: "ยิ่งเติมสะสมมาก ยิ่งได้ราคาถูก สูงสุดลด 8%", image: u("1511512578047-dfb367046420", 1000) },
        { icon: "RotateCcw", title: "คืนเงิน 100%", description: "ถ้าเติมไม่สำเร็จ ระบบคืนเข้ากระเป๋าทันที" },
        { icon: "Headset", title: "แอดมินตอบไว", description: "LINE ตอบภายใน 5 นาที 09:00–02:00" },
        { icon: "History", title: "ตรวจสอบย้อนหลังได้", description: "ประวัติทุกรายการ พร้อมหลักฐานการเติม" },
      ],
    }),
    // sales volume / game count / success rate of the sample business — demo only. Short values ("1.2M+", "99.8%") keep
    // the HUD odometers inside their cards at every width (a 10-character "1,200,000+" overflowed a quarter column) and
    // the odometer formats integers only, so the decimals ride in the suffix.
    ...(neutral ? [] : [section(stats, { variant: "cards", items: [{ value: 1, suffix: ".2M+", label: "รายการสำเร็จ" }, { value: 48, suffix: " เกม", label: "รองรับ" }, { value: 99, suffix: ".8%", label: "อัตราสำเร็จ" }, { value: 24, suffix: " ชม.", label: "เปิดบริการ" }] })]),
    // §5.2: player reviews as a chat thread
    section(testimonials, {
      heading: "ผู้เล่นพูดถึงเรา",
      variant: "chat",
      items: [
        { quote: "เติม RoV ตอนตี 2 ก็เข้าภายในไม่ถึงนาที ถูกกว่าเติมในเกมด้วย", name: "KaiZen", role: "ผู้เล่น RoV", avatar: avatar("kaizen"), rating: 5 },
        { quote: "ใช้กระเป๋าเงินได้โบนัสเพิ่ม เติมบ่อย\u00a0ๆ คุ้มมาก", name: "Mintra", role: "Genshin Impact", avatar: avatar("mintra"), rating: 5 },
        { quote: "เคยเติมไม่เข้า 1 ครั้ง ระบบคืนเงินเข้ากระเป๋าเองเลย ไม่ต้องทักแอดมิน", name: "Boss_FF", role: "Free Fire", avatar: avatar("boss"), rating: 5 },
      ],
    }),
    section(faq, {
      heading: "คำถามที่พบบ่อย",
      layout: "two-column",
      items: FAQ,
    }),
    section(cta, { variant: "glow", heading: "พร้อมแรงค์ขึ้น\nแล้วหรือยัง?", body: "เติมครั้งแรกวันนี้ รับโบนัสกระเป๋าเงิน 2%", primaryCta: { label: "เริ่มเติมเกม", href: "/games" } }),
  ];
}

export const topup: TemplateDefinition = {
  key: "topup",
  name: { th: "เว็บเติมเกม", en: "Game top-up store" },
  description: { th: "เติมเกมอัตโนมัติ 24 ชม. กระเป๋าเงิน แพ็กเกจราคาสมาชิก ตรวจสลิปอัตโนมัติ ธีมเกมมิ่งนีออน 3D", en: "24/7 automated game top-up with wallet, tier pricing, slip verification — neon 3D gaming theme" },
  category: "digital",
  siteType: "topup",
  modules: ["topup"],
  themePreset: "neon",
  recommendedPresets: ["neon", "studio", "midnight"],
  complexity: 4,
  previewImage: u("1542751371-adc38448a05e", 1200),
  // ADMIN-17: new (non-demo) shops get their own name instead of the sample brand (home uses neutralSections)
  sampleBrand: ["GameHub Co., Ltd.", "GameHub"],
  settings: {
    tagline: "เติมเกมไว ราคาดี เปิดตลอด 24 ชั่วโมง",
    contact: { lineId: "@gamehub", facebook: "https://facebook.com", email: "support@gamehub.gg", hours: [{ day: "ทุกวัน", time: "24 ชั่วโมง (ระบบอัตโนมัติ)" }, { day: "แอดมิน", time: "09:00 – 02:00" }] },
    header: { cta: { label: "เติมเงินเข้ากระเป๋า", href: "/wallet" } },
    payments: {
      promptpayId: "0899998888",
      promptpayName: "GameHub",
      bankAccounts: [{ bank: "กรุงไทย", name: "GameHub Co., Ltd.", number: "111-2-33333-4" }],
      enabled: { promptpay: true, bankTransfer: true, wallet: true },
    },
  },
  moduleConfig: { topup: { walletEnabled: true, walletBonusPercent: 2, minWalletTopup: 2000, otpRequiredFirstOrder: true, maxOrdersPerHour: 10 } },
  navigation: {
    header: [
      { label: "เติมเกม", href: "/games" },
      { label: "กระเป๋าเงิน", href: "/wallet" },
      { label: "ตรวจสอบสถานะ", href: "/topup/status" },
      { label: "วิธีเติม", href: "/how-to" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "เติมเกม", href: "/games" },
      { label: "กระเป๋าเงิน", href: "/wallet" },
      { label: "ตรวจสอบสถานะ", href: "/topup/status" },
      { label: "ช่วยเหลือ", href: "#", children: [{ label: "วิธีเติม", href: "/how-to" }, { label: "ติดต่อแอดมิน", href: "/contact" }] },
    ],
  },
  pages: [
    {
      slug: "home",
      title: "หน้าแรก",
      kind: "home",
      sections: homeSections(false),
      // ADMIN-17: a new (non-demo) shop gets copy that claims no game list / counts / volumes it does not have
      neutralSections: homeSections(true),
    },
    {
      slug: "how-to",
      title: "วิธีเติม",
      sections: [
        section(steps, {
          heading: "วิธีเติมเกมกับ GameHub",
          variant: "vertical",
          items: [
            { title: "สมัคร/เข้าสู่ระบบด้วยเบอร์โทร", description: "ใส่เบอร์ รับ OTP ครั้งเดียว ครั้งต่อไปจำอุปกรณ์ให้" },
            { title: "เลือกเกม → แพ็กเกจ → กรอก UID", description: "ตรวจสอบชื่อตัวละครที่ระบบดึงมาแสดงให้ถูกต้องก่อนกดจ่าย" },
            { title: "ชำระเงิน", description: "สแกน PromptPay แล้วระบบตรวจสลิปอัตโนมัติ หรือตัดจากกระเป๋าเงิน" },
            { title: "รับของและเช็กประวัติ", description: "ดูสถานะได้ที่หน้า ตรวจสอบสถานะ และในบัญชีของคุณ" },
          ],
        }),
        // qa-c: the page ended on a bare timeline → answers to the usual questions + a way into the shop
        section(faq, { heading: "คำถามที่พบบ่อย", layout: "two-column", items: FAQ }),
        section(cta, { variant: "glow", heading: "เลือกเกม\nแล้วเติมได้เลย", body: "เติมครั้งแรกวันนี้ รับโบนัสกระเป๋าเงิน 2%", primaryCta: { label: "เลือกเกมที่จะเติม", href: "/games" }, secondaryCta: { label: "ตรวจสอบสถานะ", href: "/topup/status" } }),
      ],
    },
    withHud(aboutPage({ heading: "GameHub — ร้านเติมเกมที่ผู้เล่นสร้างให้ผู้เล่น", body: "เราเริ่มจากกลุ่มเพื่อนที่เบื่อการเติมเกมช้าและราคาแพง จึงสร้างระบบเติมอัตโนมัติที่เชื่อมกับผู้ให้บริการโดยตรง ปัจจุบันให้บริการมากกว่า 1.2 ล้านรายการ โดยยึดหลัก ไม่ขอรหัสผ่าน คืนเงินทันทีเมื่อไม่สำเร็จ และโปร่งใสทุกรายการ" })),
    contactPage({ heading: "ติดต่อแอดมิน", body: "ปัญหาการเติม ส่งเลขที่รายการมาทาง LINE แอดมินตอบภายใน 5 นาที (09:00–02:00)" }),
    ...legalPages("GameHub"),
  ],
  async seed(tx, tenantId) {
    const [manual] = await tx
      .insert(topupSuppliers)
      .values({ tenantId, name: "เติมมือโดยแอดมิน", provider: "manual", config: {} })
      .returning({ id: topupSuppliers.id });

    const defs = [
      { name: "RoV (Arena of Valor)", slug: "rov", publisher: "Garena", img: u(COVER.rov, 600), cat: "mobile", fields: [{ key: "uid", label: "Open ID / UID", type: "text", required: true, placeholder: "เช่น 123456789", pattern: "\\d{5,20}", inputMode: "numeric", hint: "ตัวเลข 5–20 หลัก" }], pk: [["40 คูปอง", 3500, 3300], ["120 คูปอง", 9900, 9500], ["240 คูปอง", 19900, 19000], ["500 คูปอง", 38900, 37000], ["1,200 คูปอง", 89900, 86000]] },
      { name: "Free Fire", slug: "free-fire", publisher: "Garena", img: u(COVER["free-fire"], 600), cat: "mobile", fields: [{ key: "uid", label: "Player ID", type: "text", required: true, placeholder: "เช่น 1234567890", pattern: "\\d{8,12}", inputMode: "numeric", hint: "ตัวเลข 8–12 หลัก" }], pk: [["100 เพชร", 3300, 3100], ["310 เพชร", 9500, 9100], ["520 เพชร", 15900, 15200], ["1,060 เพชร", 31900, 30500], ["2,180 เพชร", 63900, 61000]] },
      { name: "Genshin Impact", slug: "genshin", publisher: "HoYoverse", img: u(COVER.genshin, 600), cat: "mobile", fields: [{ key: "uid", label: "UID", type: "text", required: true, placeholder: "เช่น 812345678", pattern: "\\d{9,10}", inputMode: "numeric", hint: "ตัวเลข 9–10 หลัก" }, { key: "server", label: "Server", type: "select", required: true, options: ["Asia", "America", "Europe", "TW/HK/MO"] }], pk: [["60 Genesis Crystals", 3500, 3300], ["330 Genesis Crystals", 17500, 16800], ["1,090 Genesis Crystals", 52900, 50500], ["Blessing of the Welkin Moon", 17500, 16500]] },
      { name: "Valorant", slug: "valorant", publisher: "Riot Games", img: u(COVER.valorant, 600), cat: "pc", fields: [{ key: "riotid", label: "Riot ID#Tag", type: "text", required: true, placeholder: "Name#TAG", pattern: "[^#\\s][^#]{2,15}#[A-Za-z0-9]{3,5}", hint: "ชื่อ 3–16 ตัว ตามด้วย #Tag 3–5 ตัว เช่น Player#TH1" }], pk: [["420 VP", 11500, 11000], ["1,000 VP", 26900, 25900], ["2,100 VP", 53900, 52000]] },
      { name: "PUBG Mobile", slug: "pubg-mobile", publisher: "Tencent", img: u(COVER["pubg-mobile"], 600), cat: "mobile", fields: [{ key: "uid", label: "Character ID", type: "text", required: true, placeholder: "เช่น 5123456789", pattern: "\\d{5,12}", inputMode: "numeric", hint: "ตัวเลข 5–12 หลัก" }], pk: [["60 UC", 3500, 3300], ["325 UC", 17500, 16800], ["660 UC", 34900, 33500]] },
      { name: "Roblox", slug: "roblox", publisher: "Roblox", img: u(COVER.roblox, 600), cat: "voucher", fields: [{ key: "username", label: "Username", type: "text", required: true, placeholder: "เช่น Player_123", pattern: "[A-Za-z0-9_]{3,20}", hint: "ตัวอักษรอังกฤษ ตัวเลข หรือ _ 3–20 ตัว" }], pk: [["400 Robux", 17900, 17200], ["800 Robux", 34900, 33500], ["1,700 Robux", 69900, 67000]] },
      { name: "Mobile Legends", slug: "mlbb", publisher: "Moonton", img: u(COVER.mlbb, 600), cat: "mobile", fields: [{ key: "uid", label: "User ID", type: "text", required: true, placeholder: "เช่น 12345678", pattern: "\\d{5,12}", inputMode: "numeric", hint: "ตัวเลข 5–12 หลัก" }, { key: "zone", label: "Zone ID", type: "text", required: true, placeholder: "เช่น 1234", pattern: "\\d{3,6}", inputMode: "numeric", hint: "ตัวเลข 3–6 หลัก" }], pk: [["86 Diamonds", 5500, 5200], ["172 Diamonds", 10900, 10400], ["257 Diamonds", 15900, 15200], ["706 Diamonds", 42900, 41000]] },
      { name: "Steam Wallet (TH)", slug: "steam-wallet", publisher: "Valve", img: u(COVER["steam-wallet"], 600), cat: "voucher", fields: [{ key: "contact", label: "LINE ID / อีเมลสำหรับรับโค้ด", type: "text", required: true, pattern: "\\S{3,100}", maxLength: 100, hint: "LINE ID หรืออีเมล ไม่มีเว้นวรรค" }], pk: [["฿100", 10900, 10500], ["฿300", 31900, 30900], ["฿500", 52900, 51000], ["฿1,000", 104900, 101500]] },
    ] as const;

    const instructions: Record<string, string> = {
      rov: "เปิดเกม RoV → แตะรูปโปรไฟล์มุมซ้ายบน → ดูเลข Open ID ใต้ชื่อตัวละคร → แตะเพื่อคัดลอก",
      "free-fire": "เปิดเกม → แตะโปรไฟล์มุมซ้ายบน → Player ID อยู่ใต้ชื่อ (ตัวเลข 8–12 หลัก)",
      genshin: "เปิดเมนู Paimon → มุมล่างซ้ายจะแสดง UID ตัวเลข 9–10 หลัก → เลือก Server ให้ตรงกับที่เล่น",
      valorant: "เปิด Riot Client → มุมขวาบนคลิกชื่อ → คัดลอก Riot ID พร้อม #Tag เช่น Player#TH1",
      "pubg-mobile": "เปิดเกม → แตะโปรไฟล์ → Character ID อยู่ใต้ชื่อตัวละคร",
      roblox: "ใช้ Username ที่ใช้ล็อกอิน (ไม่ใช่ Display name) ตรวจสอบตัวพิมพ์เล็ก-ใหญ่ให้ถูกต้อง",
      mlbb: "เปิดเกม → แตะโปรไฟล์ → จะเห็น User ID (Zone ID) เช่น 12345678 (1234) กรอกแยกช่อง",
      "steam-wallet": "ไม่ต้องใช้ ID เกม ระบบจะส่งโค้ด Steam Wallet ให้ที่หน้ารายการ และช่องทางติดต่อที่กรอก",
    };

    for (const [i, d] of defs.entries()) {
      const [g] = await tx
        .insert(games)
        .values({
          tenantId,
          name: d.name,
          slug: d.slug,
          publisher: d.publisher,
          image: d.img,
          banner: d.img,
          fields: d.fields as any,
          category: d.cat,
          featured: i < 4,
          sort: i,
          description: `เติม ${d.name} ราคาถูก ${d.cat === "voucher" ? "รับโค้ดทันทีหลังชำระเงิน" : "เข้าภายในไม่กี่วินาที"} ปลอดภัย ไม่ต้องให้รหัสผ่าน`,
          instructions: instructions[d.slug] ?? "เปิดเกม → โปรไฟล์ → คัดลอก ID",
        })
        .returning({ id: games.id });
      const pkgs = await tx
        .insert(gamePackages)
        .values(
          d.pk.map(([name, price, cost], j) => ({
            tenantId,
            gameId: g!.id,
            name,
            price,
            costPrice: cost,
            tierPrices: { vip: Math.round((price * 0.98) / 100) * 100, agent: Math.round((price * 0.95) / 100) * 100 },
            fulfillment: d.cat === "voucher" ? "stock" : j % 2 === 0 ? "api" : "manual",
            supplierId: manual!.id,
            estimatedMinutes: j % 2 === 0 ? 1 : 15,
            badge: j === 1 ? "ขายดี" : j === d.pk.length - 1 ? "คุ้มสุด" : null,
            sort: j,
          })),
        )
        .returning({ id: gamePackages.id, name: gamePackages.name });

      // demo code stock: ~5 encrypted Steam Wallet codes per package (Roblox stays empty to show the sold-out state)
      if (d.slug === "steam-wallet") {
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const seg = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
        await tx.insert(codeStock).values(
          pkgs.flatMap((p) =>
            Array.from({ length: 5 }, (_, n) => ({
              tenantId,
              packageId: p.id,
              codeEncrypted: encryptToString(`STEAM-${seg()}-${seg()}-${seg()}`),
              serial: `SW${p.name.replace(/[^0-9]/g, "")}-${String(n + 1).padStart(3, "0")}`,
              addedBy: "seed",
            })),
          ),
        );
      }
    }

    await tx.insert(topupBlacklist).values({ tenantId, kind: "phone", value: "0800000000", reason: "ตัวอย่าง: แจ้งโกงซ้ำหลายครั้ง (เบอร์ทดสอบ)", createdBy: "seed" });
  },
};
