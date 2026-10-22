import type { TemplateDefinition, TemplatePage } from "@rentweb/core/tenant";
import { availabilityRules, clinicPackages, serviceCategories, services, staff, staffServices } from "@rentweb/db";
import { section, hero, serviceList, staffGrid, packageList, stickyStory, testimonials, features, faq, cta, bookingWidget, stats, gallery, imageText } from "@rentweb/storefront/definitions";
import { aboutPage, NEUTRAL_ABOUT, contactPage, legalPages, u, avatar } from "./shared";

/** portrait crop (4:5) for staff photos */
const portrait = (id: string) => u(id, 800, "&h=1000&crop=faces");

/** About CTA: break after the question ("มีคำถาม? ทัก|เรามาได้เลย" split the phrase at desktop widths). Demo sections only. */
const ABOUT_CTA = "มีคำถาม? ทักเรามาได้เลย";
const breakAboutCta = (s: TemplatePage["sections"][number]) => (s.type === "cta" && s.props.heading === ABOUT_CTA ? { ...s, props: { ...s.props, heading: ABOUT_CTA.replace(" ", "\n") } } : s);

/** About page: the clinic itself (arched hallway, overlap) and the doctors between the statement and the CTA (demo only; new shops keep the neutral statement page). */
function withAboutStory(page: TemplatePage): TemplatePage {
  return { ...page, sections: [page.sections[0]!, section(imageText, {
        eyebrow: "คลินิกของเรา",
        heading: "มาตรฐานโรงพยาบาล\nในบรรยากาศที่ผ่อนคลาย",
        body: "ทุกห้องทรีตเมนต์เป็นห้องส่วนตัว เครื่องมือทุกชิ้นผ่าน อย. และ FDA ฆ่าเชื้อตามมาตรฐานโรงพยาบาล และมีแพทย์ประจำคลินิกทุกวันที่เปิดทำการ",
        image: { url: u("1786937680099-779e1da6f7f7", 1200), alt: "ทางเดินโค้งและชั้นผลิตภัณฑ์ดูแลผิวในคลินิก" },
        imagePosition: "left",
        bullets: ["แพทย์ประจำทุกวันที่เปิด", "เครื่องมือผ่าน อย. และ FDA", "ห้องทรีตเมนต์ส่วนตัวทุกห้อง"],
        cta: { label: "ดูบริการทั้งหมด", href: "/services" },
        style: "overlap",
      }),
      section(staffGrid, { eyebrow: "ทีมแพทย์", heading: "แพทย์ที่ดูแลคุณ", subheading: "เลือกแพทย์ที่ต้องการได้ตอนจอง" }), ...page.sections.slice(1).map(breakAboutCta)] };
}

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
  // AC-02: the sample business's location / opening-hours copy; new (non-demo) shops get a placeholder or neutral copy
  neutralText: [
    ["คลินิกอยู่ชั้น 3 เอ็มควอเทียร์ ติด BTS พร้อมพงษ์ ทางออก 1 มีที่จอดรถในห้าง", "[ที่ตั้งคลินิก · การเดินทาง · ที่จอดรถ]"],
  ],
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
      { label: "เกี่ยวกับเรา", href: "/about" },
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
          heading: "สวยอย่าง\nเป็นธรรมชาติ\nในมือแพทย์\nที่คุณไว้ใจ",
          subheading: "ปรึกษาฟรีกับแพทย์ผู้เชี่ยวชาญ วางแผนการดูแลเฉพาะบุคคล ด้วยเทคโนโลยีมาตรฐานสากล",
          primaryCta: { label: "นัดปรึกษาฟรี", href: "/book" },
          secondaryCta: { label: "ดูบริการทั้งหมด", href: "/services" },
          image: { url: u("1570172619644-dfd03ed5d881", 1400), alt: "คลินิก" },
          imageSecondary: { url: u("1600428853876-fb5a850b444f", 700), alt: "ลูกกลิ้งหยกและกัวซาสำหรับดูแลผิว" },
          badges: ["แพทย์ประจำทุกวัน", "เครื่องมือมาตรฐาน FDA", "จองออนไลน์ 24 ชม."],
          // §5.3 signature: glass droplets + pearls drifting over the arch-framed portrait (preset porcelain → floating-objects)
          scene: "auto",
        }),
        section(features, {
          variant: "icons",
          columns: 4,
          heading: "ดูแลด้วยมาตรฐานโรงพยาบาล",
          items: [
            { icon: "Stethoscope", title: "แพทย์เฉพาะทาง", description: "ตรวจและทำหัตถการโดยแพทย์เท่านั้น" },
            { icon: "ShieldCheck", title: "ผลิตภัณฑ์ของแท้", description: "ตรวจสอบรหัสผลิตภัณฑ์ได้ทุกชิ้น" },
            { icon: "Sparkles", title: "เครื่องมือมาตรฐาน", description: "เทคโนโลยีผ่าน อย. และ FDA" },
            { icon: "HeartHandshake", title: "ดูแลหลังทำ", description: "ติดตามผล 7 วันผ่าน LINE" },
          ],
        }),
        section(serviceList, { eyebrow: "บริการ", heading: "หัตถการและทรีตเมนต์", subheading: "เลือกหมวดที่สนใจ ดูราคา ระยะเวลา แล้วจองคิวได้ทันที", variant: "cards", limit: 6 }),
        section(packageList, { eyebrow: "คุ้มกว่า", heading: "คอร์สและแพ็กเกจ", subheading: "ซื้อคอร์สครั้งเดียว ใช้ได้ตลอดปี เช็กจำนวนครั้งคงเหลือได้ในบัญชีของคุณ" }),
        // §5.3: sticky story replaces the image-text — every treatment starts by listening
        section(stickyStory, {
          eyebrow: "ปรึกษาก่อน ไม่มีค่าใช้จ่าย",
          heading: "ทุกการรักษาเริ่มจากการฟัง",
          subheading: "แพทย์จะวิเคราะห์สภาพผิวด้วยเครื่อง Skin Analyzer และพูดคุยถึงความต้องการของคุณ ก่อนวางแผนการดูแลที่เหมาะกับงบประมาณและไลฟ์สไตล์",
          mediaStyle: "arch",
          side: "right",
          items: [
            { kicker: "ฟังก่อน ไม่เร่งตัดสินใจ", title: "ปรึกษาแพทย์", body: "พบแพทย์ผู้เชี่ยวชาญแบบตัวต่อตัว ถามได้ทุกข้อสงสัย ไม่มีค่าใช้จ่ายและไม่บังคับซื้อคอร์ส", image: u("1666214277730-e9c7e755e5a3", 1200), chips: ["ฟรี", "30 นาที"], href: "/book?service=consult" },
            { kicker: "เห็นผิวชัดกว่าที่เคย", title: "วิเคราะห์ผิว", body: "สแกนผิวด้วยเครื่อง 3D วัดความชุ่มชื้น เม็ดสี และริ้วรอย เพื่อเลือกการดูแลจากข้อมูลจริง", image: u("1616394584738-fc6e612e71b9", 1200), chips: ["Skin Analyzer 3D"] },
            { kicker: "พอดีกับชีวิตจริง", title: "วางแผนเฉพาะคุณ", body: "แพทย์จัดลำดับการรักษาตามเป้าหมาย งบประมาณ และเวลาพักฟื้นที่คุณมี พร้อมบอกผลที่คาดหวังอย่างตรงไปตรงมา", image: u("1612817288484-6f916006741a", 1200), chips: ["แผนเฉพาะบุคคล", "ไม่บังคับซื้อคอร์ส"] },
            { kicker: "ดูแลจนกว่าจะมั่นใจ", title: "ติดตามผล", body: "ติดตามอาการ 7 วันผ่าน LINE นัดตรวจซ้ำได้ฟรี และเช็กครั้งคงเหลือของคอร์สได้เองในบัญชี", image: u("1617897903246-719242758050", 1200), chips: ["LINE 7 วัน"], href: "/packages" },
          ],
        }),
        section(staffGrid, { eyebrow: "ทีมแพทย์", heading: "แพทย์ผู้\u2060เชี่ยวชาญของเรา", subheading: "เลือกแพทย์ที่ต้องการได้ตอนจอง" }),
        section(stats, { variant: "row", items: [{ value: 15000, suffix: "+", label: "เคสที่ดูแล" }, { value: 12, suffix: " ปี", label: "ประสบการณ์" }, { value: 4.9, label: "คะแนนรีวิว Google" }, { value: 98, suffix: "%", label: "กลับมาใช้บริการซ้ำ" }] }),
        section(gallery, { heading: "บรรยากาศคลินิก", layout: "filmstrip", images: [{ url: u("1631248055158-edec7a3c072b", 1000), alt: "ล็อบบี้ต้อนรับ แสงธรรมชาติ" }, { url: u("1595871151608-bc7abd1caca3", 1000), alt: "ห้องทรีตเมนต์ส่วนตัว" }, { url: u("1629909615184-74f495363b67", 1000), alt: "ห้องทันตกรรม" }, { url: u("1786937680099-779e1da6f7f7", 1000), alt: "ทางเดินโค้งและชั้นผลิตภัณฑ์ดูแลผิว" }, { url: u("1762625570087-6d98fca29531", 1000), alt: "มุมนั่งรอแสงธรรมชาติ" }] }),
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
      sections: [
        section(gallery, { heading: "บรรยากาศและผลงาน", subheading: "ภาพผลการรักษาได้รับความยินยอมจากผู้รับบริการแล้ว", layout: "masonry", images: [{ url: u("1631248055158-edec7a3c072b", 1000), alt: "ล็อบบี้ต้อนรับของคลินิก" }, { url: u("1512290923902-8a9f81dc236c", 1000), alt: "แพทย์ฉีดโบท็อกซ์ปรับรูปหน้า" }, { url: u("1595871151608-bc7abd1caca3", 1000), alt: "ห้องทรีตเมนต์ส่วนตัว" }, { url: u("1552693673-1bf958298935", 1000), alt: "ทรีตเมนต์ผิวหน้าด้วยเครื่องมือแพทย์" }, { url: u("1616394584738-fc6e612e71b9", 1000), alt: "มาสก์บำรุงหลังทำเลเซอร์" }, { url: u("1606811841689-23dfddce3e95", 1000), alt: "ทันตแพทย์อธิบายผลเอกซเรย์ฟัน" }, { url: u("1786937680099-779e1da6f7f7", 1000), alt: "ทางเดินโค้งและชั้นผลิตภัณฑ์ดูแลผิว" }, { url: u("1762625570087-6d98fca29531", 1000), alt: "มุมนั่งรอแสงธรรมชาติ" }, { url: u("1629909615184-74f495363b67", 1000), alt: "ห้องทันตกรรม" }] }),
        section(cta, { variant: "card", heading: "อยากได้ผลลัพธ์ที่เป็นธรรมชาติแบบนี้", body: "เริ่มจากการปรึกษาแพทย์ฟรี วิเคราะห์ผิวด้วยเครื่อง 3D ไม่มีข้อผูกมัด", primaryCta: { label: "นัดปรึกษาฟรี", href: "/book" }, secondaryCta: { label: "ดูบริการทั้งหมด", href: "/services" } }),
      ],
    },
    withAboutStory(aboutPage({ neutral: NEUTRAL_ABOUT.clinic, heading: "Lumière Clinic\u00a0—\nความงามที่เริ่มจากสุขภาพผิวที่ดี", body: "ก่อตั้งในปี 2014 โดย พญ.ณิชา วรรณกุล แพทย์ผิวหนังที่เชื่อว่าความสวยต้องปลอดภัยและเป็นธรรมชาติ เราไม่ขายคอร์สเกินความจำเป็น และตั้งใจให้ทุกคนที่เดินออกจากคลินิกรู้สึกมั่นใจในตัวเองมากขึ้น" })),
    contactPage({ heading: "ติดต่อและเดินทาง", body: "คลินิกอยู่ชั้น 3 เอ็มควอเทียร์ ติด BTS พร้อมพงษ์ ทางออก 1 มีที่จอดรถในห้าง", variant: "chips", interests: ["ปรึกษาปัญหาผิว", "Botox / Filler", "เลเซอร์และ HIFU", "ทันตกรรมความงาม", "คอร์สและแพ็กเกจ"] }),
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
        { tenantId, categoryId: face!.id, name: "ปรึกษาแพทย์ + วิเคราะห์ผิว", slug: "consult", durationMin: 30, price: 0, priceNote: "ฟรี", image: u("1666214277730-e9c7e755e5a3", 800), featured: true, sort: 0, description: "วิเคราะห์สภาพผิวด้วยเครื่อง 3D และวางแผนการดูแลเฉพาะบุคคล" },
        { tenantId, categoryId: face!.id, name: "Botox ลดกราม / ริ้วรอย", slug: "botox", durationMin: 45, price: 490000, priceNote: "เริ่มต้น", depositRequired: true, depositAmount: 50000, image: u("1512290923902-8a9f81dc236c", 800), featured: true, sort: 1, description: "โบท็อกซ์ของแท้ ตรวจสอบรหัสได้ ฉีดโดยแพทย์เท่านั้น" },
        { tenantId, categoryId: face!.id, name: "Filler ปรับรูปหน้า", slug: "filler", durationMin: 60, price: 1290000, priceNote: "ต่อ 1 cc", depositRequired: true, depositAmount: 100000, image: u("1573461160327-b450ce3d8e7f", 800), sort: 2 },
        { tenantId, categoryId: laser!.id, name: "เลเซอร์หน้าใส Pico", slug: "pico", durationMin: 45, price: 350000, image: u("1552693673-1bf958298935", 800), featured: true, sort: 3, description: "ลดฝ้า กระ จุดด่างดำ ผิวกระจ่างใส" },
        { tenantId, categoryId: laser!.id, name: "HIFU ยกกระชับ", slug: "hifu", durationMin: 90, price: 1590000, depositRequired: true, depositAmount: 100000, image: u("1595871151608-bc7abd1caca3", 800), featured: true, sort: 4 },
        { tenantId, categoryId: laser!.id, name: "ทรีตเมนต์ผิว Aqua Peel", slug: "aqua-peel", durationMin: 60, price: 199000, image: u("1616394584738-fc6e612e71b9", 800), sort: 5 },
        { tenantId, categoryId: dental!.id, name: "ขูดหินปูน + ตรวจฟัน", slug: "scaling", durationMin: 45, price: 120000, image: u("1606811841689-23dfddce3e95", 800), featured: true, sort: 6 },
        { tenantId, categoryId: dental!.id, name: "ฟอกสีฟัน Zoom", slug: "whitening", durationMin: 90, price: 790000, depositRequired: true, depositAmount: 100000, image: u("1629909613654-28e377c37b09", 800), sort: 7 },
      ])
      .returning({ id: services.id, slug: services.slug });

    const doctors = await tx
      .insert(staff)
      .values([
        { tenantId, name: "พญ.ณิชา วรรณกุล", slug: "dr-nicha", title: "แพทย์ผิวหนัง · ผู้อำนวยการคลินิก", bio: "แพทย์ผิวหนัง จบจุฬาฯ ประสบการณ์ 12 ปี เชี่ยวชาญการปรับรูปหน้าแบบธรรมชาติ", avatar: portrait("1614608682850-e0d6ed316d47"), color: "#B76E79", sort: 0 },
        { tenantId, name: "นพ.กันต์ ศิริวัฒน์", slug: "dr-kan", title: "แพทย์เวชศาสตร์ความงาม", bio: "เชี่ยวชาญเลเซอร์และการยกกระชับด้วย HIFU", avatar: portrait("1622902046580-2b47f47f5471"), color: "#7A9E7E", sort: 1 },
        { tenantId, name: "ทพญ.พิมพ์ชนก ตั้งใจ", slug: "dr-pim", title: "ทันตแพทย์", bio: "ทันตกรรมความงามและการจัดฟันใส", avatar: portrait("1594824476967-48c8b964273f"), color: "#D4A373", sort: 2 },
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
      { tenantId, name: "คอร์ส Pico หน้าใส 5 ครั้ง", description: "ประหยัดกว่าทำครั้งเดียว 25%", serviceId: svc.find((s) => s.slug === "pico")!.id, sessions: 5, price: 1290000, compareAtPrice: 1750000, validityDays: 365, image: u("1552693673-1bf958298935", 800), sort: 1 },
      { tenantId, name: "คอร์ส Aqua Peel 10 ครั้ง", description: "ผิวเนียนใสทุก 2 สัปดาห์", serviceId: svc.find((s) => s.slug === "aqua-peel")!.id, sessions: 10, price: 1490000, compareAtPrice: 1990000, validityDays: 365, image: u("1616394584738-fc6e612e71b9", 800), sort: 2 },
      { tenantId, name: "แพ็กเกจเจ้าสาว (HIFU + Pico + Botox)", description: "ดูแลล่วงหน้า 3 เดือนก่อนวันสำคัญ", sessions: 3, price: 2990000, compareAtPrice: 3430000, validityDays: 180, image: u("1600428853876-fb5a850b444f", 800), sort: 3 },
    ]);
  },
};
