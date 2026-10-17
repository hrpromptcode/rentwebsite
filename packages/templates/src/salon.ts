import type { TemplateDefinition } from "@rentweb/core/tenant";
import { availabilityRules, serviceCategories, services, staff, staffServices } from "@rentweb/db";
import { section, hero, serviceList, staffGrid, bookingWidget, imageText, testimonials, features, faq, cta, gallery, steps } from "@rentweb/storefront/definitions";
import { aboutPage, NEUTRAL_ABOUT, contactPage, legalPages, u, avatar } from "./shared";

export const salon: TemplateDefinition = {
  key: "salon",
  name: { th: "จองคิว ซาลอน / สปา / นวด", en: "Salon & spa booking" },
  description: { th: "ระบบจองคิวออนไลน์ เลือกช่าง เวลา มัดจำ เตือนนัดผ่าน LINE ธีมเซนสงบ", en: "Online booking with staff selection, deposits and LINE reminders — calm zen theme" },
  category: "booking",
  siteType: "salon",
  modules: ["booking"],
  themePreset: "zen",
  // ADMIN_B2-07: the sample brand; new (non-demo) shops get their own name instead
  sampleBrand: ["สบาย สบาย"],
  recommendedPresets: ["zen", "porcelain", "candy", "midnight"],
  complexity: 2,
  previewImage: u("1560066984-138dadb4c035", 1200),
  settings: {
    tagline: "พักกาย พักใจ ในพื้นที่ที่เป็นของคุณ",
    contact: {
      phone: "089-111-2222",
      lineId: "@sabaisabai",
      address: "55 ถ.สุขุมวิท 31 (ซอยสวัสดี) กรุงเทพฯ 10110",
      hours: [{ day: "ทุกวัน", time: "10:00 – 22:00" }],
      instagram: "https://instagram.com",
    },
    header: { cta: { label: "จองคิว", href: "/book" } },
    payments: {
      promptpayId: "0891112222",
      promptpayName: "Sabai Sabai Spa",
      bankAccounts: [{ bank: "ไทยพาณิชย์", name: "Sabai Sabai Spa Co., Ltd.", number: "987-6-54321-0" }],
      enabled: { promptpay: true, bankTransfer: true },
    },
  },
  moduleConfig: { booking: { slotMinutes: 30, maxAdvanceDays: 30, minNoticeHours: 1, cancelHours: 12, depositEnabled: true, reminderHours: [24, 2] } },
  navigation: {
    header: [
      { label: "บริการ", href: "/services" },
      { label: "ทีมเทอราพิสต์", href: "/staff" },
      { label: "บรรยากาศ", href: "/gallery" },
      { label: "เกี่ยวกับเรา", href: "/about" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "บริการ", href: "/services" },
      { label: "จองคิว", href: "/book" },
      { label: "ติดต่อ", href: "/contact" },
    ],
  },
  pages: [
    {
      slug: "home",
      title: "หน้าแรก",
      kind: "home",
      sections: [
        section(hero, {
          variant: "centered",
          eyebrow: "สปาและนวดไทย · สุขุมวิท 31",
          heading: "หายใจเข้าช้า ๆ แล้วปล่อยให้เราดูแล",
          subheading: "นวดไทยโบราณ อโรมา และทรีตเมนต์ผิว โดยเทอราพิสต์ที่ผ่านการรับรองจากกระทรวงสาธารณสุข",
          primaryCta: { label: "จองคิวตอนนี้", href: "/book" },
          secondaryCta: { label: "ดูบริการ", href: "/services" },
          image: { url: u("1540555700478-4be289fbecef", 1800), alt: "สปา" },
          badges: ["จองออนไลน์ยืนยันทันที", "เลือกเทอราพิสต์ได้", "ห้องส่วนตัวทุกห้อง"],
        }),
        section(serviceList, { eyebrow: "บริการ", heading: "ทรีตเมนต์ของเรา", subheading: "ทุกคอร์สรวมชาสมุนไพรและห้องอาบน้ำส่วนตัว", variant: "menu", limit: 8 }),
        section(steps, {
          eyebrow: "จองง่าย",
          heading: "จองคิวใน 1 นาที",
          items: [
            { title: "เลือกบริการและเทอราพิสต์", description: "หรือเลือก ใครก็ได้ที่ว่าง เพื่อดูเวลาว่างมากที่สุด" },
            { title: "เลือกวันและเวลา", description: "เห็นเฉพาะช่วงที่ว่างจริง ไม่ต้องรอยืนยัน" },
            { title: "ยืนยันด้วยเบอร์โทร", description: "รับข้อความยืนยันและเตือนล่วงหน้า 24 ชั่วโมงทาง LINE" },
          ],
        }),
        section(imageText, {
          eyebrow: "พื้นที่ของเรา",
          heading: "บ้านเก่าในซอยสวัสดี ที่เงียบจนได้ยินเสียงใบไม้",
          body: "เราปรับบ้านไม้สองชั้นให้เป็นห้องนวดส่วนตัว 6 ห้อง ล้อมด้วยสวนเล็ก ๆ ทุกห้องมีห้องอาบน้ำในตัว ใช้น้ำมันหอมระเหยออร์แกนิกจากเชียงใหม่",
          image: { url: u("1544161515-4ab6ce6db874", 1400), alt: "ห้องนวด" },
          imagePosition: "left",
          style: "overlap",
        }),
        section(staffGrid, { eyebrow: "ทีม", heading: "เทอราพิสต์ของเรา", subheading: "ผ่านการรับรองหลักสูตรนวดไทย 150 ชั่วโมงขึ้นไปทุกคน" }),
        section(gallery, { heading: "บรรยากาศ", layout: "filmstrip", images: [{ url: u("1540555700478-4be289fbecef", 1000), alt: "" }, { url: u("1544161515-4ab6ce6db874", 1000), alt: "" }, { url: u("1570172619644-dfd03ed5d881", 1000), alt: "" }, { url: u("1600334129128-685c5582fd35", 1000), alt: "" }] }),
        section(testimonials, {
          heading: "รีวิวจากลูกค้า",
          variant: "cards",
          items: [
            { quote: "นวดดีมาก พี่เทอราพิสต์ถามจุดที่ปวดก่อน แล้วโฟกัสให้เลย กลับมาเป็นครั้งที่ 5", name: "คุณปาล์ม", role: "นวดไทย 90 นาที", avatar: avatar("palm"), rating: 5 },
            { quote: "จองผ่านเว็บแล้วได้เวลาเลย ไม่ต้องทักรอตอบ มีเตือนก่อน 1 วันด้วย", name: "คุณเอิร์น", role: "อโรมาเทอราพี", avatar: avatar("earn"), rating: 5 },
            { quote: "ร้านเงียบ สะอาด เหมาะกับการมาคนเดียวมาก", name: "Sarah K.", role: "นักท่องเที่ยว", avatar: avatar("sarah"), rating: 5 },
          ],
        }),
        section(bookingWidget, { heading: "จองคิวของคุณ", subheading: "เลือกบริการ วัน และเวลา ยืนยันทันทีด้วยเบอร์โทรศัพท์" }),
        section(faq, {
          heading: "คำถามที่พบบ่อย",
          items: [
            { q: "ควรมาถึงก่อนเวลาไหม?", a: "แนะนำมาก่อน 10 นาที เพื่อเปลี่ยนชุดและดื่มชาสมุนไพร" },
            { q: "ยกเลิก/เลื่อนได้ไหม?", a: "ได้ฟรีก่อนเวลานัด 12 ชั่วโมง หลังจากนั้นขอสงวนสิทธิ์ริบมัดจำ" },
            { q: "มีคู่/กลุ่มไหม?", a: "มีห้องคู่ 2 ห้อง เลือก \"แพ็กเกจคู่รัก (2 ท่าน)\" จองครั้งเดียวได้ทั้ง 2 ท่าน" },
          ],
        }),
        section(cta, { variant: "banner", heading: "ให้วันนี้เป็นวันที่คุณได้พัก", body: "จองคิวล่วงหน้า รับส่วนลด 10% สำหรับการนัดครั้งแรก", primaryCta: { label: "จองคิว", href: "/book" } }),
      ],
    },
    { slug: "gallery", title: "บรรยากาศ", sections: [section(gallery, { heading: "บรรยากาศ", layout: "masonry", images: [{ url: u("1540555700478-4be289fbecef", 1000), alt: "" }, { url: u("1544161515-4ab6ce6db874", 1000), alt: "" }, { url: u("1570172619644-dfd03ed5d881", 1000), alt: "" }, { url: u("1600334129128-685c5582fd35", 1000), alt: "" }, { url: u("1522337660859-02fbefca4702", 1000), alt: "" }] })] },
    aboutPage({ neutral: NEUTRAL_ABOUT.salon, heading: "สบาย สบาย — เริ่มจากความเชื่อว่าการพักผ่อนคือสิ่งจำเป็น", body: "เราเปิดในปี 2016 โดยอดีตพยาบาลที่เห็นว่าคนเมืองพักผ่อนน้อยเกินไป ทีมเทอราพิสต์ทุกคนผ่านการอบรมและมีใบประกอบวิชาชีพ เราจ่ายค่าตอบแทนที่เป็นธรรม เพราะเชื่อว่ามือที่มีความสุขจึงจะส่งต่อความสบายได้" }),
    contactPage(),
    ...legalPages("สบาย สบาย"),
  ],
  async seed(tx, tenantId) {
    const [massage, aroma, skin] = await tx
      .insert(serviceCategories)
      .values([
        { tenantId, name: "นวดไทย", slug: "thai", sort: 0 },
        { tenantId, name: "อโรมาและน้ำมัน", slug: "aroma", sort: 1 },
        { tenantId, name: "ผิวพรรณ", slug: "skin", sort: 2 },
      ])
      .returning({ id: serviceCategories.id });

    const svc = await tx
      .insert(services)
      .values([
        { tenantId, categoryId: massage!.id, name: "นวดไทยโบราณ 60 นาที", slug: "thai-60", durationMin: 60, bufferAfterMin: 15, price: 59000, image: u("1544161515-4ab6ce6db874", 800), featured: true, sort: 0 },
        { tenantId, categoryId: massage!.id, name: "นวดไทยโบราณ 90 นาที", slug: "thai-90", durationMin: 90, bufferAfterMin: 15, price: 85000, image: u("1544161515-4ab6ce6db874", 800), featured: true, sort: 1 },
        { tenantId, categoryId: massage!.id, name: "นวดเท้าและสครับ 60 นาที", slug: "foot-60", durationMin: 60, bufferAfterMin: 10, price: 49000, image: u("1600334129128-685c5582fd35", 800), sort: 2 },
        { tenantId, categoryId: aroma!.id, name: "อโรมาเทอราพี 90 นาที", slug: "aroma-90", durationMin: 90, bufferAfterMin: 15, price: 129000, depositRequired: true, depositAmount: 30000, image: u("1540555700478-4be289fbecef", 800), featured: true, sort: 3 },
        { tenantId, categoryId: aroma!.id, name: "นวดหินร้อน 90 นาที", slug: "hot-stone", durationMin: 90, bufferAfterMin: 20, price: 149000, depositRequired: true, depositAmount: 30000, image: u("1570172619644-dfd03ed5d881", 800), sort: 4 },
        { tenantId, categoryId: skin!.id, name: "ทรีตเมนต์หน้าสมุนไพร 60 นาที", slug: "facial", durationMin: 60, bufferAfterMin: 15, price: 99000, image: u("1519823551278-64ac92734fb1", 800), sort: 5 },
        { tenantId, categoryId: skin!.id, name: "สครับผิวทั้งตัว 45 นาที", slug: "scrub", durationMin: 45, bufferAfterMin: 15, price: 79000, image: u("1522337660859-02fbefca4702", 800), sort: 6 },
        { tenantId, categoryId: aroma!.id, name: "แพ็กเกจคู่รัก 120 นาที (2 ท่าน)", slug: "couple", durationMin: 120, bufferAfterMin: 20, price: 299000, capacity: 2, seatsPerBooking: 2, depositRequired: true, depositAmount: 50000, image: u("1540555700478-4be289fbecef", 800), featured: true, sort: 7 },
      ])
      .returning({ id: services.id, slug: services.slug });

    const team = await tx
      .insert(staff)
      .values([
        { tenantId, name: "พี่แอน", slug: "ann", title: "หัวหน้าเทอราพิสต์ · 15 ปี", avatar: avatar("ann-spa"), color: "#2F5D50", sort: 0 },
        { tenantId, name: "พี่มะลิ", slug: "mali", title: "เทอราพิสต์ · นวดไทย/หินร้อน", avatar: avatar("mali-spa"), color: "#D4A373", sort: 1 },
        { tenantId, name: "พี่น้ำ", slug: "nam", title: "เทอราพิสต์ · อโรมา/ผิวพรรณ", avatar: avatar("nam-spa"), color: "#7FB8A4", sort: 2 },
        { tenantId, name: "พี่โบว์", slug: "bow", title: "เทอราพิสต์ · นวดเท้า", avatar: avatar("bow-spa"), color: "#8A6E7C", sort: 3 },
      ])
      .returning({ id: staff.id, slug: staff.slug });

    await tx.insert(staffServices).values(team.flatMap((t) => svc.map((s) => ({ tenantId, staffId: t.id, serviceId: s.id }))));

    const rules: Array<{ tenantId: string; staffId: string | null; weekday: number; startTime: string; endTime: string }> = [];
    for (let d = 0; d <= 6; d++) rules.push({ tenantId, staffId: null, weekday: d, startTime: "10:00", endTime: "22:00" });
    for (const [i, t] of team.entries()) for (let d = 0; d <= 6; d++) if (d !== (i + 1) % 7) rules.push({ tenantId, staffId: t.id, weekday: d, startTime: i % 2 ? "13:00" : "10:00", endTime: i % 2 ? "22:00" : "19:00" });
    await tx.insert(availabilityRules).values(rules);
  },
};
