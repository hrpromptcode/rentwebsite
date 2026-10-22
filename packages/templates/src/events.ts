import { randomInt } from "node:crypto";
import type { TemplateDefinition } from "@rentweb/core/tenant";
import { customers, eq, eventPromoCodes, eventSessions, events, nextCounter, ticketOrders, ticketTypes, tickets } from "@rentweb/db";
import { section, features, imageText, testimonials, faq, cta, gallery, steps, contact, hero, marquee, eventHero, eventGrid, eventHighlights } from "@rentweb/storefront/definitions";
import { aboutPage, contactPage, legalPages, u, avatar } from "./shared";

/*
 * Events / ticketing template: "Maker Yard Bangkok" (เมคเกอร์ ยาร์ด) – a creative-events collective in a converted
 * riverside warehouse in Khlong San (Thonburi) that runs workshops, design talks, live music, a community run and a
 * maker market. Built on the events module: events → sessions (Asia/Bangkok instants) → ticket types with sales
 * windows and quantities → ticket orders (TK-1001…) → one ticket per attendee (12-symbol codes, signed QR at read time).
 * Five sample events: an upcoming workshop, a two-session seminar, a riverside mini concert (VIP / regular / closed
 * early bird / not-yet-open door tickets), a charity run whose early bird is sold out, and one past maker market.
 */

const BKK_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** today in Bangkok as YYYY-MM-DD */
function bkkToday(now = new Date()): string {
  return new Date(now.getTime() + BKK_MS).toISOString().slice(0, 10);
}
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** instant of a Bangkok civil time ("19:30") on a date */
function at(ymd: string, hm: string): Date {
  const [h, mi] = hm.split(":").map(Number) as [number, number];
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, h, mi) - BKK_MS);
}
const accessKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, "").slice(0, 32);

/** the same code shape as services/tickets.ts generateTicketCode (32 symbols, no 0/O/1/I, "XXXX-XXXX-XXXX") */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function ticketCode(used: Set<string>): string {
  for (;;) {
    let s = "";
    for (let i = 0; i < 12; i++) s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    const code = s.match(/.{1,4}/g)!.join("-");
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
}

const IMG = {
  hero: u("1492684223066-81342ee5ff30", 1900),
  crowd: u("1501386761578-eac5c94b800a", 1600),
  stage: u("1470229722913-7c0e2dbbafd3", 1600),
  concert: u("1459749411175-04bf5292ceea", 1400),
  concertHands: u("1429962714451-bb934ecdc4ec", 1400),
  lights: u("1514525253161-7a46d19cd819", 1400),
  conference: u("1475721027785-f74eccf877e2", 1600),
  talk: u("1540575467063-178a50c2df87", 1400),
  talkStage: u("1505373877841-8d25f7d46678", 1400),
  lecture: u("1524178232363-1fb2b075b655", 1400),
  speaker: u("1515169067868-5387ec356754", 1400),
  workshop: u("1452860606245-08befc0ff44b", 1400),
  makers: u("1513467535987-fd81bc7d62f8", 1400),
  team: u("1522071820081-009f0129c71c", 1400),
  run: u("1452626038306-9aae5e071dd3", 1600),
  runners: u("1486218119243-13883505764c", 1400),
  runner: u("1461896836934-ffe607ba8211", 1400),
  shoes: u("1552674605-db6ffd4facb5", 1400),
  market: u("1533900298318-6b8da08a523e", 1400),
  marketStalls: u("1513125370-3460ebe3401b", 1400),
  marketFlowers: u("1555529669-e69e7aa0ba9a", 1400),
  party: u("1511578314322-379afb476865", 1400),
  audience: u("1531058020387-3be344556be6", 1400),
  warehouse: u("1517457373958-b7bdd4587205", 1600),
  bangkok: u("1508009603885-50cf7c579365", 1600),
  river: u("1563492065599-3520f775eeed", 1400),
  qrPhone: u("1595079676339-1534801ad6cf", 1200),
  payPhone: u("1556742049-0cfed4f6a45d", 1200),
};

const MAP = "https://www.google.com/maps?q=Khlong+San+Bangkok&output=embed";
const VENUE = { name: "Maker Yard · โกดังริมน้ำ คลองสาน", address: "88 ซอยเจริญนคร 14 แขวงคลองต้นไทร เขตคลองสาน กรุงเทพฯ 10600", map: MAP };

export const eventsTemplate: TemplateDefinition = {
  key: "events",
  name: { th: "อีเวนต์ / จำหน่ายบัตร", en: "Events & ticketing" },
  description: {
    th: "ขายบัตรออนไลน์พร้อม e-ticket QR เช็กอินหน้างานด้วยกล้อง รอบการจัดงานหลายรอบ ประเภทบัตรหลายราคา ช่วงเวลาจำหน่าย (early bird) จำนวนจำกัด พร้อมเพย์/สลิป คืนเงินและรายชื่อผู้เข้าร่วม — คอนเสิร์ต เวิร์กช็อป สัมมนา งานวิ่ง เทศกาล",
    en: "Online ticket sales with QR e-tickets and camera check-in: multi-session events, tiered ticket types with sales windows and quantities, PromptPay/slip payment, refunds and attendee lists — concerts, workshops, seminars, runs and festivals",
  },
  category: "events",
  siteType: "events",
  modules: ["events"],
  themePreset: "stage",
  sampleBrand: ["Maker Yard Bangkok", "เมคเกอร์ ยาร์ด แบงค็อก", "Maker Yard", "เมคเกอร์ ยาร์ด"],
  neutralText: [
    ["BTS กรุงธนบุรี ทางออก 2 เดิน 8 นาทีตามซอยเจริญนคร 14 หรือต่อรถตุ๊กตุ๊กไฟฟ้าหน้าสถานี", "เดินทางสะดวกด้วยรถไฟฟ้า เดินถึงสถานที่จัดงานได้ในไม่กี่นาที"],
    ["โกดังริมน้ำ คลองสาน", "พื้นที่จัดงานของเรา"],
    ["โกดังเก่าริมเจ้าพระยา", "พื้นที่จัดงาน"],
    ["ริมเจ้าพระยา", "ริมน้ำ"],
    ["BTS กรุงธนบุรี", "สถานีรถไฟฟ้าใกล้เคียง"],
    ["ท่าเรือคลองสาน", "ท่าเรือใกล้เคียง"],
    ["คลองสาน", "ย่านของเรา"],
  ],
  recommendedPresets: ["stage", "neon", "midnight"],
  complexity: 4,
  previewImage: IMG.hero,
  settings: {
    tagline: "เวิร์กช็อป ทอล์ก ดนตรี และงานวิ่งริมเจ้าพระยา",
    contact: {
      phone: "02-860-4488",
      lineId: "@makeryard",
      email: "hello@makeryard.bkk",
      address: VENUE.address,
      mapUrl: MAP,
      hours: [
        { day: "ออฟฟิศผู้จัด", time: "จันทร์–ศุกร์ 10:00 – 18:00" },
        { day: "วันจัดงาน", time: "ประตูเปิดตามเวลาบนบัตร" },
        { day: "ติดต่อเรื่องบัตร", time: "LINE ตอบภายใน 1 ชั่วโมง" },
      ],
      instagram: "https://instagram.com",
      facebook: "https://facebook.com",
    },
    header: { cta: { label: "ซื้อบัตร", href: "/events" } },
    payments: {
      promptpayId: "0105561234567",
      promptpayName: "Maker Yard Bangkok Co., Ltd.",
      bankAccounts: [{ bank: "กสิกรไทย", name: "บจก. เมคเกอร์ ยาร์ด แบงค็อก", number: "045-8-77881-2" }],
      enabled: { promptpay: true, bankTransfer: true },
    },
  },
  moduleConfig: {
    events: {
      holdMinutes: 20,
      allowGuestCheckout: true,
      maxPerOrder: 10,
      ticketTerms: "บัตรที่ซื้อแล้วไม่สามารถเปลี่ยนหรือคืนเงินได้ ยกเว้นกรณีงานถูกยกเลิกหรือเลื่อน · เปลี่ยนชื่อผู้ถือบัตรได้ฟรีก่อนวันงาน 48 ชั่วโมงผ่าน LINE · กรุณาแสดง QR บนบัตรที่จุดเช็กอิน บัตรหนึ่งใบใช้เข้างานได้หนึ่งครั้ง",
      enforceSessionDay: true,
      checkInOpensMinutesBefore: 90,
      refundReleasesSeats: true,
      showOrganizerContact: true,
    },
  },
  navigation: {
    header: [
      { label: "อีเวนต์", href: "/events" },
      { label: "สถานที่จัดงาน", href: "/venue" },
      { label: "เกี่ยวกับเรา", href: "/about" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "อีเวนต์ทั้งหมด", href: "/events" },
      { label: "งานที่ผ่านมา", href: "/events?scope=past" },
      { label: "สถานที่และการเดินทาง", href: "/venue" },
      { label: "บัตรของฉัน", href: "/account/tickets" },
      { label: "จัดงานกับเรา", href: "/contact" },
      { label: "เกี่ยวกับเรา", href: "/about" },
    ],
  },
  pages: [
    {
      slug: "home",
      title: "หน้าแรก",
      kind: "home",
      sections: [
        section(eventHero, {
          source: "featured",
          variant: "fullscreen",
          eyebrow: "Maker Yard Bangkok · โกดังริมน้ำ คลองสาน",
          ctaLabel: "ซื้อบัตร",
          secondaryCta: { label: "ดูอีเวนต์ทั้งหมด", href: "/events" },
          image: { url: IMG.hero, alt: "ผู้ชมในงานดนตรีกลางแจ้งยามค่ำ" },
          showCountdown: true,
          overlay: 0.55,
          textReveal: true,
        }),
        section(marquee, {
          items: ["RIVERSIDE LIVE", "LEATHER WORKSHOP", "DESIGN TALK", "NIGHT RUN", "MAKER MARKET"],
          style: "giant",
          separator: "✦",
          speed: 46,
          velocity: true,
        }),
        section(eventGrid, {
          eyebrow: "เร็ว ๆ นี้",
          heading: "งานที่กำลังจะมาถึง",
          subheading: "เวิร์กช็อปกลุ่มเล็ก ทอล์กที่คุยกันต่อได้ถึงดึก ดนตรีริมน้ำ และงานวิ่งที่จบด้วยอาหารเช้า — เลือกรอบ เลือกประเภทบัตร รับ QR ทันทีหลังชำระเงิน",
          scope: "upcoming",
          limit: 6,
          variant: "cards",
          showViewAll: true,
        }),
        section(features, {
          eyebrow: "ซื้อบัตรกับเรา",
          heading: "บัตรอยู่ในมือถือ ไม่ต้องพิมพ์ ไม่ต้องต่อคิวรับบัตร",
          subheading: "ทุกขั้นตอนจบในไม่กี่นาที และบัตรทุกใบมีชื่อผู้ถือกับ QR เฉพาะตัว",
          variant: "bento",
          columns: 3,
          items: [
            { icon: "QrCode", title: "e-ticket พร้อม QR ทันที", description: "ชำระเงินเสร็จ บัตรทุกใบโผล่ในหน้าคำสั่งซื้อและในบัญชีของคุณ แชร์ลิงก์บัตรให้เพื่อนที่มาด้วยได้ทีละใบ", image: IMG.qrPhone },
            { icon: "Smartphone", title: "พร้อมเพย์หรือโอนแนบสลิป", description: "สแกน QR พร้อมเพย์จ่ายได้ในแอปธนาคาร ระบบจองบัตรให้ 20 นาทีระหว่างชำระเงิน", image: IMG.payPhone },
            { icon: "ScanLine", title: "เช็กอินหน้างานใน 2 วินาที", description: "ทีมงานสแกน QR จากหน้าจอมือถือ ไม่ต้องยื่นบัตรประชาชน ไม่ต้องหาชื่อในกระดาษ" },
            { icon: "Users", title: "ชื่อผู้เข้าร่วมทุกใบ", description: "ซื้อหลายใบได้ในคำสั่งซื้อเดียว ใส่ชื่อแต่ละคนตอนซื้อ หรือใช้ชื่อผู้ซื้อแล้วค่อยแก้ทีหลัง" },
            { icon: "CalendarPlus", title: "เพิ่มลงปฏิทินได้", description: "ดาวน์โหลด .ics จากหน้าบัตร เวลาประตูเปิดและพิกัดสถานที่ติดไปด้วย" },
            { icon: "RotateCcw", title: "คืนเงินเต็มจำนวนเมื่องานยกเลิก", description: "หากผู้จัดต้องยกเลิกหรือเลื่อน เราคืนเงินกลับช่องทางเดิมภายใน 7–14 วันทำการ", image: IMG.lights },
          ],
        }),
        section(eventHighlights, {
          eyebrow: "ที่ผ่านมา",
          heading: "บรรยากาศงานที่ผ่านมา",
          subheading: "โกดังเก่าริมเจ้าพระยากลายเป็นลานตลาดนัดนักทำ เวทีดนตรี และห้องเรียนใหญ่ — แล้วแต่สุดสัปดาห์นั้นเราชวนใครมา",
          limit: 4,
          layout: "filmstrip",
          images: [
            { url: IMG.stage, alt: "เวทีดนตรีริมน้ำ", caption: "Riverside Live ครั้งที่ 3" },
            { url: IMG.makers, alt: "เวิร์กช็อปงานไม้", caption: "เวิร์กช็อปงานไม้สำหรับมือใหม่" },
            { url: IMG.talk, alt: "ผู้ฟังในงานทอล์ก", caption: "Design Talk 2025" },
            { url: IMG.marketStalls, alt: "ร้านค้าในตลาดนัดนักทำ", caption: "Maker Market ครั้งที่ 6" },
          ],
        }),
        section(imageText, {
          eyebrow: "ผู้จัดงาน",
          heading: "เราคือคนที่อยากให้คลองสานมีเรื่องให้ออกจากบ้านทุกสุดสัปดาห์",
          body: "Maker Yard เริ่มจากโกดังเก่าริมเจ้าพระยาที่เพื่อนสี่คนเช่ามาทำสตูดิโอ แล้วเปิดประตูให้คนแถวนั้นเข้ามาดูงานในวันเสาร์ วันนี้โกดังหลังนั้นจัดงานปีละกว่า 40 งาน ตั้งแต่เวิร์กช็อปเครื่องหนัง 16 ที่นั่ง ไปจนถึงงานวิ่งการกุศลที่มีคนมาพันกว่าคน\n\nเราเลือกงานด้วยคำถามเดียว คือเราอยากไปงานนี้เองไหม — และดูแลผู้ซื้อบัตรแบบเดียวกับที่อยากให้คนอื่นดูแลเรา",
          image: { url: IMG.team, alt: "ทีมผู้จัดงานในโกดัง" },
          imagePosition: "left",
          bullets: ["จัดงานมาแล้ว 180+ งาน ผู้เข้าร่วมกว่า 60,000 คน", "โกดังริมน้ำ 1,200 ตร.ม. รองรับได้ถึง 800 คน", "ครึ่งหนึ่งของรายได้งานวิ่งมอบให้มูลนิธิในชุมชนคลองสาน"],
          cta: { label: "เรื่องราวของเรา", href: "/about" },
          style: "overlap",
        }),
        section(testimonials, {
          eyebrow: "เสียงจากผู้เข้าร่วม",
          heading: "มาครั้งแรกเพราะเพื่อนชวน กลับมาอีกเพราะอยากมาเอง",
          variant: "spotlight",
          items: [
            { quote: "ซื้อบัตรตอนเที่ยงคืนบนมือถือ สแกนจ่ายพร้อมเพย์ บัตรเด้งมาทันที วันงานโชว์ QR สองวิก็เข้าได้ ไม่ต้องพิมพ์อะไรเลย", name: "คุณเฟิร์น", role: "Riverside Live · VIP", avatar: avatar("fern-events"), rating: 5 },
            { quote: "เวิร์กช็อปเครื่องหนังกลุ่มเล็กมาก ครูดูทุกคนจริง ๆ กลับบ้านพร้อมกระเป๋าที่ใช้ได้จริง ไม่ใช่ของที่ระลึก", name: "คุณบอส", role: "เวิร์กช็อปเครื่องหนัง", avatar: avatar("boss-events"), rating: 5 },
            { quote: "งานวิ่งที่จุดเช็กอินไม่ต้องรอคิว รับเบอร์วิ่งจาก QR ในบัตร จบที่โกดังมีข้าวต้มกับกาแฟรอ เป็นงานวิ่งที่อบอุ่นที่สุดที่เคยไป", name: "คุณณัฐ", role: "Khlong San Night Run · 10K", avatar: avatar("nat-events"), rating: 5 },
          ],
        }),
        section(faq, {
          heading: "ก่อนซื้อบัตร",
          items: [
            { q: "บัตรอยู่ที่ไหนหลังชำระเงิน?", a: "ทันทีที่ระบบรับชำระเงิน บัตรทุกใบพร้อม QR จะแสดงในหน้าคำสั่งซื้อ (ลิงก์ส่งไปทางเบอร์โทร/อีเมลที่ใช้ซื้อ) และในเมนูบัตรของฉันเมื่อเข้าสู่ระบบด้วยเบอร์เดิม" },
            { q: "ซื้อให้เพื่อนหลายคนได้ไหม?", a: "ได้ สูงสุด 10 ใบต่อคำสั่งซื้อ ใส่ชื่อผู้เข้าร่วมแต่ละใบตอนซื้อ แล้วแชร์ลิงก์บัตรแต่ละใบให้เพื่อนได้ทันที เพื่อนไม่ต้องสมัครสมาชิก" },
            { q: "ซื้อแล้วไปไม่ได้ ขอคืนเงินหรือเปลี่ยนชื่อได้ไหม?", a: "บัตรไม่สามารถคืนเงินได้ ยกเว้นงานถูกยกเลิกหรือเลื่อน แต่เปลี่ยนชื่อผู้ถือบัตรได้ฟรีก่อนวันงาน 48 ชั่วโมง เพียงทัก LINE พร้อมเลขคำสั่งซื้อ" },
            { q: "บัตรราคา early bird ต่างจากบัตรทั่วไปอย่างไร?", a: "เป็นบัตรแบบเดียวกันในราคาที่ถูกกว่าสำหรับคนที่ตัดสินใจก่อน จำนวนจำกัดและมีวันปิดจำหน่าย เมื่อหมดหรือพ้นช่วงเวลา ระบบจะแสดงเป็นขายหมด/ปิดการจำหน่ายโดยอัตโนมัติ" },
          ],
        }),
        section(cta, {
          variant: "glow",
          heading: "สุดสัปดาห์นี้\nออกจากบ้านมาคลองสาน",
          body: "เลือกงานที่อยากไป กดซื้อบัตร ชำระด้วยพร้อมเพย์ แล้วเจอกันที่โกดังริมน้ำ — หรือถ้าคุณมีงานอยากจัด โกดังของเราว่างรับฟังไอเดีย",
          primaryCta: { label: "ดูอีเวนต์ทั้งหมด", href: "/events" },
          secondaryCta: { label: "จัดงานกับเรา", href: "/contact" },
          image: { url: IMG.concertHands, alt: "ผู้ชมชูมือในคอนเสิร์ต" },
        }),
      ],
    },
    {
      slug: "venue",
      title: "สถานที่จัดงาน",
      sections: [
        section(hero, {
          variant: "editorial",
          eyebrow: "สถานที่จัดงาน",
          heading: "โกดังเก่าริมเจ้าพระยา ที่เปลี่ยนหน้าที่ได้ทุกสุดสัปดาห์",
          subheading: "พื้นที่ในร่ม 1,200 ตารางเมตร เพดานสูง 9 เมตร ลานริมน้ำอีก 600 ตารางเมตร รองรับได้ตั้งแต่เวิร์กช็อป 12 คนไปจนถึงคอนเสิร์ต 800 คน",
          primaryCta: { label: "ดูอีเวนต์ที่จะจัดที่นี่", href: "/events" },
          secondaryCta: { label: "ติดต่อเช่าพื้นที่", href: "/contact" },
          image: { url: IMG.warehouse, alt: "ภายในโกดังจัดงาน" },
          background: "none",
        }),
        section(features, {
          eyebrow: "ภายในงาน",
          heading: "สิ่งที่เตรียมไว้ให้ทุกงาน",
          variant: "icons",
          columns: 4,
          items: [
            { icon: "ScanLine", title: "จุดเช็กอิน 4 ช่อง", description: "สแกน QR จากมือถือ ไม่ต้องพิมพ์บัตร ผ่านได้ภายในไม่กี่วินาที" },
            { icon: "Wind", title: "ปรับอากาศทั้งโกดัง", description: "พื้นที่ในร่มปรับอากาศ ลานริมน้ำมีพัดลมไอน้ำและหลังคาผ้าใบ" },
            { icon: "Accessibility", title: "ทางลาดและห้องน้ำสำหรับรถเข็น", description: "ทางเข้าระดับพื้น ที่นั่งสำรองแถวหน้าสำหรับผู้ใช้รถเข็น แจ้งได้ในหมายเหตุตอนซื้อบัตร" },
            { icon: "Coffee", title: "คาเฟ่และบาร์ริมน้ำ", description: "เปิดตั้งแต่ประตูเปิดจนจบงาน กาแฟ เบียร์คราฟต์ และอาหารจากร้านในชุมชน" },
            { icon: "Baby", title: "เด็กและครอบครัว", description: "งานกลางวันส่วนใหญ่ต้อนรับเด็ก มีมุมเปลี่ยนผ้าอ้อมและเก้าอี้เสริม" },
            { icon: "Lock", title: "ฝากของ", description: "ล็อกเกอร์หยอดเหรียญ 60 ช่อง และจุดฝากกระเป๋าสำหรับงานวิ่ง" },
            { icon: "Wifi", title: "Wi-Fi ฟรี", description: "สัญญาณครอบคลุมทั้งโกดังและลานริมน้ำ สำหรับเปิดบัตรบนมือถือ" },
            { icon: "ShieldCheck", title: "ความปลอดภัย", description: "เจ้าหน้าที่รักษาความปลอดภัย จุดปฐมพยาบาล และ AED ทุกงาน" },
          ],
        }),
        section(steps, {
          eyebrow: "การเดินทาง",
          heading: "มาถึงเราได้สี่แบบ",
          variant: "cards",
          items: [
            { icon: "TrainFront", title: "รถไฟฟ้า", description: "BTS กรุงธนบุรี ทางออก 2 เดิน 8 นาทีตามซอยเจริญนคร 14 หรือต่อรถตุ๊กตุ๊กไฟฟ้าหน้าสถานี" },
            { icon: "Ship", title: "เรือ", description: "เรือด่วนเจ้าพระยาลงท่าเรือคลองสาน (ธงส้ม) เดินเลียบน้ำ 5 นาที มีเรือข้ามฟากจากท่าสี่พระยาทุก 10 นาที" },
            { icon: "Car", title: "รถยนต์", description: "ที่จอดรถในโกดัง 60 คัน คิดชั่วโมงละ 20 บาท เต็มเร็วในงานใหญ่ แนะนำที่จอดไอคอนสยามแล้วเดิน 10 นาที" },
            { icon: "Bike", title: "จักรยานและเดิน", description: "ที่จอดจักรยานฟรีหน้าโกดัง ทางเดินริมน้ำเชื่อมจากล้ง 1919 และไอคอนสยาม" },
          ],
        }),
        section(gallery, {
          heading: "พื้นที่ในโกดัง",
          subheading: "โถงหลัก ลานริมน้ำ ห้องเวิร์กช็อป และดาดฟ้าที่มองเห็นแม่น้ำ",
          layout: "masonry",
          columns: 3,
          images: [
            { url: IMG.stage, alt: "เวทีหลักในโถงโกดัง" },
            { url: IMG.audience, alt: "ผู้ชมในโถงหลัก" },
            { url: IMG.workshop, alt: "ห้องเวิร์กช็อป" },
            { url: IMG.lights, alt: "ไฟเวทีในโถงหลักยามค่ำ" },
            { url: IMG.river, alt: "วิวแม่น้ำเจ้าพระยาจากดาดฟ้า" },
            { url: IMG.market, alt: "ตลาดนัดในลานโกดัง" },
          ],
        }),
        section(contact, { heading: "แผนที่และการติดต่อ", body: "สอบถามเรื่องบัตรหรือเช่าพื้นที่ได้ทุกช่องทาง ทีมงานตอบภายในหนึ่งชั่วโมงในเวลาทำการ", showForm: false, showMap: true, showHours: true }),
      ],
    },
    aboutPage({
      eyebrow: "เกี่ยวกับเรา",
      neutral: { heading: "เกี่ยวกับ {{name}}", body: "{{name}} จัดงานที่เราอยากไปเอง และดูแลผู้ซื้อบัตรแบบเดียวกับที่อยากให้คนอื่นดูแลเรา ซื้อบัตรออนไลน์ รับ e-ticket พร้อม QR ทันที เช็กอินหน้างานด้วยมือถือ และคืนเงินเต็มจำนวนเมื่องานถูกยกเลิก" },
      heading: "Maker Yard — โกดังที่เพื่อนสี่คนเช่ามาทำงาน แล้วลืมปิดประตู",
      body: "ปี 2019 เพื่อนสี่คน — ช่างเครื่องหนัง นักออกแบบกราฟิก นักดนตรี และคนทำกาแฟ — เช่าโกดังเก่าริมเจ้าพระยาในซอยเจริญนคร 14 มาทำสตูดิโอร่วมกัน วันเสาร์แรกที่เปิดประตูระบายอากาศ เพื่อนบ้านเดินเข้ามาถามว่าขายอะไร เราเลยจัดตลาดนัดเล็ก ๆ ในเดือนถัดมา มีคนมา 300 คน\n\nวันนี้ Maker Yard จัดงานปีละกว่า 40 งาน ตั้งแต่เวิร์กช็อป 16 ที่นั่งที่ครูดูแลทุกคนจริง ๆ ทอล์กที่ผู้พูดอยู่คุยต่อจนร้านปิด ดนตรีริมน้ำที่เสียงไม่รบกวนเพื่อนบ้าน และงานวิ่งที่ครึ่งหนึ่งของรายได้กลับไปที่ชุมชนคลองสาน\n\nเราสร้างระบบบัตรของเราเองเพราะเบื่อการพิมพ์บัตรและหาชื่อในกระดาษ ตอนนี้ทุกใบมีชื่อผู้ถือกับ QR เฉพาะตัว ผู้ซื้อได้บัตรทันทีหลังจ่าย และทีมหน้างานรู้ตลอดเวลาว่าใครเข้างานแล้วกี่คน",
    }),
    contactPage({
      heading: "ติดต่อเรื่องบัตร หรือจัดงานกับเรา",
      body: "เรื่องบัตร แจ้งเลขคำสั่งซื้อ (TK-xxxx) มาพร้อมข้อความเพื่อให้เราช่วยได้เร็วที่สุด สำหรับการเช่าพื้นที่หรือจัดงานร่วมกัน เล่าไอเดีย วันที่ และจำนวนคนคร่าว ๆ เราจะส่งแพ็กเกจและวันว่างกลับไปภายในสองวันทำการ",
      faqs: [
        { q: "เปลี่ยนชื่อผู้ถือบัตรทำอย่างไร?", a: "ทัก LINE @makeryard พร้อมเลขคำสั่งซื้อและชื่อใหม่ก่อนวันงาน 48 ชั่วโมง ทีมงานแก้ให้ฟรี QR เดิมใช้ได้ต่อ" },
        { q: "ไม่ได้รับลิงก์บัตร?", a: "เข้าสู่ระบบด้วยเบอร์โทรหรืออีเมลที่ใช้ซื้อที่เมนูบัตรของฉัน บัตรทุกใบอยู่ที่นั่น หากยังไม่พบ ส่งสลิปและเบอร์โทรมาทาง LINE" },
        { q: "เช่าพื้นที่จัดงานได้ไหม?", a: "ได้ ทั้งโถงหลัก ห้องเวิร์กช็อป และลานริมน้ำ มีระบบบัตรและทีมเช็กอินให้ใช้ร่วมกัน ส่งรายละเอียดงานผ่านฟอร์มนี้เพื่อรับใบเสนอราคา" },
      ],
    }),
    ...legalPages("Maker Yard Bangkok"),
  ],
  async seed(tx, tenantId) {
    const now = new Date();
    const today = bkkToday(now);
    const D = (n: number, hm: string) => at(addDays(today, n), hm);

    /* ---- events ------------------------------------------------------------------------------------------------- */
    const evRows = await tx
      .insert(events)
      .values([
        {
          tenantId,
          title: "เวิร์กช็อปเครื่องหนังทำมือ: กระเป๋าใบแรกของคุณ",
          slug: "leather-workshop",
          summary: "สี่ชั่วโมงกับช่างเครื่องหนังของ Maker Yard ตัด เย็บ และย้อมขอบกระเป๋าคาร์ดโฮลเดอร์ด้วยมือคุณเอง กลุ่มเล็ก 16 ที่นั่ง รวมอุปกรณ์และหนังฟอกฝาดทั้งหมด",
          description:
            "<p>เวิร์กช็อปสำหรับคนที่ไม่เคยจับเข็มเย็บหนังมาก่อน ภายในสี่ชั่วโมงคุณจะได้ลงมือทุกขั้นตอนด้วยตัวเอง ตั้งแต่เลือกชิ้นหนังฟอกฝาดจากอิตาลี ตัดตามแพตเทิร์น เจาะรู เย็บด้วยเทคนิค saddle stitch สองเข็ม ไปจนถึงขัดและย้อมขอบให้เรียบเงา</p><h3>สิ่งที่ได้กลับบ้าน</h3><ul><li>กระเป๋าคาร์ดโฮลเดอร์หนังแท้ 1 ใบ พร้อมตอกชื่อย่อ</li><li>ชุดเข็มและด้ายลินินสำหรับทำต่อที่บ้าน</li><li>แพตเทิร์นกระดาษอีก 2 แบบ</li></ul><h3>กำหนดการ</h3><ul><li>13:00 ลงทะเบียน กาแฟและขนม</li><li>13:30 รู้จักหนังและเครื่องมือ</li><li>14:00–17:00 ลงมือทำ (พักสั้น ๆ ตามจังหวะ)</li><li>17:00 ถ่ายรูปผลงาน แยกย้าย</li></ul><p><strong>บัตรผู้ติดตาม</strong> สำหรับคนที่มาเป็นเพื่อน นั่งดูและดื่มกาแฟได้ แต่ไม่มีชุดอุปกรณ์</p>",
          cover: IMG.workshop,
          gallery: [IMG.makers, IMG.team],
          category: "เวิร์กช็อป",
          venueName: "ห้องเวิร์กช็อป ชั้น 2 · " + VENUE.name,
          venueAddress: VENUE.address,
          venueMapUrl: VENUE.map,
          organizer: "Maker Yard Studio",
          status: "published",
          featured: false,
          sort: 2,
          startsAt: D(12, "13:00"),
          endsAt: D(12, "17:00"),
          settings: {},
        },
        {
          tenantId,
          title: "Design Talk 2026: ออกแบบเพื่อเมืองที่เดินได้",
          slug: "design-talk-2026",
          summary: "ทอล์กครึ่งวันกับสถาปนิก นักผังเมือง และคนทำแผนที่เดินเท้า ว่าทำไมกรุงเทพฯ ถึงเดินยาก และอะไรที่ย่านเล็ก ๆ ทำได้เองโดยไม่ต้องรอใคร จัดสองรอบ เลือกรอบที่สะดวก",
          description:
            "<p>ปีนี้เราชวนคนที่ลงมือทำจริงมาเล่า: ทีมที่ทำทางเท้าชุมชนในย่านตลาดน้อย นักผังเมืองที่วัดอุณหภูมิทางเท้าทั่วกรุงเทพฯ ด้วยจักรยาน และสตูดิโอที่ออกแบบป้ายบอกทางให้คนเดินในคลองสาน</p><h3>ผู้พูด</h3><ul><li>คุณปรางค์ · สถาปนิกชุมชน ตลาดน้อย</li><li>ดร.วิชญ์ · ผังเมือง จุฬาฯ</li><li>สตูดิโอ Walkable · นักออกแบบข้อมูล</li><li>ช่วงท้าย: วงคุยเปิด ถาม-ตอบ</li></ul><h3>รอบการจัดงาน</h3><p>เนื้อหาทั้งสองรอบเหมือนกัน รอบเช้าวันเสาร์และรอบบ่ายวันอาทิตย์ รองรับรอบละ 120 ที่นั่ง บัตรนักศึกษาแสดงบัตรนักศึกษาที่จุดเช็กอิน</p><p>รวมกาแฟ ขนม และหนังสือรวมบทพูดฉบับพิมพ์</p>",
          cover: IMG.conference,
          gallery: [IMG.talk, IMG.talkStage, IMG.speaker, IMG.lecture],
          category: "สัมมนา",
          venueName: "โถงหลัก · " + VENUE.name,
          venueAddress: VENUE.address,
          venueMapUrl: VENUE.map,
          organizer: "Maker Yard × Walkable Studio",
          status: "published",
          featured: false,
          sort: 3,
          startsAt: D(20, "09:30"),
          endsAt: D(21, "17:00"),
          settings: {},
        },
        {
          tenantId,
          title: "Riverside Live: โฟล์กกลางแจ้งริมเจ้าพระยา",
          slug: "riverside-live",
          summary: "คอนเสิร์ตเล็กริมน้ำหนึ่งคืน สามศิลปินโฟล์กจากเชียงใหม่ ขอนแก่น และกรุงเทพฯ บนลานริมเจ้าพระยาของ Maker Yard ยืนก็ได้ นั่ง VIP แถวหน้าพร้อมเครื่องดื่มก็ได้",
          description:
            "<p>คืนเดียวในปีที่เราเปิดลานริมน้ำทั้งผืนให้ดนตรี เวทีหันหน้าออกแม่น้ำ แสงจากฝั่งตรงข้ามเป็นฉากหลัง เสียงออกแบบให้ไม่รบกวนเพื่อนบ้านแต่ชัดถึงแถวหลังสุด</p><h3>ศิลปิน</h3><ul><li>19:30 สายลม (เชียงใหม่)</li><li>20:30 ตั้ม ตะวันแดง (ขอนแก่น)</li><li>21:30 Hom &amp; The Harbour (กรุงเทพฯ)</li></ul><h3>ประเภทบัตร</h3><ul><li><strong>Regular</strong> ยืน/นั่งพื้นบนลานริมน้ำ นำเสื่อมาเองได้</li><li><strong>VIP</strong> ที่นั่งแถวหน้า 40 ที่ พร้อมเครื่องดื่ม 2 แก้วและโปสเตอร์ลายเซ็น</li><li><strong>Early Bird</strong> ราคาพิเศษสำหรับ 60 ใบแรก ปิดจำหน่ายแล้ว</li><li><strong>บัตรหน้างาน</strong> เปิดจำหน่ายออนไลน์เฉพาะวันงานหากยังมีที่</li></ul><p>ประตูเปิด 18:00 มีอาหารจากร้านในชุมชนและบาร์ริมน้ำ งดนำเครื่องดื่มแอลกอฮอล์จากภายนอก</p>",
          cover: IMG.stage,
          gallery: [IMG.concert, IMG.concertHands, IMG.lights, IMG.party],
          category: "ดนตรี",
          venueName: "ลานริมน้ำ · " + VENUE.name,
          venueAddress: VENUE.address,
          venueMapUrl: VENUE.map,
          organizer: "Maker Yard Live",
          status: "published",
          featured: true,
          sort: 1,
          startsAt: D(33, "19:00"),
          endsAt: D(33, "22:30"),
          settings: {},
        },
        {
          tenantId,
          title: "Khlong San Night Run 2026 — วิ่งการกุศลริมเจ้าพระยา",
          slug: "khlong-san-night-run",
          summary: "วิ่งยามเช้ามืดเลียบแม่น้ำจากคลองสานถึงสะพานพระราม 8 ระยะ 5K และ 10K จบที่โกดังพร้อมข้าวต้มและกาแฟ ครึ่งหนึ่งของรายได้มอบให้โรงเรียนในชุมชน",
          description:
            "<p>งานวิ่งที่ไม่ต้องซีเรียสเรื่องเวลา เส้นทางเลียบเจ้าพระยาปิดการจราจรบางส่วน ปล่อยตัว 05:30 ก่อนแดดออก วิ่งผ่านล้ง 1919 สะพานพุทธ และกลับมาจบที่ลานริมน้ำของ Maker Yard ที่มีข้าวต้ม กาแฟ และดนตรีอะคูสติกรอ</p><h3>ระยะและเวลา</h3><ul><li>10K ปล่อยตัว 05:30 (cut-off 08:00)</li><li>5K Fun Run ปล่อยตัว 06:00</li><li>รับเสื้อและเบอร์วิ่ง: วันงาน 04:30–05:15 ที่โกดัง หรือล่วงหน้าวันเสาร์ก่อนงาน 10:00–18:00</li></ul><h3>ในชุดนักวิ่ง</h3><ul><li>เสื้อวิ่ง เบอร์วิ่งพร้อมชิป เหรียญผู้พิชิต</li><li>อาหารเช้าหลังเส้นชัย</li><li>VIP: เสื้อรุ่นพิเศษ เหรียญทองเหลือง ที่จอดรถในโกดัง และฝากของช่องทางด่วน</li></ul><p>Early Bird 5K จำนวนจำกัด 30 ใบ ขายหมดแล้ว — ขอบคุณที่ตัดสินใจเร็ว</p>",
          cover: IMG.run,
          gallery: [IMG.runners, IMG.runner, IMG.shoes],
          category: "งานวิ่ง",
          venueName: "จุดสตาร์ต/เส้นชัย: " + VENUE.name,
          venueAddress: VENUE.address,
          venueMapUrl: VENUE.map,
          organizer: "Maker Yard × มูลนิธิชุมชนคลองสาน",
          status: "published",
          featured: false,
          sort: 4,
          startsAt: D(48, "05:30"),
          endsAt: D(48, "09:00"),
          settings: {},
        },
        {
          tenantId,
          title: "Maker Market ครั้งที่ 7: ตลาดนัดนักทำริมน้ำ",
          slug: "maker-market-7",
          summary: "ตลาดนัดสองวันของนักทำ 80 ร้าน งานไม้ เซรามิก เครื่องหนัง ผ้าทอ กาแฟคั่วเอง พร้อมเวิร์กช็อปสั้น ๆ ทุกชั่วโมง และดนตรีสดยามเย็น",
          description:
            "<p>ตลาดนัดประจำปีของ Maker Yard ที่รวมนักทำจากทั่วประเทศ 80 ร้านไว้ในโกดังและลานริมน้ำ ทุกชิ้นทำมือ ทุกร้านมีคนทำยืนขายเอง</p><ul><li>เวิร์กช็อปสั้น 45 นาที ทุกชั่วโมง (ลงชื่อหน้างาน)</li><li>โซนอาหารจากร้านในชุมชนคลองสาน</li><li>ดนตรีสดริมน้ำ 17:00–20:00 ทั้งสองวัน</li></ul><p>บัตรเข้างานใช้ได้ทั้งสองวัน เด็กอายุต่ำกว่า 12 ปีเข้าฟรี</p>",
          cover: IMG.market,
          gallery: [IMG.marketStalls, IMG.marketFlowers, IMG.makers],
          category: "ตลาดนัด",
          venueName: VENUE.name,
          venueAddress: VENUE.address,
          venueMapUrl: VENUE.map,
          organizer: "Maker Yard Bangkok",
          status: "ended",
          featured: false,
          sort: 9,
          startsAt: D(-20, "10:00"),
          endsAt: D(-19, "20:00"),
          settings: {},
        },
      ])
      .returning({ id: events.id, slug: events.slug });
    const EV = Object.fromEntries(evRows.map((e) => [e.slug, e.id])) as Record<string, string>;

    /* ---- sessions ----------------------------------------------------------------------------------------------- */
    const sessRows = await tx
      .insert(eventSessions)
      .values([
        { tenantId, eventId: EV["leather-workshop"]!, name: null, startsAt: D(12, "13:00"), endsAt: D(12, "17:00"), doorsOpen: D(12, "12:30"), capacity: 22, status: "scheduled", sort: 0 },
        { tenantId, eventId: EV["design-talk-2026"]!, name: "รอบเช้า วันเสาร์", startsAt: D(20, "09:30"), endsAt: D(20, "13:00"), doorsOpen: D(20, "09:00"), capacity: 120, status: "scheduled", sort: 0 },
        { tenantId, eventId: EV["design-talk-2026"]!, name: "รอบบ่าย วันอาทิตย์", startsAt: D(21, "13:30"), endsAt: D(21, "17:00"), doorsOpen: D(21, "13:00"), capacity: 120, status: "scheduled", sort: 1 },
        { tenantId, eventId: EV["riverside-live"]!, name: null, startsAt: D(33, "19:00"), endsAt: D(33, "22:30"), doorsOpen: D(33, "18:00"), capacity: 400, status: "scheduled", sort: 0 },
        { tenantId, eventId: EV["khlong-san-night-run"]!, name: null, startsAt: D(48, "05:30"), endsAt: D(48, "09:00"), doorsOpen: D(48, "04:30"), capacity: null, status: "scheduled", sort: 0 },
        { tenantId, eventId: EV["maker-market-7"]!, name: null, startsAt: D(-20, "10:00"), endsAt: D(-19, "20:00"), doorsOpen: D(-20, "09:30"), capacity: null, status: "ended", sort: 0 },
      ])
      .returning({ id: eventSessions.id, eventId: eventSessions.eventId, sort: eventSessions.sort });
    const S = (slug: string, sort = 0) => sessRows.find((s) => s.eventId === EV[slug] && s.sort === sort)!.id;

    /* ---- ticket types (prices in satang) ------------------------------------------------------------------------- */
    const tt = (slug: string, key: string, v: Omit<typeof ticketTypes.$inferInsert, "tenantId" | "eventId">) => ({ key, row: { tenantId, eventId: EV[slug]!, ...v } });
    const typeSpecs = [
      tt("leather-workshop", "ws.seat", { name: "บัตรเวิร์กช็อป (รวมอุปกรณ์)", description: "ที่นั่งพร้อมชุดหนัง เครื่องมือ และกาแฟ", price: 189_000, quantity: 16, minPerOrder: 1, maxPerOrder: 4, sort: 0 }),
      tt("leather-workshop", "ws.guest", { name: "ผู้ติดตาม (ไม่ทำชิ้นงาน)", description: "นั่งดูและดื่มกาแฟได้ ไม่มีชุดอุปกรณ์", price: 39_000, quantity: 6, minPerOrder: 1, maxPerOrder: 2, sort: 1 }),
      tt("design-talk-2026", "talk.general", { name: "บัตรทั่วไป", description: "รวมกาแฟ ขนม และหนังสือรวมบทพูด", price: 59_000, quantity: 200, minPerOrder: 1, maxPerOrder: 6, sort: 0 }),
      tt("design-talk-2026", "talk.student", { name: "นักศึกษา", description: "แสดงบัตรนักศึกษาที่จุดเช็กอิน", price: 29_000, quantity: 60, minPerOrder: 1, maxPerOrder: 2, sort: 1 }),
      tt("riverside-live", "live.early", { name: "Early Bird", description: "ราคาพิเศษสำหรับ 60 ใบแรก (ยืน/นั่งพื้น)", price: 69_000, quantity: 60, minPerOrder: 1, maxPerOrder: 4, salesStart: D(-40, "10:00"), salesEnd: D(-3, "23:59"), sort: 0 }),
      tt("riverside-live", "live.regular", { name: "Regular (ยืน / นั่งพื้น)", description: "ลานริมน้ำทั้งผืน นำเสื่อมาเองได้", price: 89_000, quantity: 200, minPerOrder: 1, maxPerOrder: 6, salesEnd: D(33, "20:30"), sort: 1 }),
      tt("riverside-live", "live.vip", { name: "VIP (ที่นั่งแถวหน้า + เครื่องดื่ม 2 แก้ว)", description: "40 ที่นั่งแถวหน้า พร้อมโปสเตอร์ลายเซ็น", price: 249_000, quantity: 24, minPerOrder: 1, maxPerOrder: 10, salesEnd: D(33, "20:30"), sort: 2 }),
      tt("riverside-live", "live.door", { name: "บัตรหน้างาน", description: "เปิดจำหน่ายออนไลน์เฉพาะวันงาน หากยังมีที่", price: 109_000, quantity: 50, minPerOrder: 1, maxPerOrder: 4, salesStart: D(33, "10:00"), salesEnd: D(33, "20:30"), sort: 3 }),
      tt("khlong-san-night-run", "run.early5", { name: "Early Bird 5K", description: "ราคาพิเศษ 30 ใบแรก ชุดนักวิ่งครบ", price: 65_000, quantity: 30, minPerOrder: 1, maxPerOrder: 5, salesStart: D(-30, "10:00"), salesEnd: D(40, "23:59"), sort: 0 }),
      tt("khlong-san-night-run", "run.5k", { name: "5K Fun Run", description: "ปล่อยตัว 06:00 เสื้อ เบอร์วิ่ง เหรียญ อาหารเช้า", price: 79_000, quantity: 300, minPerOrder: 1, maxPerOrder: 5, salesEnd: D(45, "23:59"), sort: 1 }),
      tt("khlong-san-night-run", "run.10k", { name: "10K", description: "ปล่อยตัว 05:30 cut-off 08:00 ชิปจับเวลา", price: 95_000, quantity: 150, minPerOrder: 1, maxPerOrder: 5, salesEnd: D(45, "23:59"), sort: 2 }),
      tt("khlong-san-night-run", "run.vip", { name: "VIP Runner (เสื้อรุ่นพิเศษ + ที่จอดรถ)", description: "เลือกระยะได้หน้างาน เหรียญทองเหลือง ฝากของช่องทางด่วน", price: 190_000, quantity: 30, minPerOrder: 1, maxPerOrder: 4, salesEnd: D(45, "23:59"), sort: 3 }),
      tt("maker-market-7", "mkt.entry", { name: "บัตรเข้างาน (2 วัน)", description: "ใช้ได้ทั้งสองวัน เด็กต่ำกว่า 12 ปีเข้าฟรี", price: 15_000, quantity: 600, minPerOrder: 1, maxPerOrder: 10, salesEnd: D(-19, "18:00"), sort: 0 }),
    ];
    const ttRows = await tx
      .insert(ticketTypes)
      .values(typeSpecs.map((t) => t.row))
      .returning({ id: ticketTypes.id, eventId: ticketTypes.eventId, name: ticketTypes.name, price: ticketTypes.price });
    const TT = Object.fromEntries(typeSpecs.map((t, i) => [t.key, ttRows[i]!])) as Record<string, (typeof ttRows)[number]>;

    /* ---- promo code (10 % off the concert) ---------------------------------------------------------------------- */
    await tx.insert(eventPromoCodes).values([{ tenantId, eventId: EV["riverside-live"]!, code: "RIVER10", kind: "percent", value: 10, maxUses: 50, used: 0, startsAt: D(-10, "00:00"), endsAt: D(33, "20:00"), active: true }]);

    /* ---- customers ---------------------------------------------------------------------------------------------- */
    const custRows = await tx
      .insert(customers)
      .values([
        { tenantId, name: "พิมพ์ชนก อารียา", phone: "0814440001", email: "pimchanok@example.com" },
        { tenantId, name: "ธีรภัทร วงศ์สุวรรณ", phone: "0814440002", email: "teerapat@example.com" },
        { tenantId, name: "ณัฐนันท์ ศรีสุข", phone: "0814440003" },
        { tenantId, name: "กมลชนก บุญมี", phone: "0814440004", email: "kamol@example.com" },
        { tenantId, name: "ศุภกร ตั้งใจ", phone: "0814440005" },
        { tenantId, name: "Emily Chen", phone: "0814440006", email: "emily.c@example.com" },
        { tenantId, name: "วรัญญา พงษ์พานิช", phone: "0814440007", email: "waranya@example.com" },
        { tenantId, name: "ภาณุวัฒน์ แก้วใส", phone: "0814440008" },
        { tenantId, name: "สุพิชญา เลิศวิไล", phone: "0814440009", email: "supitcha@example.com" },
        { tenantId, name: "อนันต์ ทองดี", phone: "0814440010" },
        { tenantId, name: "Daniel Okafor", phone: "0814440011", email: "daniel.o@example.com" },
        { tenantId, name: "ชลธิชา มณีรัตน์", phone: "0814440012", email: "chonticha@example.com" },
      ])
      .returning({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email });

    const HOLDERS = [
      "พิมพ์ชนก อารียา", "ธีรภัทร วงศ์สุวรรณ", "ณัฐนันท์ ศรีสุข", "กมลชนก บุญมี", "ศุภกร ตั้งใจ", "Emily Chen", "วรัญญา พงษ์พานิช", "ภาณุวัฒน์ แก้วใส",
      "สุพิชญา เลิศวิไล", "อนันต์ ทองดี", "Daniel Okafor", "ชลธิชา มณีรัตน์", "กฤตภาส จันทร์เพ็ญ", "ปวีณา สายทอง", "ธนกฤต รุ่งเรือง", "นภัสสร วีระกุล",
      "จิรายุ พูลสวัสดิ์", "อรปรียา แสงจันทร์", "ปัณณวิชญ์ ชัยมงคล", "ชนิกานต์ ภูมิดี", "ภคพล นาคทอง", "ธัญชนก ศิริวงศ์", "วีรภัทร เกษมสุข", "พิชญ์สินี โชติช่วง",
      "Marcus Lee", "Sophie Martin", "กันตพงศ์ อินทร์แก้ว", "มนัสนันท์ คงคา", "รัชชานนท์ ใจดี", "ศิรประภา บัวทอง", "ปรเมศวร์ ทิพย์มณี", "ณิชา สุขสันต์",
      "Ayaka Sato", "ภูริณัฐ ธรรมรักษ์", "อัญชิสา วงศ์วาน", "ธีรเดช พรหมมา", "กัญญาวีร์ ศักดิ์ศรี", "พงศกร ลิ้มเจริญ", "เบญญาภา สุวรรณ", "คณิศร เมฆขาว",
    ];
    let holderCursor = 0;
    const nextHolder = () => HOLDERS[holderCursor++ % HOLDERS.length]!;

    /* ---- orders + tickets --------------------------------------------------------------------------------------- */
    const usedCodes = new Set<string>();
    const sold = new Map<string, number>(); // ticketTypeId → paid qty
    const reserved = new Map<string, number>(); // ticketTypeId → pending qty
    const sessSold = new Map<string, number>();
    const sessReserved = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

    type OrderStatus = "pending" | "paid" | "cancelled" | "refunded" | "expired";
    interface OrderSpec {
      slug: string;
      sessionId: string;
      lines: Array<[typeKey: string, qty: number]>;
      status: OrderStatus;
      /** days before today the order was placed */
      daysAgo: number;
      customer?: number;
      guest?: { name: string; phone: string; email?: string };
      checkedIn?: boolean;
      note?: string;
      promo?: { code: string; percent: number };
      refundReason?: string;
    }

    const placeOrder = async (o: OrderSpec) => {
      const cust = o.guest ? null : custRows[(o.customer ?? 0) % custRows.length]!;
      const contactName = o.guest?.name ?? cust!.name!;
      const contactPhone = o.guest ? o.guest.phone : (cust!.phone ?? null);
      const contactEmail = o.guest ? (o.guest.email ?? null) : (cust!.email ?? null);
      const lines = o.lines.map(([k, qty]) => {
        const t = TT[k]!;
        return { ticketTypeId: t.id, name: t.name, unitPrice: t.price, qty, total: t.price * qty };
      });
      const quantity = lines.reduce((s, l) => s + l.qty, 0);
      const subtotal = lines.reduce((s, l) => s + l.total, 0);
      const discount = o.promo ? Math.round((subtotal * o.promo.percent) / 100) : 0;
      const total = subtotal - discount;
      const createdAt = new Date(now.getTime() - o.daysAgo * DAY_MS - randomInt(0, 8 * 3_600_000));
      const paid = o.status === "paid" || o.status === "refunded";
      const holders = lines.flatMap((l) => Array.from({ length: l.qty }, (_, i) => ({ ticketTypeId: l.ticketTypeId, name: i === 0 ? contactName : nextHolder() })));
      const number = `TK-${await nextCounter(tx, tenantId, "ticket_order", 1000)}`;
      const [order] = await tx
        .insert(ticketOrders)
        .values({
          tenantId,
          number,
          eventId: EV[o.slug]!,
          sessionId: o.sessionId,
          customerId: cust?.id ?? null,
          contactName,
          contactPhone,
          contactEmail,
          lines,
          quantity,
          subtotal,
          discount,
          total,
          paidAmount: paid ? total : 0,
          refundedAmount: o.status === "refunded" ? total : 0,
          status: o.status,
          source: "online",
          promoCode: o.promo?.code ?? null,
          paymentId: null,
          accessKey: accessKey(),
          note: o.note ?? null,
          metadata: { holders, paymentMethod: total === 0 ? "free" : "promptpay_qr", promo: o.promo ? { code: o.promo.code, kind: "percent", value: o.promo.percent } : null, seededSample: true },
          holdUntil: o.status === "pending" ? new Date(now.getTime() + 18 * 60_000) : o.status === "expired" ? new Date(createdAt.getTime() + 35 * 60_000) : null,
          paidAt: paid ? new Date(createdAt.getTime() + 6 * 60_000) : null,
          cancelledAt: o.status === "cancelled" ? new Date(createdAt.getTime() + 40 * 60_000) : null,
          cancelReason: o.status === "cancelled" ? "ซื้อซ้ำโดยไม่ตั้งใจ" : null,
          cancelledBy: o.status === "cancelled" ? "customer" : null,
          createdAt,
          updatedAt: createdAt,
        })
        .returning({ id: ticketOrders.id });
      if (o.status === "pending") {
        for (const l of lines) bump(reserved, l.ticketTypeId, l.qty);
        bump(sessReserved, o.sessionId, quantity);
      }
      if (!paid) return;
      for (const l of lines) bump(sold, l.ticketTypeId, l.qty);
      bump(sessSold, o.sessionId, quantity);
      // per-ticket price: proportional discount, the last ticket absorbs rounding (same as splitTicketPrices)
      const unitPrices = lines.flatMap((l) => Array.from({ length: l.qty }, () => l.unitPrice));
      const prices = unitPrices.map((p) => (subtotal ? Math.round((p * total) / subtotal) : 0));
      const drift = total - prices.reduce((s, p) => s + p, 0);
      if (prices.length) prices[prices.length - 1]! += drift;
      const ticketStatus = o.status === "refunded" ? "refunded" : o.checkedIn ? "checked_in" : "valid";
      const checkInAt = o.checkedIn ? new Date(D(-20, "10:00").getTime() + randomInt(5, 420) * 60_000) : null;
      await tx.insert(tickets).values(
        holders.map((h, i) => ({
          tenantId,
          orderId: order!.id,
          eventId: EV[o.slug]!,
          sessionId: o.sessionId,
          ticketTypeId: h.ticketTypeId,
          code: ticketCode(usedCodes),
          holderName: h.name,
          holderEmail: i === 0 ? contactEmail : null,
          price: prices[i] ?? 0,
          status: ticketStatus,
          checkedInAt: checkInAt,
          checkedInBy: checkInAt ? "ประตู A" : null,
          voidReason: o.status === "refunded" ? (o.refundReason ?? "คืนเงินตามคำขอ") : null,
          createdAt,
          updatedAt: checkInAt ?? createdAt,
        })),
      );
    };

    /** n paid orders of one ticket type, cycling customers and quantities */
    const bulk = async (slug: string, sessionId: string, typeKey: string, n: number, qtys: number[], firstDaysAgo: number, extra: Partial<OrderSpec> = {}) => {
      for (let i = 0; i < n; i++) {
        await placeOrder({ slug, sessionId, lines: [[typeKey, qtys[i % qtys.length]!]], status: "paid", daysAgo: Math.max(0, firstDaysAgo - Math.floor((i * firstDaysAgo) / Math.max(1, n))), customer: i + 1, ...extra });
      }
    };

    const live = S("riverside-live");
    const run = S("khlong-san-night-run");
    const ws = S("leather-workshop");
    const talkAm = S("design-talk-2026", 0);
    const talkPm = S("design-talk-2026", 1);
    const mkt = S("maker-market-7");

    // Riverside Live: early bird sold 36 of 60 then the window closed; VIP 18 of 24 (6 left); regular 42 of 200
    await bulk("riverside-live", live, "live.early", 12, [3, 3, 4, 2], 38);
    await bulk("riverside-live", live, "live.vip", 6, [3, 3, 2, 4, 3, 3], 25);
    await bulk("riverside-live", live, "live.regular", 13, [3, 2, 4, 3, 1, 2, 3], 20);
    // the showcase customer (พิมพ์ชนก): VIP + regular in one order with the promo, plus an unpaid order holding 2 regular right now
    await placeOrder({ slug: "riverside-live", sessionId: live, lines: [["live.vip", 1], ["live.regular", 2]], status: "paid", daysAgo: 4, customer: 0, promo: { code: "RIVER10", percent: 10 }, note: "ขอที่นั่ง VIP ริมทางเดินค่ะ" });
    await placeOrder({ slug: "riverside-live", sessionId: live, lines: [["live.regular", 2]], status: "pending", daysAgo: 0, customer: 4 });
    // a cancelled and an expired one for the history views
    await placeOrder({ slug: "riverside-live", sessionId: live, lines: [["live.vip", 1]], status: "cancelled", daysAgo: 6, customer: 7 });
    await placeOrder({ slug: "riverside-live", sessionId: live, lines: [["live.regular", 1]], status: "expired", daysAgo: 2, guest: { name: "สมชาย ใจเย็น", phone: "0899990001" } });

    // Night Run: early bird 5K sold out (30/30), 5K 15, 10K 12, VIP 6
    await bulk("khlong-san-night-run", run, "run.early5", 10, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], 28);
    await bulk("khlong-san-night-run", run, "run.5k", 5, [3, 2, 4, 3, 3], 14);
    await bulk("khlong-san-night-run", run, "run.10k", 4, [3, 3, 2, 4], 12);
    await bulk("khlong-san-night-run", run, "run.vip", 2, [3, 3], 9);
    await placeOrder({ slug: "khlong-san-night-run", sessionId: run, lines: [["run.10k", 1]], status: "paid", daysAgo: 7, customer: 0 });

    // Design Talk: 27 general across both sessions, 8 students; one refunded order (requested within the policy window)
    await bulk("design-talk-2026", talkAm, "talk.general", 5, [3, 3, 3, 3, 3], 16);
    await bulk("design-talk-2026", talkPm, "talk.general", 4, [3, 3, 3, 3], 15, { customer: 6 });
    await bulk("design-talk-2026", talkAm, "talk.student", 2, [2, 2], 10, { customer: 9 });
    await bulk("design-talk-2026", talkPm, "talk.student", 2, [2, 2], 9, { customer: 3 });
    await placeOrder({ slug: "design-talk-2026", sessionId: talkPm, lines: [["talk.general", 2]], status: "refunded", daysAgo: 11, customer: 11, refundReason: "ลูกค้าติดภารกิจ แจ้งล่วงหน้าเกิน 7 วัน" });

    // Leather workshop: 9 of 16 seats, 2 companions
    await bulk("leather-workshop", ws, "ws.seat", 4, [3, 2, 2, 2], 9);
    await placeOrder({ slug: "leather-workshop", sessionId: ws, lines: [["ws.guest", 2]], status: "paid", daysAgo: 5, customer: 2 });

    // past Maker Market: 36 entries, all checked in on the day
    await bulk("maker-market-7", mkt, "mkt.entry", 12, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], 27, { checkedIn: true });
    await placeOrder({ slug: "maker-market-7", sessionId: mkt, lines: [["mkt.entry", 2]], status: "paid", daysAgo: 24, customer: 0, checkedIn: true });

    /* ---- counters: sold / reserved per ticket type and per session ---------------------------------------------- */
    for (const t of ttRows) {
      await tx.update(ticketTypes).set({ sold: sold.get(t.id) ?? 0, reserved: reserved.get(t.id) ?? 0 }).where(eq(ticketTypes.id, t.id));
    }
    for (const s of sessRows) {
      await tx.update(eventSessions).set({ sold: sessSold.get(s.id) ?? 0, reserved: sessReserved.get(s.id) ?? 0 }).where(eq(eventSessions.id, s.id));
    }
  },
};
