import type { TemplateDefinition, TemplatePage } from "@rentweb/core/tenant";
import { customers, nextCounter, rentalBlockedDates, rentalExtras, rentalRateRules, rentalStays, rentalUnitTypes } from "@rentweb/db";
import { section, features, imageText, testimonials, faq, cta, gallery, steps, contact, staySearch, roomGrid, hero, text, stickyStory, interlude } from "@rentweb/storefront/definitions";
import { aboutPage, legalPages, u, avatar } from "./shared";

/*
 * Hotel / resort template: "บ้านทะเล เขาหลัก" (Baan Talay Khao Lak) – a 21-key boutique resort on Khuk Khak beach,
 * Khao Lak (Phang-nga), built on the rental module: unit types with N identical units, nightly rate rules
 * (high season / weekends / New Year), blocked dates, extras and sample stays. Dates are civil Bangkok dates
 * (YYYY-MM-DD, check-out exclusive) – the same convention as packages/modules/rental/src/services/time.ts.
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
function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function eachNight(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}
/** instant of a Bangkok civil time ("14:00") on a date */
function bkkTime(ymd: string, hm: string): Date {
  const [h, mi] = hm.split(":").map(Number) as [number, number];
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, h, mi) - BKK_MS);
}
const roundBaht = (satang: number) => Math.round(satang / 100) * 100;
const accessKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, "").slice(0, 32);

const IMG = {
  hero: u("1540541338287-41700207dee6", 1900),
  heroSecondary: u("1520250497591-112f2f40a3f4", 900),
  beach: u("1507525428034-b723cf961d3e", 1400),
  pool: u("1571896349842-33c89424de2d", 1400),
  poolDusk: u("1566073771259-6a8506099945", 1400),
  // qa-c: was 1559599238-308793637427 (a city-hotel bedroom, tufted headboard + gilt mirror) under every "พูลวิลล่า" label →
  // a tropical villa with its own pool, sun beds and shuttered sala (200 + viewed)
  villaPool: u("1582610116397-edb318620f90", 1200),
  // qa-c: the pool-access suite led with a city-hotel bedroom → curtained cabanas on an infinity pool at dusk (200 + viewed)
  suitePool: u("1571003123894-1f0594d2b5d9", 1200),
  garden: u("1582719478250-c89cae4dc85b", 1200),
  seaview: u("1611892440504-42a792e24d32", 1200),
  suite: u("1590490360182-c33d57733427", 1200),
  family: u("1618773928121-c32242e63f39", 1200),
  bedroom: u("1631049307264-da0ec9d70304", 1200),
  bathroom: u("1615460549969-36fa19521a4f", 1200),
  // qa-c: was 1544148103-0773bf10d330 (a dim city cafe with diners) → an open seaside dining terrace at golden hour (200 + viewed)
  breakfast: u("1559339352-11d035aa65de", 1400),
  dining: u("1414235077428-338989a2e8c0", 1400),
  spa: u("1544161515-4ab6ce6db874", 1400),
  palms: u("1519046904884-53103b34b206", 1400),
  swing: u("1468413253725-0d5181091126", 1200),
  aerial: u("1506929562872-bb421503ef21", 1600),
  // the same bay mirrored (imgix flip): sand on the left under the copy, turquoise water and boats on the right
  aerialFlip: u("1506929562872-bb421503ef21", 1600, "&flip=h"),
  sunset: u("1499793983690-e29da59ef1c2", 1400),
};

/**
 * qa-c: the shared About page is a scroll-lit statement + a contact card (text only) → the demo copy gets a polaroid album
 * of the bay between the two (photos already used on the site; new shops keep the neutral text-only page).
 */
function withAlbum(page: TemplatePage): TemplatePage {
  const album = section(gallery, {
    heading: "อัลบั้มบ้านทะเล",
    subheading: "หาดคึกคักตั้งแต่แสงแรกจนถึงมื้อค่ำ ลากรูปเล่นได้ตามใจ",
    layout: "polaroid",
    images: [
      { url: IMG.beach, alt: "แสงอาทิตย์ยามเย็นบนหาดคึกคัก", caption: "หาดหน้าบ้าน ตอนเย็น" },
      { url: IMG.villaPool, alt: "ศาลาริมสระของพูลวิลล่า", caption: "ศาลาริมสระ" },
      { url: IMG.aerial, alt: "มุมสูงของอ่าวน้ำใส", caption: "อ่าวหน้ารีสอร์ตจากมุมสูง" },
      { url: IMG.breakfast, alt: "ห้องอาหารริมทะเล", caption: "มื้อเช้าริมทะเล" },
      { url: IMG.swing, alt: "ต้นมะพร้าวริมหาด", caption: "ทางเดินใต้ต้นมะพร้าว" },
      { url: IMG.poolDusk, alt: "บาร์ริมสระตอนพลบค่ำ", caption: "บาร์ริมสระตอนพลบค่ำ" },
    ],
  });
  const sections = page.sections ?? [];
  return { ...page, sections: [...sections.slice(0, -1), album, ...sections.slice(-1)] };
}

export const hotel: TemplateDefinition = {
  key: "hotel",
  name: { th: "โรงแรม / รีสอร์ต / บ้านพัก", en: "Hotel & resort" },
  description: {
    th: "จองห้องพักแบบเลือกวันเช็กอิน–เช็กเอาต์ ประเภทห้องหลายหลัง ราคาตามฤดูกาลและวันหยุด ปฏิทินห้องว่าง บริการเสริม มัดจำผ่านพร้อมเพย์ หน้าเช็กอิน/เช็กเอาต์หลังบ้าน — โรงแรม รีสอร์ต วิลล่า โฮมสเตย์ บ้านพักตากอากาศ",
    en: "Date-range stays with unit types, seasonal and weekend rates, availability calendar, extras, PromptPay deposit and a front-desk back office — hotels, resorts, villas, homestays, holiday homes",
  },
  category: "hospitality",
  siteType: "hotel",
  modules: ["rental"],
  themePreset: "riviera",
  // ADMIN_B2-07: the sample brand; new (non-demo) properties get their own name instead
  sampleBrand: ["Baan Talay Khao Lak", "บ้านทะเล เขาหลัก", "บ้านทะเล"],
  // AC-02: the sample resort's location / travel / opening copy; new (non-demo) properties get a neutral line
  neutralText: [
    ["บูทีครีสอร์ตริมหาดคึกคัก · เขาหลัก พังงา", "บูทีครีสอร์ตริมทะเล"],
    ["บนหาดคึกคักที่เงียบที่สุดของเขาหลัก", "บนชายหาดเงียบสงบ"],
    ["ห่างจากสนามบินภูเก็ตเพียง 75 นาที", "เดินทางสะดวกจากสนามบิน"],
    ["ปลายหาดที่เงียบที่สุดของเขาหลัก", "ปลายหาดที่เงียบสงบ"],
    ["อุทยานแห่งชาติเขาหลัก-ลำรู่", "อุทยานแห่งชาติใกล้เคียง"],
    ["หมู่เกาะสิมิลัน", "เกาะใกล้เคียง"],
    ["ตลาดบางเนียง", "ตลาดท้องถิ่น"],
    ["สนามบินภูเก็ต", "สนามบิน"],
    ["หาดคึกคัก", "ชายหาด"],
    ["เขาหลัก พังงา", "ริมทะเล"],
    ["เขาหลัก", "ที่พัก"],
    ["เรือสปีดโบ๊ตไปสิมิลันออกจากท่าเรือทับละมุ ห่างจากรีสอร์ต 20 นาที", "ทัวร์เกาะมีเรือรับส่งจากท่าเรือใกล้ที่พัก"],
    ["ใช้เวลาประมาณ 75 นาทีจากสนามบินภูเก็ต", "เดินทางสะดวกจากสนามบิน"],
    ["ใช้ทางหลวงหมายเลข 4 มุ่งหน้าตะกั่วป่า เลี้ยวซ้ายเข้าหาดคึกคักตามป้ายรีสอร์ต มีที่จอดรถในร่มฟรี", "มีที่จอดรถในร่มฟรีสำหรับแขกทุกท่าน"],
    ["รถตู้ภูเก็ต–เขาหลักออกทุกชั่วโมง ลงป้ายบางเนียงแล้วเรียกรถรับส่งของรีสอร์ตได้ฟรี", "แจ้งล่วงหน้าเพื่อให้รีสอร์ตจัดรถรับส่งจากจุดลงรถ"],
  ],
  recommendedPresets: ["riviera", "porcelain", "zen"],
  complexity: 4,
  previewImage: IMG.hero,
  settings: {
    tagline: "บูทีครีสอร์ตริมหาดเขาหลัก",
    contact: {
      phone: "076-443-888",
      lineId: "@baantalay",
      email: "stay@baantalay.com",
      address: "99/9 ถ.เพชรเกษม ต.คึกคัก อ.ตะกั่วป่า จ.พังงา 82190",
      mapUrl: "https://www.google.com/maps?q=Khuk+Khak+Beach+Khao+Lak&output=embed",
      hours: [
        { day: "แผนกต้อนรับ", time: "ตลอด 24 ชั่วโมง" },
        { day: "ห้องอาหารริมหาด", time: "07:00 – 22:00" },
        { day: "สปาและสระว่ายน้ำ", time: "08:00 – 20:00" },
      ],
      instagram: "https://instagram.com",
      facebook: "https://facebook.com",
    },
    header: { cta: { label: "จองห้องพัก", href: "/stay" } },
    payments: {
      promptpayId: "0891234567",
      promptpayName: "Baan Talay Khao Lak",
      bankAccounts: [{ bank: "กสิกรไทย", name: "บจก. บ้านทะเล เขาหลัก", number: "089-1-23456-7" }],
      enabled: { promptpay: true, bankTransfer: true },
    },
  },
  moduleConfig: {
    rental: { checkInTime: "14:00", checkOutTime: "12:00", freeCancelDays: 7, depositPercent: 30, allowFullPayment: true, allowPayAtProperty: false, maxAdvanceDays: 365, maxNights: 21, holdMinutes: 30 },
  },
  navigation: {
    header: [
      { label: "ห้องพัก", href: "/rooms" },
      { label: "สิ่งอำนวยความสะดวก", href: "/facilities" },
      { label: "ที่ตั้ง", href: "/location" },
      { label: "เรื่องราวของเรา", href: "/about" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "ห้องพักและวิลล่า", href: "/rooms" },
      { label: "ค้นหาห้องว่าง", href: "/stay" },
      { label: "สิ่งอำนวยความสะดวก", href: "/facilities" },
      { label: "ที่ตั้งและการเดินทาง", href: "/location" },
      { label: "การเข้าพักของฉัน", href: "/account/stays" },
      { label: "ติดต่อเรา", href: "/contact" },
    ],
  },
  pages: [
    {
      slug: "home",
      title: "หน้าแรก",
      kind: "home",
      sections: [
        // §5.9 signature: golden-hour photo on top, live WebGL sea in the lower band, glass date bar on the water
        section(staySearch, {
          variant: "fullscreen",
          eyebrow: "บูทีครีสอร์ตริมหาดคึกคัก · เขาหลัก พังงา",
          heading: "ตื่นมาพร้อมเสียงคลื่น\nที่บ้านทะเล",
          subheading: "พูลวิลล่าริมหาด อาหารเช้าสั่งทำทีละจาน และทีมงานที่จำชื่อคุณได้ตั้งแต่คืนแรก",
          image: { url: IMG.beach, alt: "แสงอาทิตย์ยามเย็นบนหาดคึกคัก" },
          imageSecondary: { url: IMG.heroSecondary, alt: "พูลวิลล่า" },
          badges: ["หาดส่วนตัว", "อาหารเช้าริมทะเล", "รถรับส่งสนามบิน"],
          stats: [
            { value: "180 ม.", label: "หาดส่วนตัว" },
            { value: "4.9", label: "คะแนนจากแขก" },
            { value: "75 นาที", label: "จากสนามบินภูเก็ต" },
          ],
          overlay: 0.3,
        }),
        section(text, {
          eyebrow: "ที่บ้านทะเล",
          body: "21 ห้องพักและพูล\u2060วิลล่า บนหาดคึกคักที่เงียบที่สุดของเขาหลัก",
          align: "center",
          size: "large",
        }),
        section(roomGrid, {
          eyebrow: "ห้องพัก",
          heading: "เลือกมุมที่ใช่ของคุณ",
          subheading: "ตั้งแต่ห้องดีลักซ์ในสวนไปจนถึงพูลวิลล่าหน้าหาด ทุกหลังมีระเบียง เครื่องนอนผ้าฝ้ายอียิปต์ และเครื่องชงกาแฟ",
          variant: "editorial",
          limit: 6,
        }),
        section(stickyStory, {
          eyebrow: "หนึ่งวันที่บ้านทะเล",
          heading: "วันหยุดที่ไม่ต้องรีบไปไหน",
          subheading: "ทุกอย่างอยู่ห่างกันไม่เกินสองนาทีเดิน ทรายอยู่ปลายเท้า อาหารอยู่ปลายมือ",
          mediaStyle: "full",
          side: "right",
          // §5.9 creative signature: the stage light follows the time of day of the active step
          tones: "time-of-day",
          items: [
            { kicker: "เช้า", title: "อาหารเช้าริมทะเล", body: "ตื่นตามใจ แล้วเดินลงหาดที่เงียบที่สุดของวัน อาหารเช้าสั่งทำทีละจานรออยู่ที่ห้องอาหารริมหาด บนระเบียงห้อง หรือริมสระส่วนตัว", image: IMG.swing, chips: ["สั่งทำทีละจาน", "เสิร์ฟถึงระเบียง"] },
            { kicker: "บ่าย", title: "สระและหาดส่วนตัว", body: "หาดส่วนตัว 180 เมตร เตียงอาบแดด ร่ม และผ้าเช็ดตัวจัดไว้ให้ทุกวัน สระอินฟินิตี้หันหน้าออกทะเล และสปาใต้ต้นมะพร้าวหลังวันแดดแรง", image: IMG.heroSecondary, chips: ["สระอินฟินิตี้", "สปา", "Wi-Fi ถึงชายหาด"] },
            { kicker: "เย็น", title: "พระอาทิตย์ตกที่ท่าเรือ", body: "เดินเลียบหาดไปปลายท่าเรือไม้ตอนแดดเริ่มอ่อน ดูฟ้าเปลี่ยนเป็นสีทองพร้อมเครื่องดื่มเย็น\u00a0ๆ จากบาร์ริมสระ", image: IMG.poolDusk, chips: ["บาร์ริมสระ"] },
            { kicker: "ค่ำ", title: "ดินเนอร์ใต้แสงเทียน", body: "ซีฟู้ดจากเรือประมงท้องถิ่นในมื้อเย็น หรือเลือกดินเนอร์ริมหาดใต้แสงเทียนเป็นบริการเสริมตอนจองห้อง", image: IMG.dining, chips: ["ซีฟู้ดท้องถิ่น", "บริการเสริม"], href: "/rooms" },
          ],
        }),
        section(imageText, {
          eyebrow: "อาหารเช้า",
          heading: "อาหารเช้าที่เสิร์ฟตามเวลาของคุณ",
          body: "ไม่มีบุฟเฟต์ที่ต้องรีบตื่น เลือกจากเมนูอาหารเช้าสั่งทำได้จนถึงสาย\u00a0ๆ ทั้งข้าวต้มปลา แพนเค้กกล้วยหอม ไข่เบเนดิกต์ และผลไม้จากสวนในพังงา เสิร์ฟที่ห้องอาหารริมหาด บนระเบียงห้องของคุณ หรือริมสระส่วนตัวก็ได้",
          image: { url: IMG.breakfast, alt: "อาหารเช้าริมทะเล" },
          imagePosition: "left",
          bullets: ["สั่งทำทีละจานจากเมนูกว่า 20 รายการ", "กาแฟดริปจากเมล็ดเชียงรายและชาใบเตยหอมของรีสอร์ต", "เสิร์ฟที่ห้องอาหาร ระเบียงห้อง หรือริมสระวิลล่า"],
          cta: { label: "ดูบริการเสริมทั้งหมด", href: "/facilities" },
          style: "overlap",
        }),
        section(gallery, {
          heading: "บรรยากาศที่บ้านทะเล",
          subheading: "แสงเช้าบนหาด สระอินฟินิตี้ยามเย็น และมุมโปรดของแขกที่กลับมาซ้ำ",
          layout: "filmstrip",
          columns: 3,
          images: [
            { url: IMG.hero, alt: "สระอินฟินิตี้ริมทะเลยามเย็น" },
            { url: IMG.sunset, alt: "ศาลาริมหาดยามเย็น" },
            { url: IMG.villaPool, alt: "พูลวิลล่าหน้าหาด" },
            { url: IMG.palms, alt: "ชายหาดขาวใต้ต้นมะพร้าว" },
            { url: IMG.pool, alt: "สระว่ายน้ำยามค่ำ" },
            { url: IMG.bedroom, alt: "ห้องนอนดีลักซ์" },
            { url: IMG.spa, alt: "ห้องสปา" },
          ],
        }),
        section(testimonials, {
          eyebrow: "เสียงจากแขก",
          heading: "คืนแรกที่หลับสนิทในรอบหลายเดือน",
          variant: "spotlight",
          items: [
            { quote: "เสียงคลื่นดังพอให้หลับ ไม่ดังจนตื่น อาหารเช้าริมหาดคือไฮไลต์ สั่งข้าวต้มปลาได้ทุกวันโดยไม่ต้องเกรงใจ", name: "คุณพลอย", role: "พูลวิลล่า · 4 คืน", avatar: avatar("ploy-hotel"), rating: 5 },
            { quote: "พาพ่อแม่มาพักครั้งแรก ทีมงานเตรียมเก้าอี้ริมสระให้ท่านตั้งแต่ก่อนขอ รถรับส่งสนามบินตรงเวลา ขับนุ่ม", name: "คุณธนา", role: "แฟมิลี่วิลล่า · 3 คืน", avatar: avatar("thana-hotel"), rating: 5 },
            { quote: "ทำงานจากระเบียงห้องซีวิวได้ทั้งสัปดาห์ เน็ตเร็ว กาแฟดี และเดินลงหาดได้ทุกเย็นหลังเลิกงาน", name: "คุณมิว", role: "ดีลักซ์ ซีวิว · 7 คืน", avatar: avatar("mew-hotel"), rating: 5 },
          ],
        }),
        section(faq, {
          heading: "ก่อนเดินทาง",
          items: [
            { q: "เช็กอินและเช็กเอาต์เวลาใด?", a: "เช็กอินช่วงบ่ายและเช็กเอาต์ก่อนเที่ยง หากต้องการเช็กอินเร็วหรือเช็กเอาต์ช้า แจ้งล่วงหน้าได้ เราจัดให้ตามห้องว่างหรือเลือกบริการเลทเช็กเอาต์ในขั้นตอนจอง" },
            { q: "ต้องชำระเงินอย่างไร?", a: "ชำระมัดจำ 30% ผ่านพร้อมเพย์หรือโอนเงินเพื่อยืนยันการจอง ส่วนที่เหลือชำระเมื่อเช็กอิน หรือเลือกชำระเต็มจำนวนออนไลน์ก็ได้" },
            { q: "ยกเลิกการจองได้ไหม?", a: "ยกเลิกฟรีจนถึง 7 วันก่อนวันเช็กอิน คืนเงินมัดจำเต็มจำนวน หลังจากนั้นขอสงวนสิทธิ์เก็บค่ามัดจำ เปลี่ยนวันเข้าพักได้หนึ่งครั้งโดยไม่มีค่าใช้จ่าย" },
            { q: "รับเด็กเล็กและสัตว์เลี้ยงหรือไม่?", a: "เด็กอายุไม่เกิน 6 ปีพักฟรีเมื่อใช้เตียงเดิม มีเตียงเด็กให้ยืม ส่วนสัตว์เลี้ยงรับเฉพาะวิลล่าหน้าหาด แจ้งล่วงหน้าเพื่อเตรียมที่นอนและชาม" },
          ],
        }),
        // closing moment: the turquoise bay from above, rippling under the pointer (water-ripple scene)
        section(interlude, {
          scene: "water-ripple",
          heading: "ให้ทะเลเป็น\nคนปลุกคุณ",
          body: "เลือกวันเช็กอิน–เช็กเอาต์ ดูราคาต่อคืนแบบเห็นทุกบรรทัด แล้วยืนยันการจองด้วยมัดจำผ่านพร้อมเพย์ภายในไม่กี่นาที",
          cta: { label: "ค้นหาห้องว่าง", href: "/stay" },
          image: { url: IMG.aerialFlip, alt: "มุมสูงของอ่าวน้ำใสและหาดทราย" },
          height: "screen",
          // photo-first scrim: the turquoise bay stays vivid, the statement sits centred at the bottom in light text
          align: "center",
          scrim: "photo",
        }),
      ],
    },
    {
      slug: "facilities",
      title: "สิ่งอำนวยความสะดวก",
      sections: [
        section(hero, {
          variant: "editorial",
          eyebrow: "สิ่งอำนวยความสะดวก",
          heading: "ทุกอย่างที่ต้องการ\nอยู่ห่างแค่สองนาทีเดิน",
          subheading: "สระอินฟินิตี้ยาว 30 เมตร ห้องอาหารริมหาด สปา ฟิตเสนต์เปิดโล่ง และบริการที่ทำให้วันหยุดของคุณไม่ต้องวางแผนอะไรเลย",
          primaryCta: { label: "จองห้องพัก", href: "/stay" },
          secondaryCta: { label: "ดูห้องพัก", href: "/rooms" },
          image: { url: IMG.pool, alt: "สระอินฟินิตี้ของรีสอร์ต" },
          background: "none",
          // qa-c: the auto (ocean) scene filled the frame with a pale grey sea and shrank the pool photo to an inset → the
          // pool photo itself fills the frame and ripples under the pointer (one canvas, lazy; photo only when 3D is off)
          scene: "water-ripple",
        }),
        section(features, {
          eyebrow: "ในรีสอร์ต",
          heading: "สิ่งอำนวยความสะดวกหลัก",
          variant: "cards",
          columns: 4,
          items: [
            { icon: "Waves", title: "สระอินฟินิตี้", description: "สระน้ำเกลือยาว 30 เมตรหันหน้าออกทะเล พร้อมสระเด็กและบาร์ริมสระ" },
            { icon: "UtensilsCrossed", title: "ห้องอาหารริมหาด", description: "อาหารเช้าสั่งทำ อาหารใต้ และซีฟู้ดย่างในมื้อเย็น มีเมนูมังสวิรัติและเมนูเด็ก" },
            { icon: "Flower2", title: "สปา", description: "ศาลานวด 4 หลังใต้ต้นมะพร้าว นวดไทย อโรมา และทรีตเมนต์หลังอาบแดด" },
            { icon: "Dumbbell", title: "ฟิตเนสเปิดโล่ง", description: "อุปกรณ์ครบ เปิดตลอดวัน มีโยคะริมหาดทุกเช้าวันเสาร์" },
            { icon: "Bike", title: "จักรยาน", description: "ยืมฟรี ปั่นเลียบหาดไปตลาดเช้าหรือร้านกาแฟในหมู่บ้าน" },
            { icon: "Shirt", title: "ซักรีด", description: "ส่งเช้าได้เย็น คิดตามชิ้น มีบริการรีดด่วนสำหรับงานเลี้ยง" },
            { icon: "Car", title: "ที่จอดรถในร่ม", description: "ฟรีสำหรับแขกทุกท่าน มีจุดชาร์จรถยนต์ไฟฟ้า 2 จุด" },
            { icon: "ConciergeBell", title: "คอนเซียร์จ", description: "จองทัวร์เกาะ ดำน้ำ ร้านอาหาร และรถเช่าให้ พร้อมคำแนะนำจากคนท้องถิ่น" },
          ],
        }),
        section(imageText, {
          eyebrow: "บริการเสริม",
          heading: "เพิ่มได้ตอนจอง\nไม่ต้องจำไปขอหน้างาน",
          body: "ทุกบริการเสริมเลือกได้ในขั้นตอนจองห้อง ราคาปรากฏในสรุปยอดทันที และทีมงานเตรียมไว้ให้ก่อนคุณมาถึง",
          image: { url: IMG.villaPool, alt: "พูลวิลล่า" },
          imagePosition: "right",
          bullets: ["อาหารเช้า – คิดต่อท่านต่อคืน", "รถรับส่งสนามบินแบบส่วนตัว – คิดต่อเที่ยว", "เลทเช็กเอาต์ถึงบ่ายแก่ – คิดต่อการเข้าพัก", "เตียงเสริม – คิดต่อคืน", "ดินเนอร์ริมหาดใต้แสงเทียน – คิดต่อการเข้าพัก"],
          cta: { label: "เลือกห้องแล้วเพิ่มบริการเสริม", href: "/rooms" },
          style: "card",
        }),
        section(imageText, {
          eyebrow: "สปา",
          heading: "หลังวันแดดแรง\nให้มือที่ชำนาญดูแลต่อ",
          body: "สปาของเราใช้มะพร้าว ขมิ้น และตะไคร้จากสวนในพังงา ทรีตเมนต์หลังอาบแดดช่วยลดอาการแสบร้อนภายในชั่วโมงเดียว จองรอบได้ที่แผนกต้อนรับหรือแจ้งตอนเช็กอิน",
          image: { url: IMG.spa, alt: "ห้องสปา" },
          imagePosition: "left",
          style: "plain",
        }),
        section(cta, { variant: "card", heading: "พร้อมพักผ่อนแล้วใช่ไหม", body: "เลือกวันเข้าพักเพื่อดูห้องว่างและราคาต่อคืน", primaryCta: { label: "ค้นหาห้องว่าง", href: "/stay" }, secondaryCta: { label: "สอบถามเพิ่มเติม", href: "/contact" } }),
      ],
    },
    {
      slug: "location",
      title: "ที่ตั้งและการเดินทาง",
      sections: [
        section(hero, {
          variant: "split",
          eyebrow: "ที่ตั้ง",
          heading: "ปลายหาดที่เงียบที่สุดของเขาหลัก",
          subheading: "รีสอร์ตอยู่บนหาดคึกคักที่เงียบที่สุดของเขาหลัก ห่างจากสนามบินภูเก็ตเพียง 75 นาที ใกล้พอจะไปตลาดและอุทยาน แต่ไกลพอจะไม่ได้ยินเสียงอื่นนอกจากคลื่น",
          primaryCta: { label: "จองห้องพัก", href: "/stay" },
          secondaryCta: { label: "ติดต่อเรา", href: "/contact" },
          image: { url: IMG.aerial, alt: "มุมสูงของชายหาด" },
          background: "none",
          // qa-c: the turquoise bay photo leads (the auto ocean scene rendered a pale grey sea with the photo as an inset)
          scene: "none",
        }),
        section(features, {
          eyebrow: "ใกล้\u00a0ๆ",
          heading: "จากรีสอร์ตไปได้ง่าย",
          variant: "icons",
          columns: 4,
          items: [
            { icon: "Plane", title: "สนามบินภูเก็ต", description: "75 นาทีโดยรถรับส่งส่วนตัวของรีสอร์ต" },
            { icon: "ShoppingBasket", title: "ตลาดบางเนียง", description: "ปั่นจักรยาน 10 นาที ตลาดเย็นวันจันทร์ พุธ เสาร์" },
            { icon: "Trees", title: "อุทยานแห่งชาติเขาหลัก-ลำรู่", description: "น้ำตกและเส้นทางเดินป่า ขับรถ 15 นาที" },
            { icon: "Ship", title: "หมู่เกาะสิมิลัน", description: "เรือสปีดโบ๊ตไปสิมิลันออกจากท่าเรือทับละมุ ห่างจากรีสอร์ต 20 นาที" },
          ],
        }),
        section(steps, {
          eyebrow: "การเดินทาง",
          heading: "มาถึงเราได้สามแบบ",
          variant: "cards",
          items: [
            { icon: "Car", title: "รถรับส่งของรีสอร์ต", description: "เพิ่มบริการรับส่งสนามบินตอนจอง ทีมงานถือป้ายรอที่ประตูขาออก ใช้เวลาประมาณ 75 นาทีจากสนามบินภูเก็ต" },
            { icon: "Navigation", title: "ขับรถมาเอง", description: "ใช้ทางหลวงหมายเลข 4 มุ่งหน้าตะกั่วป่า เลี้ยวซ้ายเข้าหาดคึกคักตามป้ายรีสอร์ต มีที่จอดรถในร่มฟรี" },
            { icon: "Bus", title: "รถโดยสาร", description: "รถตู้ภูเก็ต–เขาหลักออกทุกชั่วโมง ลงป้ายบางเนียงแล้วเรียกรถรับส่งของรีสอร์ตได้ฟรี" },
          ],
        }),
        section(contact, { heading: "แผนที่และการติดต่อ", body: "ส่งข้อความถึงทีมงานได้ทุกช่องทาง เราตอบกลับภายในหนึ่งชั่วโมงในเวลาทำการ", showForm: false, showMap: true, showHours: true }),
      ],
    },
    withAlbum(
      aboutPage({
        eyebrow: "เรื่องราวของเรา",
        neutral: { heading: "เกี่ยวกับ {{name}}", body: "{{name}} ตั้งใจให้ทุกการเข้าพักเป็นวันหยุดที่ไม่ต้องรีบ ทีมงานดูแลตั้งแต่ก่อนเดินทางจนถึงวันเช็กเอาต์ จองห้องพักออนไลน์ เห็นราคาต่อคืนทุกบรรทัด และยืนยันได้ทันทีตลอด 24 ชั่วโมง" },
        heading: "บ้านทะเล — บ้านริมหาดที่เราอยากให้คุณกลับมา",
        body: "บ้านทะเลเปิดบ้านหลังแรกเมื่อปี 2016 จากบ้านพักตากอากาศของครอบครัวบนหาดคึกคัก ที่เพื่อนของเพื่อนขอมาพักจนต้องสร้างเพิ่มทีละหลัง วันนี้เรามีห้องพักและวิลล่า 21 หลัง แต่ยังรักษาสิ่งที่ทำให้ที่นี่ต่างจากโรงแรมใหญ่ไว้ นั่นคือทีมงานที่จำชื่อคุณได้ตั้งแต่คืนแรก อาหารเช้าที่สั่งทำทีละจาน และหาดที่เงียบพอจะได้ยินเสียงตัวเองคิด\n\nพนักงานกว่าครึ่งเป็นคนในตำบลเดียวกับเรา ปลาในมื้อเย็นมาจากเรือประมงที่จอดอยู่ปลายหาด และเราปลูกต้นไม้ชายฝั่งเพิ่มทุกปีเพื่อให้หาดนี้ยังเป็นหาดเดิมสำหรับแขกที่กลับมา",
      }),
    ),
    {
      slug: "contact",
      title: "ติดต่อเรา",
      showInNav: false,
      sections: [
        // §5.0: hotel contact = interest chips that prefill the message (same form, no backend change)
        section(contact, {
          heading: "ติดต่อและสอบถาม",
          body: "ส่งข้อความถึงทีมงานได้ทุกช่องทาง เราตอบกลับภายในหนึ่งชั่วโมงในเวลาทำการ สำหรับการจองแบบกลุ่มหรืองานแต่งริมหาด แจ้งวันที่และจำนวนแขกเพื่อรับใบเสนอราคา",
          variant: "chips",
          interests: ["จองห้องพัก", "จองแบบกลุ่ม", "งานแต่งริมหาด", "รถรับส่งสนามบิน", "อื่น\u00a0ๆ"],
        }),
        section(faq, {
          heading: "คำถามที่พบบ่อย",
          items: [
            { q: "จัดงานแต่งงานหรืองานเลี้ยงริมหาดได้ไหม?", a: "ได้ รองรับงานเลี้ยงริมหาดสูงสุด 80 ท่าน และเหมาทั้งรีสอร์ตสำหรับงานแต่งแบบส่วนตัว ติดต่อเราเพื่อรับใบเสนอราคา" },
            { q: "มีบริการรับส่งจากสนามบินไหม?", a: "มี เลือกเพิ่มรถรับส่งสนามบินแบบส่วนตัวได้ในขั้นตอนจอง หรือแจ้งทีมงานล่วงหน้าอย่างน้อยหนึ่งวัน" },
            { q: "ออกใบกำกับภาษีได้ไหม?", a: "ได้ แจ้งชื่อและเลขประจำตัวผู้เสียภาษีตอนเช็กอิน เราออกใบกำกับภาษีเต็มรูปแบบให้ก่อนเช็กเอาต์" },
          ],
        }),
      ],
    },
    ...legalPages("Baan Talay Khao Lak"),
  ],
  async seed(tx, tenantId) {
    const now = new Date();
    const today = bkkToday(now);
    const year = Number(today.slice(0, 4));

    // ---- unit types -------------------------------------------------------------------------------------------
    const types = await tx
      .insert(rentalUnitTypes)
      .values([
        {
          tenantId,
          name: "ดีลักซ์ การ์เดน",
          slug: "deluxe-garden",
          description: "ห้องขนาด 32 ตร.ม. ในสวนมะพร้าว มีระเบียงไม้ส่วนตัวพร้อมเดย์เบด ห้องน้ำฝักบัวเรนชาวเวอร์ เดินถึงหาด 2 นาที เหมาะสำหรับคู่รักและนักเดินทางที่อยากใช้เวลานอกห้องมากกว่าในห้อง",
          gallery: [IMG.garden, IMG.bedroom, IMG.bathroom, IMG.palms],
          baseGuests: 2,
          maxGuests: 3,
          beds: "เตียงคิงไซส์ 1 เตียง หรือเตียงเดี่ยว 2 เตียง",
          sizeSqm: 32,
          amenities: ["ระเบียงส่วนตัว", "เครื่องปรับอากาศ", "Wi-Fi", "เครื่องชงกาแฟ", "มินิบาร์", "ตู้นิรภัย", "เรนชาวเวอร์", "เครื่องเป่าผม"],
          quantity: 8,
          basePrice: 290_000,
          extraGuestPrice: 80_000,
          minNights: 1,
          featured: false,
          sort: 1,
        },
        {
          tenantId,
          name: "ดีลักซ์ ซีวิว",
          slug: "deluxe-seaview",
          description: "ห้องชั้นสองหันหน้าออกทะเลทั้งผนัง ขนาด 36 ตร.ม. พร้อมระเบียงกว้างสำหรับมื้อเช้าหรือทำงานทั้งวัน อ่างอาบน้ำริมหน้าต่างมองเห็นพระอาทิตย์ตกจากในห้อง",
          gallery: [IMG.seaview, IMG.bedroom, IMG.bathroom, IMG.sunset],
          baseGuests: 2,
          maxGuests: 3,
          beds: "เตียงคิงไซส์ 1 เตียง",
          sizeSqm: 36,
          amenities: ["วิวทะเล", "ระเบียงกว้าง", "อ่างอาบน้ำ", "เครื่องปรับอากาศ", "Wi-Fi", "เครื่องชงกาแฟ", "มินิบาร์", "ตู้นิรภัย", "โต๊ะทำงาน"],
          quantity: 6,
          basePrice: 390_000,
          extraGuestPrice: 90_000,
          minNights: 1,
          featured: true,
          sort: 2,
        },
        {
          tenantId,
          name: "พูลแอคเซส สวีท",
          slug: "pool-access-suite",
          description: "สวีทชั้นล่าง 48 ตร.ม. เปิดประตูระเบียงแล้วก้าวลงสระอินฟินิตี้ได้ทันที มีมุมนั่งเล่นแยกจากห้องนอน เดย์เบดริมสระส่วนตัวของห้อง และมินิบาร์เติมฟรีทุกวัน",
          gallery: [IMG.suitePool, IMG.suite, IMG.pool, IMG.bathroom],
          baseGuests: 2,
          maxGuests: 3,
          beds: "เตียงคิงไซส์ 1 เตียง + โซฟาเบด",
          sizeSqm: 48,
          amenities: ["ลงสระจากระเบียง", "มุมนั่งเล่น", "เดย์เบดริมสระ", "มินิบาร์เติมฟรี", "เครื่องปรับอากาศ", "Wi-Fi", "เครื่องชงกาแฟ", "ตู้นิรภัย", "เรนชาวเวอร์"],
          quantity: 4,
          basePrice: 540_000,
          extraGuestPrice: 90_000,
          minNights: 1,
          featured: true,
          sort: 3,
        },
        {
          tenantId,
          name: "บีชฟรอนต์ พูลวิลล่า",
          slug: "beachfront-pool-villa",
          description: "วิลล่าหน้าหาด 85 ตร.ม. พร้อมสระส่วนตัวยาว 8 เมตร ศาลาริมสระ และประตูสวนเปิดออกสู่ทรายโดยตรง ห้องน้ำกลางแจ้งใต้ต้นลั่นทม อาหารเช้าเสิร์ฟริมสระได้ทุกวัน",
          gallery: [IMG.villaPool, IMG.heroSecondary, IMG.bedroom, IMG.beach],
          baseGuests: 2,
          maxGuests: 4,
          beds: "เตียงคิงไซส์ 1 เตียง + เดย์เบด",
          sizeSqm: 85,
          amenities: ["สระส่วนตัว", "หน้าหาด", "ศาลาริมสระ", "ห้องน้ำกลางแจ้ง", "เครื่องปรับอากาศ", "Wi-Fi", "เครื่องชงกาแฟ", "มินิบาร์", "ตู้นิรภัย", "บริการอาหารเช้าในวิลล่า"],
          quantity: 2,
          basePrice: 980_000,
          extraGuestPrice: 120_000,
          minNights: 2,
          featured: true,
          sort: 4,
        },
        {
          tenantId,
          name: "แฟมิลี่ วิลล่า 2 ห้องนอน",
          slug: "family-villa",
          description: "วิลล่าสองห้องนอน 120 ตร.ม. สำหรับครอบครัวหรือเพื่อนกลุ่มเล็ก ห้องนั่งเล่นเปิดโล่งสู่สระส่วนตัวพร้อมส่วนตื้นสำหรับเด็ก ครัวเล็ก และโต๊ะอาหารกลางแจ้งสำหรับ 6 ท่าน มีเพียงหลังเดียวในรีสอร์ต",
          gallery: [IMG.family, IMG.villaPool, IMG.bedroom, IMG.palms],
          baseGuests: 4,
          maxGuests: 6,
          beds: "เตียงคิงไซส์ 1 เตียง + เตียงเดี่ยว 2 เตียง",
          sizeSqm: 120,
          amenities: ["2 ห้องนอน", "สระส่วนตัวพร้อมส่วนตื้น", "ครัวเล็ก", "ห้องนั่งเล่น", "โต๊ะอาหารกลางแจ้ง", "เครื่องปรับอากาศ", "Wi-Fi", "เครื่องชงกาแฟ", "เตียงเด็กตามคำขอ"],
          quantity: 1,
          basePrice: 1_250_000,
          extraGuestPrice: 120_000,
          minNights: 2,
          featured: false,
          sort: 5,
        },
      ])
      .returning({ id: rentalUnitTypes.id, slug: rentalUnitTypes.slug, basePrice: rentalUnitTypes.basePrice, baseGuests: rentalUnitTypes.baseGuests, extraGuestPrice: rentalUnitTypes.extraGuestPrice });
    const T = Object.fromEntries(types.map((t) => [t.slug, t])) as Record<string, (typeof types)[number]>;

    // ---- rate rules: high season Nov–Feb +25 %, weekends +10 %, New Year +15 % (compound in priority order) -----
    // the high season that is current or next: Nov 1 of this year → end of Feb next year (or last Nov if we are in Jan/Feb)
    const seasonStartYear = today < `${year}-03-01` ? year - 1 : year;
    const hiStart = `${seasonStartYear}-11-01`;
    const hiEnd = `${seasonStartYear + 1}-02-28`;
    const rules = [
      { name: "ไฮซีซัน พ.ย.–ก.พ.", startDate: hiStart, endDate: hiEnd, weekdays: null, mode: "percent", value: 25, priority: 1 },
      { name: "สุดสัปดาห์ (ศ.–ส.)", startDate: null, endDate: null, weekdays: [5, 6], mode: "percent", value: 10, priority: 2 },
      { name: "เทศกาลปีใหม่", startDate: `${seasonStartYear}-12-28`, endDate: `${seasonStartYear + 1}-01-03`, weekdays: null, mode: "percent", value: 15, priority: 3 },
      { name: "กรีนซีซัน พ.ค.–ต.ค.", startDate: `${seasonStartYear + 1}-05-01`, endDate: `${seasonStartYear + 1}-10-31`, weekdays: null, mode: "percent", value: -15, priority: 1 },
    ];
    await tx.insert(rentalRateRules).values(rules.map((r) => ({ tenantId, unitTypeId: null, active: true, ...r })));
    /** the same arithmetic as services/pricing.ts nightlyRate, for the sample stays' nightly lines */
    const rate = (slug: string, date: string) => {
      let price = T[slug]!.basePrice;
      for (const r of [...rules].sort((a, b) => a.priority - b.priority)) {
        if (r.startDate && date < r.startDate) continue;
        if (r.endDate && date > r.endDate) continue;
        if (r.weekdays && !r.weekdays.includes(weekdayOf(date))) continue;
        price = Math.round((price * (100 + r.value)) / 100);
      }
      return roundBaht(price);
    };

    // ---- blocked dates: the family villa's pool maintenance in three weeks, the garden wing's one-day repaint ----
    await tx.insert(rentalBlockedDates).values([
      ...[21, 22, 23].map((n) => ({ tenantId, unitTypeId: T["family-villa"]!.id, date: addDays(today, n), reason: "ซ่อมบำรุงสระส่วนตัว" })),
      { tenantId, unitTypeId: T["deluxe-garden"]!.id, date: addDays(today, 45), reason: "ทาสีระเบียงอาคารสวน" },
    ]);

    // ---- extras ---------------------------------------------------------------------------------------------------
    const extras = await tx
      .insert(rentalExtras)
      .values([
        { tenantId, name: "อาหารเช้า", description: "อาหารเช้าสั่งทำทีละจานที่ห้องอาหารริมหาด หรือเสิร์ฟที่ห้อง", price: 45_000, pricing: "per_guest_night", sort: 1 },
        { tenantId, name: "รถรับส่งสนามบิน (ไป-กลับ)", description: "รถตู้ส่วนตัวพร้อมคนขับ รับที่ประตูขาออกสนามบินภูเก็ต", price: 320_000, pricing: "per_stay", sort: 2 },
        { tenantId, name: "เลทเช็กเอาต์ถึงบ่ายสี่โมง", description: "อยู่ต่อได้ถึงช่วงบ่ายแก่ ตามห้องว่าง ยืนยันล่วงหน้าหนึ่งวัน", price: 120_000, pricing: "per_stay", sort: 3 },
        { tenantId, name: "เตียงเสริม", description: "เตียงเสริมขนาด 3.5 ฟุต พร้อมเครื่องนอน (ไม่รวมอาหารเช้า)", price: 90_000, pricing: "per_night", sort: 4 },
        { tenantId, name: "ดินเนอร์ริมหาดใต้แสงเทียน", description: "เซ็ตซีฟู้ด 5 คอร์สสำหรับ 2 ท่าน บนหาดส่วนตัว พร้อมไวน์ 1 ขวด", price: 450_000, pricing: "per_stay", sort: 5 },
      ])
      .returning({ id: rentalExtras.id, name: rentalExtras.name, price: rentalExtras.price, pricing: rentalExtras.pricing });
    const E = Object.fromEntries(extras.map((e) => [e.name, e])) as Record<string, (typeof extras)[number]>;

    // ---- sample guests + stays (one in-house tonight, upcoming confirmed ones, a past one, a cancelled one) -------
    const guests = await tx
      .insert(customers)
      .values([
        { tenantId, name: "พลอย ชนากานต์", phone: "0813330001", email: "ploy@example.com" },
        { tenantId, name: "ธนา วิริยะกุล", phone: "0813330002" },
        { tenantId, name: "มิว ณัฐธิดา", phone: "0813330003", email: "mew@example.com" },
        { tenantId, name: "Michael Brandt", phone: "0813330004", email: "michael.b@example.com" },
      ])
      .returning({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email });

    const stay = async (
      g: number,
      slug: string,
      fromOffset: number,
      nights: number,
      people: number,
      opts: { status: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled"; extras?: Array<[string, number]>; payOption?: "deposit" | "full"; note?: string | null; unitNumber?: string | null },
    ) => {
      const t = T[slug]!;
      const guest = guests[g]!;
      const checkIn = addDays(today, fromOffset);
      const checkOut = addDays(checkIn, nights);
      const nightly = eachNight(checkIn, checkOut).map((date) => ({ date, price: rate(slug, date) }));
      const roomTotal = nightly.reduce((s, n) => s + n.price, 0);
      const extraGuests = Math.max(0, people - t.baseGuests);
      const extraGuestTotal = extraGuests * t.extraGuestPrice * nights;
      const lines = (opts.extras ?? []).map(([name, qty]) => {
        const e = E[name]!;
        const total = e.pricing === "per_stay" ? e.price * qty : e.pricing === "per_night" ? e.price * qty * nights : e.price * qty * nights * people;
        return { id: e.id, name: e.name, pricing: e.pricing, price: e.price, qty, total };
      });
      const extrasTotal = lines.reduce((s, l) => s + l.total, 0);
      const total = roomTotal + extraGuestTotal + extrasTotal;
      const payOption = opts.payOption ?? "deposit";
      const deposit = payOption === "full" ? total : roundBaht(Math.round(total * 0.3));
      const settled = opts.status === "checked_in" || opts.status === "checked_out";
      const paid = opts.status === "pending" ? 0 : settled ? total : deposit;
      const createdAt = new Date(bkkTime(checkIn, "10:00").getTime() - (opts.status === "cancelled" ? 20 : 12) * DAY_MS);
      const number = `ST-${await nextCounter(tx, tenantId, "stay", 1000)}`;
      await tx.insert(rentalStays).values({
        tenantId,
        number,
        unitTypeId: t.id,
        customerId: guest.id,
        guestName: guest.name!,
        guestPhone: guest.phone,
        guestEmail: guest.email,
        checkIn,
        checkOut,
        nights,
        guests: people,
        status: opts.status,
        source: g % 2 ? "phone" : "online",
        nightly,
        extras: lines,
        roomTotal,
        extraGuestTotal,
        extrasTotal,
        total,
        depositAmount: deposit,
        paidAmount: paid,
        paymentStatus: opts.status === "cancelled" ? "refunded" : paid >= total ? "paid" : paid > 0 ? "deposit_paid" : "unpaid",
        accessKey: accessKey(),
        unitNumber: opts.unitNumber ?? null,
        note: opts.note ?? null,
        meta: { payOption, seededSample: true },
        holdUntil: opts.status === "pending" ? new Date(now.getTime() + 25 * 60_000) : null,
        confirmedAt: opts.status === "pending" || opts.status === "cancelled" ? null : createdAt,
        checkedInAt: settled ? bkkTime(checkIn, "15:10") : null,
        checkedOutAt: opts.status === "checked_out" ? bkkTime(checkOut, "11:20") : null,
        cancelledAt: opts.status === "cancelled" ? new Date(createdAt.getTime() + 2 * DAY_MS) : null,
        cancelReason: opts.status === "cancelled" ? "แผนการเดินทางเปลี่ยน" : null,
        cancelledBy: opts.status === "cancelled" ? "customer" : null,
        createdAt,
        updatedAt: createdAt,
      });
    };

    // in-house tonight (arrived yesterday) and a check-out this morning that already left
    await stay(0, "beachfront-pool-villa", -1, 4, 2, { status: "checked_in", extras: [["อาหารเช้า", 2], ["ดินเนอร์ริมหาดใต้แสงเทียน", 1]], unitNumber: "V1", note: "ฉลองครบรอบแต่งงาน" });
    await stay(3, "deluxe-seaview", -10, 3, 2, { status: "checked_out", extras: [["อาหารเช้า", 2]], payOption: "full", unitNumber: "S204" });
    // arriving today (so the admin "เช็กอินวันนี้" tab is not empty) and upcoming confirmed stays
    await stay(1, "family-villa", 0, 3, 5, { status: "confirmed", extras: [["อาหารเช้า", 5], ["รถรับส่งสนามบิน (ไป-กลับ)", 1]], note: "มีเด็กเล็ก 2 คน ขอเตียงเด็ก 1 เตียง" });
    await stay(2, "deluxe-seaview", 5, 7, 1, { status: "confirmed", extras: [["อาหารเช้า", 1]], note: "ทำงานจากห้อง ขอชั้นสูงสุดถ้าเป็นไปได้" });
    await stay(0, "pool-access-suite", 12, 2, 2, { status: "confirmed", extras: [["อาหารเช้า", 2], ["เลทเช็กเอาต์ถึงบ่ายสี่โมง", 1]] });
    await stay(3, "deluxe-garden", 9, 2, 3, { status: "confirmed", extras: [["เตียงเสริม", 1]] });
    // a cancelled one (refunded) for the history tab
    await stay(1, "deluxe-garden", 15, 2, 2, { status: "cancelled" });
  },
};
