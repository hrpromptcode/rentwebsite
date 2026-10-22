import type { TemplateDefinition } from "@rentweb/core/tenant";
import { availabilityRules, bookings, clinicPackages, customers, nextCounter, serviceCategories, services, staff, staffServices } from "@rentweb/db";
import { section, hero, marquee, features, imageText, testimonials, faq, cta, stats, steps, gallery, classHighlights, weeklySchedule, instructorGrid, passPricing } from "@rentweb/storefront/definitions";
import { aboutPage, contactPage, legalPages, u, avatar } from "./shared";

/** portrait crop for instructor photos (tall pill frames) */
const portrait = (id: string) => u(id, 800, "&h=1100&crop=faces");

/*
 * Course / studio template: "Sala Flow" – a yoga & pilates studio in Ari, Bangkok, built on the booking module.
 * A class = service with capacity > 1 and requiresStaff = false; its weekly timetable = availability_rules rows with
 * service_id (+ staff_id = instructor). Class passes = clinic_packages sold via moduleConfig.booking.packages.
 */

const BKK_MS = 7 * 3_600_000;

/** Next Bangkok occurrence of weekday + "HH:MM" that is at least `minHoursAhead` hours away. */
function nextSession(weekday: number, hm: string, from: Date, minHoursAhead = 3): Date {
  const [h, m] = hm.split(":").map(Number) as [number, number];
  const local = new Date(from.getTime() + BKK_MS);
  const delta = (weekday - local.getUTCDay() + 7) % 7;
  let t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + delta, h, m) - BKK_MS;
  if (t < from.getTime() + minHoursAhead * 3_600_000) t += 7 * 86_400_000;
  return new Date(t);
}

/** Most recent past Bangkok occurrence of weekday + "HH:MM" (for completed sample enrolments). */
function lastSession(weekday: number, hm: string, from: Date): Date {
  const next = nextSession(weekday, hm, from, 0);
  return new Date(next.getTime() - 7 * 86_400_000);
}

const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
const hmPlus = (hm: string, min: number) => {
  const [h, m] = hm.split(":").map(Number) as [number, number];
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const IMG = {
  hero: u("1545205597-3d9d02c29597", 1800),
  heroSecondary: u("1544367567-0f2fcb009e0b", 800),
  hatha: u("1544367567-0f2fcb009e0b", 900),
  vinyasa: u("1575052814086-f385e2e2ad1b", 900),
  // yin & sound bath = singing bowl; reformer classes = real reformers (were a backbend and a singing bowl); prenatal = a mother-to-be
  yin: u("1593811167562-9cef47bfc4d7", 900),
  reformer: u("1747238415033-b74eec07eb59", 900),
  reformerFlow: u("1747239069226-55382c570116", 900),
  mat: u("1518611012118-696072aa579a", 900),
  prenatal: u("1710897869539-a48e3d69a8d7", 900),
  breath: u("1474418397713-7ede21d49118", 900),
  // the oak room in natural light (image-text "ห้องไม้โอ๊ก แสงธรรมชาติ…"); studio3/4 were a dumbbell class and a dead id
  studio: u("1687783615494-b4a1f1af8b58", 1400),
  studio2: u("1588286840104-8957b019727f", 1000),
  studio3: u("1683056255281-e52a141924f0", 1000),
  studio4: u("1767611102585-baf80e9be291", 1000),
  reformerRoom: u("1717500252297-b09508db7ceb", 1000),
  meditation: u("1506126613408-eca07ce68773", 1000),
};

export const course: TemplateDefinition = {
  key: "course",
  name: { th: "คอร์สเรียน / สตูดิโอ / โรงเรียนสอนพิเศษ", en: "Classes & studio" },
  description: {
    th: "คลาสเรียนแบบมีที่นั่ง ตารางเรียนรายสัปดาห์ ครูผู้สอน คลาสพาส 5/10 ครั้ง สมัครและชำระออนไลน์ บัญชีนักเรียน — โยคะ ฟิตเนส ดนตรี ภาษา ติวเตอร์",
    en: "Seat-limited classes, weekly timetable, instructors, 5/10-class passes, online enrolment and payment, student account — yoga, fitness, music, language, tutoring",
  },
  category: "booking",
  siteType: "course",
  modules: ["booking"],
  themePreset: "loft",
  // ADMIN_B2-07: the sample brand; new (non-demo) studios get their own name instead
  sampleBrand: ["Sala Flow Studio", "Sala Flow"],
  // AC-02: the sample business's location copy; new (non-demo) studios get a placeholder
  neutralText: [
    ["สตูดิโออยู่ซอยอารีย์ 1 เดิน 4 นาทีจาก BTS อารีย์ ทางออก 3 มีที่จอดรถ 6 คันหน้าสตูดิโอ (จักรยานจอดฟรี)", "[ที่ตั้งสตูดิโอ · การเดินทาง · ที่จอดรถ]"],
    ["ชั้น 2 ซอยอารีย์ 1 ถนนพหลโยธิน กรุงเทพฯ 10400", "[ที่อยู่สตูดิโอ]"],
    ["โยคะ & พิลาทิส สตูดิโอ · อารีย์ กรุงเทพฯ", "โยคะ & พิลาทิส สตูดิโอ"],
    ["ห้องไม้โอ๊ก แสงธรรมชาติ\nและความเงียบกลางอารีย์", "ห้องไม้โอ๊ก แสงธรรมชาติ\nและความเงียบกลางเมือง"],
    ["Sala Flow เริ่มจากห้องฝึกเล็ก ๆ ของครูแนนในปี 2019 วันนี้เรามีสตูดิโอโยคะ 2 ห้องและห้องรีฟอร์เมอร์ 6 เตียง", "เรามีสตูดิโอโยคะและห้องรีฟอร์เมอร์"],
    ["เปิดสอนที่อารีย์", "เปิดสอน"],
    ["ทัก LINE @salaflow เพื่อขอใบเสนอราคา", "ติดต่อเราเพื่อขอใบเสนอราคา"],
  ],
  recommendedPresets: ["loft", "zen", "porcelain"],
  complexity: 4,
  previewImage: IMG.hero,
  settings: {
    tagline: "โยคะ & พิลาทิส สตูดิโอ · อารีย์",
    contact: {
      phone: "02-279-8899",
      lineId: "@salaflow",
      email: "hello@salaflow.studio",
      address: "ชั้น 2 ซอยอารีย์ 1 ถนนพหลโยธิน กรุงเทพฯ 10400",
      hours: [
        { day: "จันทร์ – ศุกร์", time: "06:30 – 21:00" },
        { day: "เสาร์ – อาทิตย์", time: "08:00 – 19:00" },
      ],
      instagram: "https://instagram.com",
      facebook: "https://facebook.com",
    },
    header: { cta: { label: "สมัครเรียน", href: "/schedule" } },
    payments: {
      promptpayId: "0812345678",
      promptpayName: "Sala Flow Studio",
      bankAccounts: [{ bank: "กสิกรไทย", name: "บจก. ศาลาโฟลว์", number: "045-8-12345-6" }],
      enabled: { promptpay: true, bankTransfer: true },
    },
  },
  moduleConfig: {
    booking: { slotMinutes: 30, maxAdvanceDays: 21, minNoticeHours: 1, cancelHours: 6, depositEnabled: true, reminderHours: [24, 2], packages: true, memberPrefix: "SF" },
  },
  navigation: {
    header: [
      { label: "คลาสเรียน", href: "/classes" },
      { label: "ตารางเรียน", href: "/schedule" },
      { label: "ครูผู้สอน", href: "/instructors" },
      { label: "คลาสพาส", href: "/packages" },
      { label: "เริ่มต้น", href: "/start" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "คลาสเรียน", href: "/classes" },
      { label: "ตารางเรียน", href: "/schedule" },
      { label: "ครูผู้สอน", href: "/instructors" },
      { label: "คลาสพาส", href: "/packages" },
      { label: "เกี่ยวกับเรา", href: "/about" },
      { label: "บัญชีนักเรียน", href: "/account" },
    ],
  },
  pages: [
    {
      slug: "home",
      title: "หน้าแรก",
      kind: "home",
      sections: [
        // §5.8 signature: the breathing orb between the two lines of the headline, cue "หายใจเข้า · ค้างไว้ · หายใจออก" (4-4-6-2)
        section(hero, {
          variant: "cinematic",
          scene: "auto",
          eyebrow: "โยคะ & พิลาทิส สตูดิโอ · อารีย์ กรุงเทพฯ",
          heading: "หายใจให้ช้าลง\nแล้วขยับให้ลึกขึ้น",
          subheading: "คลาสขนาดเล็ก 6–16 คน ครูปรับท่าให้ทีละคน เลือกรอบที่สะดวกจากตารางเรียนทั้งสัปดาห์ แล้วสมัครออนไลน์ได้ทันที ใช้คลาสพาสหรือจ่ายรายครั้งก็ได้",
          primaryCta: { label: "ดูตารางเรียนสัปดาห์นี้", href: "/schedule" },
          secondaryCta: { label: "คลาสสำหรับผู้เริ่มต้น", href: "/classes?level=beginner" },
          image: { url: IMG.hero, alt: "คลาสโยคะตอนเช้าที่ Sala Flow" },
          imageSecondary: { url: IMG.heroSecondary, alt: "ท่าโยคะ" },
          badges: ["คลาสเล็ก 6–16 คน", "ครู RYT-500 / STOTT"],
          stats: [
            { value: "25+", label: "รอบต่อสัปดาห์" },
            { value: "4", label: "ครูผู้สอน" },
            { value: "4.9", label: "คะแนนรีวิว" },
          ],
        }),
        section(marquee, { items: ["Hatha", "Vinyasa", "Yin & Sound Bath", "Reformer Pilates", "Mat Pilates", "Prenatal", "Breath & Meditation", "คลาสเช้าก่อนเข้างาน"], style: "outline", separator: "◦", speed: 36 }),
        section(classHighlights, { limit: 6, eyebrow: "คลาสเรียน", heading: "คลาสยอดนิยมสัปดาห์นี้", subheading: "ทุกคลาสระบุระดับ ระยะเวลา ครูผู้สอน และที่นั่งคงเหลือ เลือกที่ใช่แล้วกดสมัครได้เลย", featured: false, variant: "editorial" }),
        section(weeklySchedule, { eyebrow: "ตารางเรียน", heading: "ตารางเรียน 7 วันข้างหน้า", subheading: "ที่นั่งคงเหลืออัปเดตแบบเรียลไทม์ กดที่รอบเพื่อสมัคร", days: 7, showPrice: false }),
        section(features, {
          variant: "list",
          columns: 4,
          eyebrow: "ทำไมต้อง Sala Flow",
          heading: "ฝึกอย่างปลอดภัย ก้าวหน้าได้จริง",
          items: [
            { icon: "Users", title: "คลาสเล็ก ดูแลทั่วถึง", description: "โยคะไม่เกิน 16 คน รีฟอร์เมอร์ไม่เกิน 6 คน ครูเห็นและปรับท่าให้ทุกคน" },
            { icon: "GraduationCap", title: "ครูมีใบรับรอง", description: "RYT-200/500 และ STOTT Pilates ประสบการณ์สอนรวมกว่า 30 ปี" },
            { icon: "CalendarCheck", title: "ตารางยืดหยุ่น", description: "รอบเช้าก่อนเข้างานถึงรอบเย็นหลังเลิกงาน จองล่วงหน้าได้ 3 สัปดาห์ ยกเลิกฟรีก่อน 6 ชั่วโมง" },
            { icon: "Ticket", title: "คลาสพาสคุ้มกว่า", description: "พาส 5 / 10 ครั้ง ใช้ได้ทุกคลาส ทุกครู ตัดครั้งอัตโนมัติเมื่อสมัคร" },
          ],
        }),
        section(instructorGrid, { eyebrow: "ทีมครู", heading: "ครูผู้สอนของเรา", subheading: "กดที่ชื่อเพื่อดูคลาสที่สอนและตารางสอนของแต่ละคน", limit: 4 }),
        section(passPricing, { eyebrow: "คลาสพาส", heading: "เรียนบ่อยแค่ไหน ก็มีพาสที่พอดี", subheading: "ซื้อครั้งเดียว ใช้ได้ทุกคลาส ยิ่งเรียนบ่อยยิ่งคุ้ม เช็กครั้งคงเหลือได้ในบัญชีนักเรียน", limit: 3, showDropIn: true }),
        section(imageText, {
          eyebrow: "สตูดิโอของเรา",
          heading: "ห้องไม้โอ๊ก แสงธรรมชาติ\nและความเงียบกลางอารีย์",
          body: "Sala Flow เริ่มจากห้องฝึกเล็ก ๆ ของครูแนนในปี 2019 วันนี้เรามีสตูดิโอโยคะ 2 ห้องและห้องรีฟอร์เมอร์ 6 เตียง พร้อมอุปกรณ์ครบ ไม่ต้องหอบเสื่อมาเอง มีห้องอาบน้ำ ล็อกเกอร์ และมุมชาสมุนไพรหลังเรียน",
          image: { url: IMG.studio, alt: "สตูดิโอโยคะไม้โอ๊กแสงธรรมชาติ" },
          imagePosition: "left",
          bullets: ["เสื่อ บล็อก สายรัด ผ้าห่ม เตรียมให้ครบ", "ห้องอาบน้ำ + ล็อกเกอร์ฟรี", "ชาสมุนไพรหลังคลาสทุกรอบ"],
          cta: { label: "เกี่ยวกับเรา", href: "/about" },
          style: "pinned",
        }),
        section(stats, { variant: "row", items: [{ value: 1200, suffix: "+", label: "นักเรียนที่ฝึกกับเรา" }, { value: 25, suffix: "+", label: "รอบต่อสัปดาห์" }, { value: 6, suffix: " ปี", label: "เปิดสอนที่อารีย์" }, { value: 92, suffix: "%", label: "นักเรียนกลับมาเรียนต่อ" }] }),
        section(testimonials, {
          heading: "เสียงจากนักเรียน",
          variant: "spotlight",
          items: [
            { quote: "เริ่มจากศูนย์ ก้มไม่ถึงพื้น ครูแนนปรับท่าให้ทีละนิด สามเดือนผ่านไปปวดหลังจากการนั่งทำงานหายไปเลย", name: "คุณเมย์", role: "Hatha Yoga · เรียนมา 1 ปี", avatar: avatar("may-flow"), rating: 5 },
            { quote: "ตารางเรียนดูง่ายมาก เห็นที่นั่งเหลือกี่ที่ กดสมัครจากมือถือก่อนเลิกงานได้เลย ใช้พาส 10 ครั้งคุ้มสุด", name: "คุณต้น", role: "Vinyasa Flow · คลาสพาส 10 ครั้ง", avatar: avatar("ton-flow"), rating: 5 },
            { quote: "รีฟอร์เมอร์กลุ่มเล็กแค่ 6 คน ครูบีมดูทุกคนจริง ๆ ท้องหลังคลอดกระชับขึ้นชัดเจน", name: "คุณปุ๊ก", role: "Reformer Pilates Basic", avatar: avatar("pook-flow"), rating: 5 },
          ],
        }),
        section(faq, {
          heading: "คำถามที่พบบ่อย",
          items: [
            { q: "ไม่เคยเล่นโยคะเลย เริ่มคลาสไหนดี?", a: "เริ่มที่ Hatha Yoga เริ่มต้น หรือ Breath & Meditation ได้เลย ทั้งสองคลาสสอนพื้นฐานการหายใจและการจัดท่า ครูจะถามข้อจำกัดร่างกายก่อนเริ่มทุกครั้ง" },
            { q: "ต้องเตรียมอะไรมาบ้าง?", a: "แค่ชุดที่ยืดหยุ่นและขวดน้ำ เสื่อ บล็อก สายรัด และถุงเท้ากันลื่นสำหรับพิลาทิสมีให้ยืมฟรี" },
            { q: "ยกเลิกหรือเลื่อนได้ไหม?", a: "ยกเลิกฟรีก่อนเวลาเรียนอย่างน้อย 6 ชั่วโมงจากลิงก์ในข้อความยืนยัน ถ้าใช้คลาสพาส ระบบคืนครั้งให้อัตโนมัติ" },
            { q: "คลาสพาสใช้กับคลาสไหนได้บ้าง?", a: "พาส 5 และ 10 ครั้งใช้ได้ทุกคลาสโยคะและแมทพิลาทิส ส่วน Reformer พาสใช้กับคลาสรีฟอร์เมอร์โดยเฉพาะ" },
          ],
        }),
        section(cta, { variant: "card", heading: "คลาสแรกของคุณเริ่มได้สัปดาห์นี้", body: "เลือกรอบจากตารางเรียน สมัครและชำระออนไลน์ไม่ถึงหนึ่งนาที", primaryCta: { label: "ดูตารางเรียน", href: "/schedule" }, secondaryCta: { label: "ทัก LINE ถามครู", href: "https://line.me/R/ti/p/@salaflow" } }),
      ],
    },
    {
      slug: "start",
      title: "สำหรับผู้เริ่มต้น",
      sections: [
        section(steps, {
          eyebrow: "เริ่มต้นอย่างไร",
          heading: "เรียนคลาสแรกใน 3 ขั้นตอน",
          variant: "cards",
          items: [
            { title: "เลือกคลาสและรอบ", description: "ดูตารางเรียน เลือกคลาสระดับเริ่มต้นและรอบที่สะดวก เห็นที่นั่งคงเหลือทันที", icon: "CalendarDays" },
            { title: "สมัครและชำระออนไลน์", description: "กรอกชื่อ-เบอร์โทร สแกน PromptPay หรือใช้คลาสพาส ระบบยืนยันที่นั่งทันที", icon: "QrCode" },
            { title: "มาก่อนเวลา 10 นาที", description: "เปลี่ยนชุด รับเสื่อและอุปกรณ์ แจ้งครูเรื่องอาการบาดเจ็บหรือข้อจำกัด แล้วเริ่มฝึก", icon: "Sparkles" },
          ],
        }),
        section(classHighlights, { eyebrow: "แนะนำ", heading: "คลาสที่เหมาะกับผู้เริ่มต้น", subheading: "ครูสอนพื้นฐานการหายใจและการจัดท่าอย่างช้า ๆ ปลอดภัยสำหรับทุกวัย", featured: false, level: "beginner", limit: 6, variant: "editorial" }),
        section(faq, {
          heading: "ก่อนมาเรียนครั้งแรก",
          items: [
            { q: "ควรกินอะไรก่อนเรียน?", a: "เว้นมื้อหนักอย่างน้อย 2 ชั่วโมง ถ้าหิวให้กินผลไม้หรือของว่างเบา ๆ ก่อน 45 นาที" },
            { q: "มีอาการบาดเจ็บหรือกำลังตั้งครรภ์เรียนได้ไหม?", a: "แจ้งครูก่อนเริ่มคลาสทุกครั้ง ครูจะปรับท่าให้ และสำหรับคุณแม่เรามีคลาส Prenatal Yoga โดยเฉพาะทุกวันเสาร์" },
            { q: "มาสายได้ไหม?", a: "ขอให้มาถึงก่อนเวลา 10 นาที เพื่อความปลอดภัย ประตูสตูดิโอปิดหลังเริ่มคลาส 10 นาที" },
          ],
        }),
        section(cta, { variant: "card", heading: "พร้อมแล้วใช่ไหม", body: "คลาส Hatha เริ่มต้นมีรอบทุกวันจันทร์ พุธ และเสาร์", primaryCta: { label: "ดูรอบเริ่มต้น", href: "/classes?level=beginner" }, secondaryCta: { label: "ซื้อคลาสพาส", href: "/packages" } }),
      ],
    },
    {
      slug: "gallery",
      title: "บรรยากาศ",
      showInNav: false,
      sections: [section(gallery, { heading: "บรรยากาศสตูดิโอ", subheading: "ห้องโยคะ 2 ห้อง ห้องรีฟอร์เมอร์ 6 เตียง และมุมชาหลังเรียน", layout: "masonry", images: [{ url: IMG.studio, alt: "ห้องโยคะไม้โอ๊ก" }, { url: IMG.reformerRoom, alt: "ห้องรีฟอร์เมอร์" }, { url: IMG.studio3, alt: "คลาสยืดเหยียดตอนเย็น" }, { url: IMG.reformer, alt: "คลาสรีฟอร์เมอร์กลุ่มเล็ก" }, { url: IMG.vinyasa, alt: "วินยาสะโฟลว์" }, { url: IMG.studio4, alt: "ท่าเด็กพักผ่อนในคลาส Yin" }, { url: IMG.meditation, alt: "สมาธิยามเช้า" }, { url: IMG.studio2, alt: "คลาสกลุ่มรอบค่ำ" }] }),
        section(cta, { variant: "card", heading: "มาลองคลาสแรกกับเรา", body: "เลือกรอบจากตารางเรียน เสื่อและอุปกรณ์มีให้ครบ แค่มาพร้อมชุดที่ยืดหยุ่น", primaryCta: { label: "ดูตารางเรียน", href: "/schedule" }, secondaryCta: { label: "คลาสสำหรับผู้เริ่มต้น", href: "/classes?level=beginner" } }),
      ],
    },
    aboutPage({
      neutral: { heading: "เกี่ยวกับ {{name}}", body: "{{name}} ตั้งใจให้ทุกคลาสปลอดภัยและเห็นผลจริง ครูดูแลผู้เรียนทีละคนในกลุ่มเล็ก เลือกรอบจากตารางเรียน สมัครและชำระออนไลน์ได้ตลอด 24 ชั่วโมง" },
      heading: "Sala Flow — ศาลาเล็ก ๆ ที่อยากให้คุณกลับมาหายใจ",
      body: "ครูแนนเปิด Sala Flow ในปี 2019 หลังกลับจากฝึกครูที่ฤๅษีเกศ ด้วยความเชื่อว่าโยคะไม่ใช่การแข่งความอ่อนตัว แต่คือการกลับมาอยู่กับลมหายใจของตัวเอง เราจึงจำกัดคลาสให้เล็ก เลือกครูที่ใส่ใจคนมากกว่าท่า และเพิ่มพิลาทิสเข้ามาในปี 2022 เพื่อดูแลหลัง ไหล่ และแกนกลางของคนทำงานออฟฟิศ\n\nวันนี้มีนักเรียนกว่า 1,200 คนที่เคยนั่งจิบชาที่ศาลาหลังนี้ บางคนมาทุกเช้าก่อนไปทำงาน บางคนมาเดือนละครั้ง เราดีใจกับทุกครั้งที่คุณเลือกมา",
    }),
    contactPage({
      heading: "ติดต่อและเดินทาง",
      body: "สตูดิโออยู่ซอยอารีย์ 1 เดิน 4 นาทีจาก BTS อารีย์ ทางออก 3 มีที่จอดรถ 6 คันหน้าสตูดิโอ (จักรยานจอดฟรี)",
      faqs: [
        { q: "จองเป็นกลุ่ม / คอร์สองค์กรได้ไหม?", a: "ได้ เรารับจัดคลาสโยคะและ Breathwork สำหรับทีม 8–30 คน ทั้งที่สตูดิโอและที่ออฟฟิศ ทัก LINE @salaflow เพื่อขอใบเสนอราคา" },
        { q: "มีคลาสส่วนตัวไหม?", a: "มีทั้งโยคะและรีฟอร์เมอร์แบบ 1:1 และ 1:2 กรุณาติดต่อเพื่อนัดเวลากับครูโดยตรง" },
      ],
    }),
    ...legalPages("Sala Flow Studio"),
  ],
  async seed(tx, tenantId) {
    const now = new Date();
    const [yoga, pilates, mind] = await tx
      .insert(serviceCategories)
      .values([
        { tenantId, name: "โยคะ", slug: "yoga", sort: 1 },
        { tenantId, name: "พิลาทิส", slug: "pilates", sort: 2 },
        { tenantId, name: "ลมหายใจ & สมาธิ", slug: "mind", sort: 3 },
      ])
      .returning({ id: serviceCategories.id });

    // classes: capacity > 1, requiresStaff false, full prepayment online (depositAmount = price)
    const cls = (v: { categoryId: string; name: string; slug: string; level: string; durationMin: number; price: number; capacity: number; image: string; featured?: boolean; sort: number; description: string }) => ({
      tenantId,
      categoryId: v.categoryId,
      name: v.name,
      slug: v.slug,
      level: v.level,
      durationMin: v.durationMin,
      price: v.price,
      capacity: v.capacity,
      requiresStaff: false,
      depositRequired: true,
      depositAmount: v.price,
      image: v.image,
      featured: v.featured ?? false,
      sort: v.sort,
      description: v.description,
    });
    const svc = await tx
      .insert(services)
      .values([
        cls({
          categoryId: yoga!.id,
          name: "Hatha Yoga เริ่มต้น",
          slug: "hatha-basic",
          level: "beginner",
          durationMin: 60,
          price: 45000,
          capacity: 12,
          image: IMG.hatha,
          featured: true,
          sort: 0,
          description: "คลาสพื้นฐานที่ช้าและชัด เรียนรู้การหายใจแบบโยคะ การจัดแนวกระดูกสันหลัง และท่าพื้นฐานทีละท่า ครูปรับท่าให้เป็นรายบุคคล เหมาะกับคนที่ไม่เคยเล่นโยคะ ร่างกายตึง หรือกลับมาฝึกหลังหยุดไปนาน\n\nสิ่งที่จะได้เรียน:\n- การหายใจอุชชายีและการเชื่อมลมหายใจกับการเคลื่อนไหว\n- ท่ายืน ท่านั่ง และท่าบิดพื้นฐานอย่างปลอดภัย\n- การใช้บล็อกและสายรัดช่วยในท่าที่ยังไปไม่ถึง\n- การผ่อนคลายศวาสนะปิดท้าย 10 นาที\n\nเหมาะกับ:\nผู้เริ่มต้นทุกวัย คนทำงานออฟฟิศที่ปวดหลังไหล่ และผู้ที่ต้องการฝึกอย่างค่อยเป็นค่อยไป",
        }),
        cls({
          categoryId: yoga!.id,
          name: "Vinyasa Flow",
          slug: "vinyasa-flow",
          level: "intermediate",
          durationMin: 75,
          price: 55000,
          capacity: 14,
          image: IMG.vinyasa,
          featured: true,
          sort: 1,
          description: "โฟลว์ต่อเนื่องตามจังหวะลมหายใจ ร้อน เหงื่อออก และตื่นตัว ลำดับท่าเปลี่ยนทุกสัปดาห์ สร้างความแข็งแรงของแกนกลางและความอ่อนตัวไปพร้อมกัน\n\nสิ่งที่จะได้เรียน:\n- Sun Salutation A/B และการเชื่อมท่าแบบไม่สะดุด\n- ท่าทรงตัวและการเปิดสะโพกระดับกลาง\n- การเตรียมเข้าท่าอาร์มบาลานซ์และอินเวอร์ชันอย่างปลอดภัย\n\nเหมาะกับ:\nผู้ที่ฝึกโยคะมาแล้วอย่างน้อย 3 เดือน หรือจบคลาส Hatha เริ่มต้น",
        }),
        cls({
          categoryId: yoga!.id,
          name: "Yin Yoga & Sound Bath",
          slug: "yin-sound",
          level: "all",
          durationMin: 90,
          price: 65000,
          capacity: 16,
          image: IMG.yin,
          featured: true,
          sort: 2,
          description: "ค้างท่า 3–5 นาทีเพื่อปล่อยพังผืดและข้อต่อลึก ๆ ปิดท้ายด้วยเสียงชามทิเบตและฆ้อง 20 นาที คลาสที่คนนอนไม่หลับและคนเครียดจากงานชอบที่สุด\n\nสิ่งที่จะได้เรียน:\n- หลักการ Yin และการฟังสัญญาณร่างกายขณะค้างท่า\n- ท่าเปิดสะโพก ต้นขาด้านหลัง และกระดูกสันหลังส่วนล่าง\n- การผ่อนคลายด้วยคลื่นเสียง (Sound Bath)\n\nเหมาะกับ:\nทุกระดับ รวมถึงผู้ที่ไม่เคยเล่นโยคะ ไม่ต้องใช้แรง",
        }),
        cls({
          categoryId: pilates!.id,
          name: "Reformer Pilates Basic",
          slug: "reformer-basic",
          level: "beginner",
          durationMin: 55,
          price: 85000,
          capacity: 6,
          image: IMG.reformer,
          featured: true,
          sort: 3,
          description: "พิลาทิสบนเครื่องรีฟอร์เมอร์กลุ่มเล็ก 6 เตียง ปรับแรงต้านได้ตามร่างกายแต่ละคน เน้นแกนกลาง สะโพก และการจัดแนวกระดูกสันหลัง ครูอยู่ข้างเตียงตลอดคลาส\n\nสิ่งที่จะได้เรียน:\n- การตั้งเครื่องและการหายใจแบบพิลาทิส\n- Footwork, Hundred, Leg circles และ Short box พื้นฐาน\n- การกระตุ้นกล้ามเนื้อแกนกลางลึก (TVA) อย่างถูกต้อง\n\nเหมาะกับ:\nผู้เริ่มต้น ผู้ที่ฟื้นฟูหลัง-เข่า และคุณแม่หลังคลอด 3 เดือนขึ้นไป (โปรดแจ้งครู)",
        }),
        cls({
          categoryId: pilates!.id,
          name: "Mat Pilates Core",
          slug: "mat-pilates",
          level: "intermediate",
          durationMin: 60,
          price: 50000,
          capacity: 12,
          image: IMG.mat,
          sort: 4,
          description: "แมทพิลาทิสคลาสสิกบนเสื่อ ใช้น้ำหนักตัว ลูกบอล และยางยืด สร้างแกนกลางที่แข็งแรงและท่าทางที่ดีขึ้นใน 8 สัปดาห์\n\nสิ่งที่จะได้เรียน:\n- ลำดับท่า Mat Pilates 34 ท่า (ชุดกลาง)\n- การควบคุมกระดูกเชิงกรานและซี่โครง\n- การใช้อุปกรณ์เสริมเพิ่มความท้าทาย\n\nเหมาะกับ:\nผู้ที่เคยเรียนพิลาทิสหรือออกกำลังกายสม่ำเสมอ",
        }),
        cls({
          categoryId: pilates!.id,
          name: "Reformer Pilates Flow",
          slug: "reformer-flow",
          level: "advanced",
          durationMin: 55,
          price: 95000,
          capacity: 6,
          image: IMG.reformerFlow,
          sort: 5,
          description: "รีฟอร์เมอร์จังหวะเร็ว ต่อเนื่อง ใช้ Jump board และ Tower เพิ่มคาร์ดิโอและความแข็งแรง สำหรับคนที่ผ่าน Reformer Basic มาแล้วอย่างน้อย 10 ครั้ง\n\nสิ่งที่จะได้เรียน:\n- Jump board intervals และ Long stretch series\n- Tower / Push-through bar ขั้นสูง\n- การเชื่อมท่าแบบ Flow โดยไม่เสียการควบคุม\n\nเหมาะกับ:\nผู้ฝึกขั้นสูงที่ไม่มีอาการบาดเจ็บ",
        }),
        cls({
          categoryId: yoga!.id,
          name: "Prenatal Yoga คุณแม่",
          slug: "prenatal",
          level: "all",
          durationMin: 60,
          price: 60000,
          capacity: 8,
          image: IMG.prenatal,
          sort: 6,
          description: "โยคะสำหรับคุณแม่ตั้งครรภ์ไตรมาส 2–3 สอนโดยครูที่ผ่านการอบรม Prenatal Yoga โดยเฉพาะ เน้นการหายใจเตรียมคลอด เปิดสะโพก และบรรเทาปวดหลัง\n\nสิ่งที่จะได้เรียน:\n- เทคนิคหายใจสำหรับการคลอด\n- ท่าที่ปลอดภัยในแต่ละไตรมาสและท่าที่ควรเลี่ยง\n- การผ่อนคลายด้วยหมอนและโบลสเตอร์\n\nเหมาะกับ:\nคุณแม่อายุครรภ์ 14 สัปดาห์ขึ้นไป (กรุณาปรึกษาแพทย์ก่อน)",
        }),
        cls({
          categoryId: mind!.id,
          name: "Breath & Meditation",
          slug: "breath",
          level: "all",
          durationMin: 45,
          price: 35000,
          capacity: 20,
          image: IMG.breath,
          sort: 7,
          description: "45 นาทีของการหายใจและนั่งสมาธิแบบมีคนนำ ไม่มีท่ายาก ไม่ต้องอ่อนตัว เหมาะกับการเริ่มเช้าวันอังคารหรือปิดสัปดาห์ในเช้าวันอาทิตย์\n\nสิ่งที่จะได้เรียน:\n- ปราณายามะพื้นฐาน: Nadi Shodhana, Box breathing, Bhramari\n- การนั่งสมาธิแบบตามลมหายใจและ Body scan\n- วิธีนำเทคนิคไปใช้ก่อนนอนและก่อนประชุมสำคัญ\n\nเหมาะกับ:\nทุกคน รวมถึงผู้ที่ไม่เคยนั่งสมาธิ",
        }),
      ])
      .returning({ id: services.id, slug: services.slug, durationMin: services.durationMin, price: services.price });
    const S = Object.fromEntries(svc.map((s) => [s.slug, s])) as Record<string, (typeof svc)[number]>;

    const team = await tx
      .insert(staff)
      .values([
        { tenantId, name: "ครูแนน", slug: "kru-nan", title: "ผู้ก่อตั้ง · Hatha / Yin · RYT-500", bio: "ฝึกครูที่ฤๅษีเกศและเชียงใหม่ สอนมา 11 ปี เชื่อว่าโยคะที่ดีคือโยคะที่กลับมาทำได้ทุกวัน ถนัดดูแลผู้เริ่มต้นและคนที่มีอาการปวดหลังจากการทำงาน", avatar: portrait("1592621385612-4d7129426394"), color: "#9A3B1E", sort: 0 },
        { tenantId, name: "ครูพลอย", slug: "kru-ploy", title: "Vinyasa / Power Yoga · RYT-200", bio: "อดีตนักว่ายน้ำทีมชาติเยาวชน หลงรักโฟลว์ที่เร็วและชัด ลำดับท่าของครูพลอยเปลี่ยนทุกสัปดาห์ให้ร่างกายไม่เคยชิน", avatar: portrait("1606406054219-619c4c2e2100"), color: "#4F5D3A", sort: 1 },
        { tenantId, name: "ครูมุก", slug: "kru-mook", title: "Mat Pilates / Breathwork", bio: "นักกายภาพบำบัดที่หันมาสอนพิลาทิสและการหายใจ อธิบายกล้ามเนื้อได้เห็นภาพ เหมาะกับคนที่อยากเข้าใจว่าทำไมท่านี้ถึงช่วย", avatar: portrait("1607746882042-944635dfe10e"), color: "#B07A4A", sort: 2 },
        { tenantId, name: "ครูบีม", slug: "kru-beam", title: "Reformer Pilates · STOTT Certified", bio: "ผู้ดูแลห้องรีฟอร์เมอร์ของเรา ผ่านการรับรอง STOTT Pilates ครบทุกระดับ ละเอียดเรื่องการจัดแนวร่างกายและการฟื้นฟูหลังบาดเจ็บ", avatar: portrait("1507003211169-0a1dd7228f2d"), color: "#5E6B8A", sort: 3 },
      ])
      .returning({ id: staff.id, slug: staff.slug });
    const T = Object.fromEntries(team.map((t) => [t.slug, t.id])) as Record<string, string>;

    const teaches: Record<string, string[]> = {
      "kru-nan": ["hatha-basic", "yin-sound", "prenatal"],
      "kru-ploy": ["vinyasa-flow", "breath"],
      "kru-mook": ["mat-pilates", "breath", "yin-sound"],
      "kru-beam": ["reformer-basic", "reformer-flow"],
    };
    await tx.insert(staffServices).values(Object.entries(teaches).flatMap(([t, list]) => list.map((s) => ({ tenantId, staffId: T[t]!, serviceId: S[s]!.id }))));

    // business hours (staff_id null, service_id null) – class sessions never widen these
    const rules: Array<{ tenantId: string; staffId: string | null; serviceId: string | null; weekday: number; startTime: string; endTime: string }> = [];
    for (let d = 0; d <= 6; d++) rules.push({ tenantId, staffId: null, serviceId: null, weekday: d, startTime: d === 0 || d === 6 ? "08:00" : "06:30", endTime: d === 0 || d === 6 ? "19:00" : "21:00" });
    // weekly timetable: [class, instructor, weekday (0 = Sunday), start]
    const timetable: Array<[string, string, number, string]> = [
      ["hatha-basic", "kru-nan", 1, "07:30"],
      ["hatha-basic", "kru-nan", 3, "18:30"],
      ["hatha-basic", "kru-nan", 6, "09:00"],
      ["vinyasa-flow", "kru-ploy", 2, "18:30"],
      ["vinyasa-flow", "kru-ploy", 4, "07:00"],
      ["vinyasa-flow", "kru-ploy", 0, "10:00"],
      ["yin-sound", "kru-nan", 5, "19:00"],
      ["yin-sound", "kru-mook", 0, "17:00"],
      ["reformer-basic", "kru-beam", 1, "07:00"],
      ["reformer-basic", "kru-beam", 2, "19:30"],
      ["reformer-basic", "kru-beam", 4, "19:30"],
      ["reformer-basic", "kru-beam", 6, "10:00"],
      ["mat-pilates", "kru-mook", 1, "18:30"],
      ["mat-pilates", "kru-mook", 4, "18:30"],
      ["reformer-flow", "kru-beam", 3, "07:00"],
      ["reformer-flow", "kru-beam", 6, "11:30"],
      ["prenatal", "kru-nan", 6, "14:00"],
      ["breath", "kru-mook", 2, "07:00"],
      ["breath", "kru-ploy", 0, "08:00"],
      ["breath", "kru-mook", 5, "07:00"],
    ];
    for (const [slug, who, weekday, start] of timetable) rules.push({ tenantId, staffId: T[who]!, serviceId: S[slug]!.id, weekday, startTime: start, endTime: hmPlus(start, S[slug]!.durationMin) });
    await tx.insert(availabilityRules).values(rules);

    // class passes (clinic_packages): serviceId null = any class
    await tx.insert(clinicPackages).values([
      { tenantId, name: "คลาสพาส 5 ครั้ง", description: "ใช้ได้ทุกคลาสโยคะและแมทพิลาทิส ทุกครู", sessions: 5, price: 225000, compareAtPrice: 275000, validityDays: 60, image: IMG.hatha, sort: 1 },
      { tenantId, name: "คลาสพาส 10 ครั้ง", description: "คุ้มที่สุดสำหรับคนเรียน 2–3 ครั้งต่อสัปดาห์", sessions: 10, price: 400000, compareAtPrice: 550000, validityDays: 90, image: IMG.vinyasa, sort: 2 },
      { tenantId, name: "Reformer พาส 5 ครั้ง", description: "สำหรับคลาส Reformer Pilates Basic โดยเฉพาะ", serviceId: S["reformer-basic"]!.id, sessions: 5, price: 390000, compareAtPrice: 425000, validityDays: 60, image: IMG.reformer, sort: 3 },
    ]);

    // sample students + enrolments, so the timetable shows real seat counts (and one nearly full reformer session)
    const students = await tx
      .insert(customers)
      .values([
        { tenantId, name: "เมย์ ศิริพร", phone: "0812220001" },
        { tenantId, name: "ต้น วรากร", phone: "0812220002" },
        { tenantId, name: "ปุ๊ก ชนิดา", phone: "0812220003" },
        { tenantId, name: "เจน นภัสสร", phone: "0812220004" },
        { tenantId, name: "บอส ธีรภัทร", phone: "0812220005" },
        { tenantId, name: "แพร กมลวรรณ", phone: "0812220006" },
      ])
      .returning({ id: customers.id, name: customers.name, phone: customers.phone });
    const enrol = async (slug: string, who: string, weekday: number, start: string, idx: number[], opts: { past?: boolean; partySize?: number } = {}) => {
      const s = S[slug]!;
      const startsAt = opts.past ? lastSession(weekday, start, now) : nextSession(weekday, start, now);
      const endsAt = addMin(startsAt, s.durationMin);
      for (const i of idx) {
        const st = students[i % students.length]!;
        const number = `BK-${await nextCounter(tx, tenantId, "booking", 1000)}`;
        const partySize = opts.partySize ?? 1;
        await tx.insert(bookings).values({
          tenantId,
          number,
          customerId: st.id,
          serviceId: s.id,
          staffId: null,
          startsAt,
          endsAt,
          status: opts.past ? "completed" : "confirmed",
          source: i % 2 ? "online" : "walk_in",
          customerName: st.name!,
          customerPhone: st.phone,
          partySize,
          price: s.price * partySize,
          depositAmount: s.price * partySize,
          paymentStatus: "paid",
          confirmedAt: new Date(startsAt.getTime() - 3 * 86_400_000),
          completedAt: opts.past ? endsAt : null,
          answers: { instructorId: T[who]!, seededSample: true },
        });
      }
    };
    await enrol("hatha-basic", "kru-nan", 6, "09:00", [0, 1, 2, 3]);
    await enrol("hatha-basic", "kru-nan", 1, "07:30", [4, 5]);
    await enrol("vinyasa-flow", "kru-ploy", 2, "18:30", [1, 3, 5, 0], { partySize: 1 });
    await enrol("vinyasa-flow", "kru-ploy", 2, "18:30", [2], { partySize: 2 });
    await enrol("reformer-basic", "kru-beam", 1, "07:00", [0, 1, 2, 3, 4]);
    await enrol("reformer-basic", "kru-beam", 6, "10:00", [5, 0, 1]);
    await enrol("yin-sound", "kru-nan", 5, "19:00", [2, 4, 5]);
    await enrol("mat-pilates", "kru-mook", 1, "18:30", [3, 1]);
    await enrol("breath", "kru-mook", 2, "07:00", [0, 2, 4, 5]);
    // last week's completed classes (history in the admin calendar and the students' accounts)
    await enrol("hatha-basic", "kru-nan", 3, "18:30", [0, 1, 2], { past: true });
    await enrol("vinyasa-flow", "kru-ploy", 4, "07:00", [1, 3], { past: true });
  },
};
