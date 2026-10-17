import type { TemplateDefinition } from "@rentweb/core/tenant";
import { availabilityRules, clinicPackages, serviceCategories, services, staff, staffServices } from "@rentweb/db";
import { section, hero, serviceList, staffGrid, packageList, imageText, testimonials, features, faq, cta, bookingWidget, stats, gallery } from "@rentweb/storefront/definitions";
import { aboutPage, NEUTRAL_ABOUT, contactPage, legalPages, u, avatar } from "./shared";

export const clinic: TemplateDefinition = {
  key: "clinic",
  name: { th: "คลินิกความงาม / ทันตกรรม", en: "Beauty & dental clinic" },
  description: { th: "จองนัดแพทย์ออนไลน์ ทะเบียนผู้ป่วย บันทึกการรักษา คอร์ส/แพ็กเกจ ธีมพอร์ซเลนหรูสงบ", en: "Online doctor booking, patient records, treatment notes, packages — elegant porcelain theme" },
  category: "booking",
  siteType: "clinic",
  modules: ["clinic", "booking"],
  themePreset: "porcelain",
  // ADMIN_B2-07: the sample brand; new (non-demo) shops get their own name instead
  sampleBrand: ["Lumière Clinic Co., Ltd.","Lumière Clinic"],
  recommendedPresets: ["porcelain", "zen", "quartz"],
  complexity: 4,
  previewImage: u("1570172619644-dfd03ed5d881", 1200),
  settings: {
    tagline: "ความงามที่เป็นธรรมชาติ ดูแลโดยแพทย์ผู้เชี่ยวชาญ",
    contact: {
      phone: "02-123-4567",
      lineId: "@lumiereclinic",
      email: "hello@lumiere.clinic",
      address: "ชั้น 3 เอ็มควอเทียร์ สุขุมวิท 35 กรุงเทพฯ 10110",
      hours: [{ day: "จันทร์ – ศุกร์", time: "11:00 – 20:00" }, { day: "เสาร์ – อาทิตย์", time: "10:00 – 20:00" }],
      instagram: "https://instagram.com",
      facebook: "https://facebook.com",
    },
    header: { cta: { label: "นัดปรึกษาฟรี", href: "/book" } },
    clinic: { licenseNo: "10101234567" },
    payments: {
      promptpayId: "0891112222",
      promptpayName: "Lumière Clinic",
      bankAccounts: [{ bank: "ไทยพาณิชย์", name: "Lumière Clinic Co., Ltd.", number: "987-6-54321-0" }],
      enabled: { promptpay: true, bankTransfer: true },
    },
  },
  moduleConfig: {
    booking: { slotMinutes: 30, maxAdvanceDays: 60, minNoticeHours: 2, cancelHours: 24, depositEnabled: true, reminderHours: [24, 2] },
    clinic: { hnPrefix: "LM", consentVersion: "1.0" },
  },
  navigation: {
    header: [
      { label: "บริการ", href: "/services" },
      { label: "คอร์ส & แพ็กเกจ", href: "/packages" },
      { label: "ทีมแพทย์", href: "/staff" },
      { label: "ผลงาน", href: "/gallery" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "บริการ", href: "/services" },
      { label: "คอร์ส & แพ็กเกจ", href: "/packages" },
      { label: "ทีมแพทย์", href: "/staff" },
      { label: "จองคิว", href: "/book" },
    ],
  },
  pages: [
    {
      slug: "home",
      title: "หน้าแรก",
      kind: "home",
      sections: [
        section(hero, {
          variant: "split",
          eyebrow: "คลินิกเวชกรรม ใบอนุญาตเลขที่ 10101234567",
          heading: "สวยอย่างเป็นธรรมชาติ ในมือแพทย์ที่คุณไว้ใจ",
          subheading: "ปรึกษาฟรีกับแพทย์ผู้เชี่ยวชาญ วางแผนการดูแลเฉพาะบุคคล ด้วยเทคโนโลยีมาตรฐานสากล",
          primaryCta: { label: "นัดปรึกษาฟรี", href: "/book" },
          secondaryCta: { label: "ดูบริการทั้งหมด", href: "/services" },
          image: { url: u("1570172619644-dfd03ed5d881", 1400), alt: "คลินิก" },
          imageSecondary: { url: u("1519823551278-64ac92734fb1", 700), alt: "ผิวสวย" },
          badges: ["แพทย์ประจำทุกวัน", "เครื่องมือมาตรฐาน FDA", "จองออนไลน์ 24 ชม."],
        }),
        section(features, {
          variant: "icons",
          heading: "ดูแลด้วยมาตรฐานโรงพยาบาล",
          items: [
            { icon: "Stethoscope", title: "แพทย์เฉพาะทาง", description: "ตรวจและทำหัตถการโดยแพทย์เท่านั้น" },
            { icon: "ShieldCheck", title: "ผลิตภัณฑ์ของแท้", description: "ตรวจสอบรหัสผลิตภัณฑ์ได้ทุกชิ้น" },
            { icon: "Sparkles", title: "เครื่องมือมาตรฐาน", description: "เทคโนโลยีผ่าน อย. และ FDA" },
            { icon: "HeartHandshake", title: "ดูแลหลังทำ", description: "ติดตามผล 7 วันผ่าน LINE" },
          ],
        }),
        section(serviceList, { eyebrow: "บริการ", heading: "หัตถการและทรีตเมนต์", subheading: "เลือกบริการที่ใช่ แล้วจองคิวได้ทันที", variant: "cards", limit: 6 }),
        section(packageList, { eyebrow: "คุ้มกว่า", heading: "คอร์สและแพ็กเกจ", subheading: "ซื้อคอร์สครั้งเดียว ใช้ได้ตลอดปี เช็กจำนวนครั้งคงเหลือได้ในบัญชีของคุณ" }),
        section(imageText, {
          eyebrow: "ปรึกษาก่อน ไม่มีค่าใช้จ่าย",
          heading: "ทุกการรักษาเริ่มจากการฟัง",
          body: "แพทย์จะวิเคราะห์สภาพผิวด้วยเครื่อง Skin Analyzer และพูดคุยถึงความต้องการของคุณ ก่อนวางแผนการดูแลที่เหมาะกับงบประมาณและไลฟ์สไตล์",
          image: { url: u("1559757148-5c350d0d3c56", 1400), alt: "แพทย์ให้คำปรึกษา" },
          imagePosition: "right",
          bullets: ["วิเคราะห์ผิวด้วยเครื่อง 3D", "แผนการดูแลเฉพาะบุคคล", "ไม่บังคับซื้อคอร์ส"],
          cta: { label: "นัดปรึกษาฟรี", href: "/book" },
        }),
        section(staffGrid, { eyebrow: "ทีมแพทย์", heading: "แพทย์ผู้เชี่ยวชาญของเรา", subheading: "เลือกแพทย์ที่ต้องการได้ตอนจอง" }),
        section(stats, { variant: "row", items: [{ value: 15000, suffix: "+", label: "เคสที่ดูแล" }, { value: 12, suffix: " ปี", label: "ประสบการณ์" }, { value: 4.9, label: "คะแนนรีวิว Google" }, { value: 98, suffix: "%", label: "กลับมาใช้บริการซ้ำ" }] }),
        section(gallery, { heading: "บรรยากาศคลินิก", layout: "filmstrip", images: [{ url: u("1629909613654-28e377c37b09", 1000), alt: "ห้องตรวจ" }, { url: u("1576091160550-2173dba999ef", 1000), alt: "คลินิก" }, { url: u("1540555700478-4be289fbecef", 1000), alt: "ห้องทรีตเมนต์" }, { url: u("1598300042247-d088f8ab3a91", 1000), alt: "ล็อบบี้" }] }),
        section(testimonials, {
          heading: "ความประทับใจจากลูกค้า",
          variant: "spotlight",
          items: [
            { quote: "คุณหมอใจเย็น อธิบายละเอียดทุกขั้นตอน ทำแล้วเป็นธรรมชาติมาก ไม่มีใครรู้เลยว่าทำอะไรมา", name: "คุณมีน", role: "ลูกค้า Botox & Filler", avatar: avatar("meen"), rating: 5 },
            { quote: "จองผ่านเว็บสะดวกมาก เลือกหมอได้ มีเตือนก่อนนัดทาง LINE", name: "คุณแพร", role: "คอร์สเลเซอร์", avatar: avatar("prae"), rating: 5 },
            { quote: "เช็กจำนวนครั้งคอร์สที่เหลือได้เองในเว็บ ไม่ต้องถามพนักงาน", name: "คุณปั้น", role: "คอร์ส HIFU", avatar: avatar("pun"), rating: 5 },
          ],
        }),
        section(bookingWidget, { heading: "จองคิวปรึกษาแพทย์", subheading: "เลือกบริการ แพทย์ วันและเวลา ยืนยันทันที รับการแจ้งเตือนทาง LINE" }),
        section(faq, {
          heading: "คำถามที่พบบ่อย",
          items: [
            { q: "ปรึกษาแพทย์มีค่าใช้จ่ายไหม?", a: "ไม่มีค่าใช้จ่ายสำหรับการปรึกษาครั้งแรก รวมการวิเคราะห์ผิวด้วยเครื่อง" },
            { q: "ต้องมัดจำไหม?", a: "การจองหัตถการที่ใช้เวลานานกว่า 60 นาที มีมัดจำ 500 บาท ซึ่งจะหักจากค่าบริการในวันทำ" },
            { q: "เลื่อนนัดได้ไหม?", a: "เลื่อนได้ฟรีหากแจ้งล่วงหน้าอย่างน้อย 24 ชั่วโมง ผ่านลิงก์ในข้อความยืนยันหรือ LINE" },
          ],
        }),
        section(cta, { variant: "card", heading: "เริ่มต้นดูแลผิวกับแพทย์วันนี้", body: "นัดปรึกษาฟรี ไม่มีข้อผูกมัด", primaryCta: { label: "จองคิวปรึกษา", href: "/book" }, secondaryCta: { label: "ทัก LINE", href: "https://line.me/R/ti/p/@lumiereclinic" } }),
      ],
    },
    {
      slug: "gallery",
      title: "ผลงาน",
      sections: [section(gallery, { heading: "บรรยากาศและผลงาน", subheading: "ภาพผลการรักษาได้รับความยินยอมจากผู้รับบริการแล้ว", layout: "masonry", images: [{ url: u("1512290923902-8a9f81dc236c", 1000), alt: "" }, { url: u("1515377905703-c4788e51af15", 1000), alt: "" }, { url: u("1570172619644-dfd03ed5d881", 1000), alt: "" }, { url: u("1544161515-4ab6ce6db874", 1000), alt: "" }, { url: u("1519823551278-64ac92734fb1", 1000), alt: "" }, { url: u("1540555700478-4be289fbecef", 1000), alt: "" }] })],
    },
    aboutPage({ neutral: NEUTRAL_ABOUT.clinic, heading: "Lumière Clinic — ความงามที่เริ่มจากสุขภาพผิวที่ดี", body: "ก่อตั้งในปี 2014 โดย พญ.ณิชา วรรณกุล แพทย์ผิวหนังที่เชื่อว่าความสวยต้องปลอดภัยและเป็นธรรมชาติ เราไม่ขายคอร์สเกินความจำเป็น และตั้งใจให้ทุกคนที่เดินออกจากคลินิกรู้สึกมั่นใจในตัวเองมากขึ้น" }),
    contactPage({ heading: "ติดต่อและเดินทาง", body: "คลินิกอยู่ชั้น 3 เอ็มควอเทียร์ ติด BTS พร้อมพงษ์ ทางออก 1 มีที่จอดรถในห้าง" }),
    ...legalPages("Lumière Clinic"),
  ],
  async seed(tx, tenantId) {
    const [face, laser, dental] = await tx
      .insert(serviceCategories)
      .values([
        { tenantId, name: "ปรับรูปหน้า", slug: "face", sort: 1 },
        { tenantId, name: "เลเซอร์และผิวพรรณ", slug: "laser", sort: 2 },
        { tenantId, name: "ทันตกรรม", slug: "dental", sort: 3 },
      ])
      .returning({ id: serviceCategories.id });

    const svc = await tx
      .insert(services)
      .values([
        { tenantId, categoryId: face!.id, name: "ปรึกษาแพทย์ + วิเคราะห์ผิว", slug: "consult", durationMin: 30, price: 0, priceNote: "ฟรี", image: u("1559757148-5c350d0d3c56", 800), featured: true, sort: 0, description: "วิเคราะห์สภาพผิวด้วยเครื่อง 3D และวางแผนการดูแลเฉพาะบุคคล" },
        { tenantId, categoryId: face!.id, name: "Botox ลดกราม / ริ้วรอย", slug: "botox", durationMin: 45, price: 490000, priceNote: "เริ่มต้น", depositRequired: true, depositAmount: 50000, image: u("1512290923902-8a9f81dc236c", 800), featured: true, sort: 1, description: "โบท็อกซ์ของแท้ ตรวจสอบรหัสได้ ฉีดโดยแพทย์เท่านั้น" },
        { tenantId, categoryId: face!.id, name: "Filler ปรับรูปหน้า", slug: "filler", durationMin: 60, price: 1290000, priceNote: "ต่อ 1 cc", depositRequired: true, depositAmount: 100000, image: u("1515377905703-c4788e51af15", 800), sort: 2 },
        { tenantId, categoryId: laser!.id, name: "เลเซอร์หน้าใส Pico", slug: "pico", durationMin: 45, price: 350000, image: u("1570172619644-dfd03ed5d881", 800), featured: true, sort: 3, description: "ลดฝ้า กระ จุดด่างดำ ผิวกระจ่างใส" },
        { tenantId, categoryId: laser!.id, name: "HIFU ยกกระชับ", slug: "hifu", durationMin: 90, price: 1590000, depositRequired: true, depositAmount: 100000, image: u("1544161515-4ab6ce6db874", 800), featured: true, sort: 4 },
        { tenantId, categoryId: laser!.id, name: "ทรีตเมนต์ผิว Aqua Peel", slug: "aqua-peel", durationMin: 60, price: 199000, image: u("1540555700478-4be289fbecef", 800), sort: 5 },
        { tenantId, categoryId: dental!.id, name: "ขูดหินปูน + ตรวจฟัน", slug: "scaling", durationMin: 45, price: 120000, image: u("1588776814546-1ffcf47267a5", 800), featured: true, sort: 6 },
        { tenantId, categoryId: dental!.id, name: "ฟอกสีฟัน Zoom", slug: "whitening", durationMin: 90, price: 790000, depositRequired: true, depositAmount: 100000, image: u("1629909613654-28e377c37b09", 800), sort: 7 },
      ])
      .returning({ id: services.id, slug: services.slug });

    const doctors = await tx
      .insert(staff)
      .values([
        { tenantId, name: "พญ.ณิชา วรรณกุล", slug: "dr-nicha", title: "แพทย์ผิวหนัง · ผู้อำนวยการคลินิก", bio: "แพทย์ผิวหนัง จบจุฬาฯ ประสบการณ์ 12 ปี เชี่ยวชาญการปรับรูปหน้าแบบธรรมชาติ", avatar: avatar("dr-nicha"), color: "#B76E79", sort: 0 },
        { tenantId, name: "นพ.กันต์ ศิริวัฒน์", slug: "dr-kan", title: "แพทย์เวชศาสตร์ความงาม", bio: "เชี่ยวชาญเลเซอร์และการยกกระชับด้วย HIFU", avatar: avatar("dr-kan"), color: "#7A9E7E", sort: 1 },
        { tenantId, name: "ทพญ.พิมพ์ชนก ตั้งใจ", slug: "dr-pim", title: "ทันตแพทย์", bio: "ทันตกรรมความงามและการจัดฟันใส", avatar: avatar("dr-pim"), color: "#D4A373", sort: 2 },
      ])
      .returning({ id: staff.id, slug: staff.slug });

    const map: Record<string, string[]> = {
      "dr-nicha": ["consult", "botox", "filler", "pico"],
      "dr-kan": ["consult", "pico", "hifu", "aqua-peel"],
      "dr-pim": ["scaling", "whitening"],
    };
    const links = doctors.flatMap((d) =>
      svc.filter((s) => map[d.slug]!.includes(s.slug)).map((s) => ({ tenantId, staffId: d.id, serviceId: s.id })),
    );
    await tx.insert(staffServices).values(links);

    // business hours (staffId null) + per-doctor schedules
    const rules: Array<{ tenantId: string; staffId: string | null; weekday: number; startTime: string; endTime: string }> = [];
    for (let d = 0; d <= 6; d++) rules.push({ tenantId, staffId: null, weekday: d, startTime: d === 0 || d === 6 ? "10:00" : "11:00", endTime: "20:00" });
    for (const doc of doctors) for (let d = 1; d <= 6; d++) rules.push({ tenantId, staffId: doc.id, weekday: d, startTime: "11:00", endTime: "19:00" });
    await tx.insert(availabilityRules).values(rules);

    await tx.insert(clinicPackages).values([
      { tenantId, name: "คอร์ส Pico หน้าใส 5 ครั้ง", description: "ประหยัดกว่าทำครั้งเดียว 25%", serviceId: svc.find((s) => s.slug === "pico")!.id, sessions: 5, price: 1290000, compareAtPrice: 1750000, validityDays: 365, image: u("1570172619644-dfd03ed5d881", 800), sort: 1 },
      { tenantId, name: "คอร์ส Aqua Peel 10 ครั้ง", description: "ผิวเนียนใสทุก 2 สัปดาห์", serviceId: svc.find((s) => s.slug === "aqua-peel")!.id, sessions: 10, price: 1490000, compareAtPrice: 1990000, validityDays: 365, image: u("1540555700478-4be289fbecef", 800), sort: 2 },
      { tenantId, name: "แพ็กเกจเจ้าสาว (HIFU + Pico + Botox)", description: "ดูแลล่วงหน้า 3 เดือนก่อนวันสำคัญ", sessions: 3, price: 2990000, compareAtPrice: 3430000, validityDays: 180, image: u("1515377905703-c4788e51af15", 800), sort: 3 },
    ]);
  },
};
