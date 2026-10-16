import type { TemplateDefinition } from "@rentweb/core/tenant";
import { categories, products, shippingMethods } from "@rentweb/db";
import { section, hero, marquee, productGrid, imageText, gallery, testimonials, features, faq, cta } from "@rentweb/storefront/definitions";
import { aboutPage, contactPage, legalPages, u, avatar } from "./shared";

export const cafe: TemplateDefinition = {
  key: "cafe",
  name: { th: "คาเฟ่ / เบเกอรี่ สั่งล่วงหน้า", en: "Cafe & bakery pre-order" },
  description: { th: "สั่งเค้กและเบเกอรี่ล่วงหน้า เลือกวันรับ จ่าย PromptPay ธีมแคนดี้สดใสเด้งดึ๋ง", en: "Pre-order cakes & pastries with pickup date, PromptPay — playful candy theme" },
  category: "hospitality",
  siteType: "cafe",
  modules: ["commerce"],
  themePreset: "candy",
  recommendedPresets: ["candy", "ember", "aurora"],
  complexity: 2,
  previewImage: u("1517686469429-8bdb88b9f907", 1200),
  settings: {
    tagline: "เบเกอรี่โฮมเมด อบใหม่ทุกเช้า",
    contact: { phone: "095-555-1212", lineId: "@sugarpuff", address: "12 ถ.เจริญกรุง 43 บางรัก กรุงเทพฯ", hours: [{ day: "อังคาร – อาทิตย์", time: "08:00 – 18:00" }, { day: "จันทร์", time: "ปิด" }], instagram: "https://instagram.com" },
    header: { cta: { label: "สั่งเค้กล่วงหน้า", href: "/products" } },
    payments: {
      promptpayId: "0812345678",
      promptpayName: "Sugar Puff Bakery",
      bankAccounts: [{ bank: "กสิกรไทย", name: "Sugar Puff Bakery จำกัด", number: "123-4-56789-0" }],
      enabled: { promptpay: true, bankTransfer: true, cod: true },
    },
  },
  moduleConfig: { commerce: { currency: "THB", allowGuestCheckout: true, pickupDateRequired: true, payments: { promptpay: true, bankTransfer: true } } },
  navigation: {
    header: [
      { label: "เมนูเบเกอรี่", href: "/products" },
      { label: "เค้กวันเกิด", href: "/collections/cakes" },
      { label: "เรื่องราว", href: "/about" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "เมนูเบเกอรี่", href: "/products" },
      { label: "เค้กวันเกิด", href: "/collections/cakes" },
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
          variant: "split",
          eyebrow: "อบใหม่ทุกเช้า 6 โมง",
          heading: "ขนมอบที่ทำให้วันธรรมดา หวานขึ้นนิดนึง",
          subheading: "ครัวซองต์เนยฝรั่งเศส เค้กโฮมเมดสูตรลดหวาน และกาแฟคั่วเอง สั่งล่วงหน้าแล้วมารับได้เลยไม่ต้องรอ",
          primaryCta: { label: "สั่งล่วงหน้า", href: "/products" },
          secondaryCta: { label: "ดูเค้กวันเกิด", href: "/collections/cakes" },
          image: { url: u("1517686469429-8bdb88b9f907", 1400), alt: "คาเฟ่" },
          imageSecondary: { url: u("1551024601-bec78aea704b", 700), alt: "ขนม" },
          badges: ["สั่งล่วงหน้า 1 วัน", "รับที่ร้าน / ส่ง Grab", "ลดหวาน 30%"],
        }),
        section(marquee, { items: ["ครัวซองต์เนยแท้", "เค้กมะพร้าวอ่อน", "คุกกี้ช็อกโกแลตชิป", "ชีสเค้กญี่ปุ่น", "กาแฟคั่วเอง"], style: "badges", speed: 30 }),
        section(productGrid, { eyebrow: "วันนี้มีอะไรบ้าง", heading: "เมนูประจำวัน", source: "featured", limit: 8, columns: 4, cardStyle: "standard" }),
        section(imageText, {
          eyebrow: "เค้กสั่งทำ",
          heading: "เค้กวันเกิดที่ออกแบบได้เอง",
          body: "เลือกฐานเค้ก ครีม และข้อความได้ ส่งแบบมาทาง LINE ก็ได้ สั่งล่วงหน้า 2 วัน รับที่ร้านหรือส่งทั่วกรุงเทพฯ",
          image: { url: u("1578985545062-69928b1d9587", 1400), alt: "เค้ก" },
          imagePosition: "right",
          bullets: ["เลือกขนาด 1–3 ปอนด์", "เขียนข้อความฟรี", "กล่องของขวัญพร้อมเทียน"],
          cta: { label: "ดูเค้กทั้งหมด", href: "/collections/cakes" },
          style: "overlap",
        }),
        section(features, {
          variant: "icons",
          heading: "ทำไมลูกค้าถึงกลับมา",
          items: [
            { icon: "Croissant", title: "อบใหม่ทุกเช้า", description: "ไม่มีของค้างคืน ขายหมดคือหมด" },
            { icon: "Leaf", title: "ลดหวาน 30%", description: "ใช้น้ำตาลน้อยกว่าสูตรทั่วไป แต่ยังอร่อย" },
            { icon: "Clock", title: "สั่งแล้วมารับเลย", description: "ไม่ต้องต่อคิว เตรียมไว้รอตามเวลาที่เลือก" },
            { icon: "Gift", title: "แพ็กเป็นของขวัญ", description: "กล่องสวย ริบบิ้น และการ์ดฟรี" },
          ],
        }),
        section(gallery, { heading: "มุมน่ารักในร้าน", layout: "grid", columns: 4, images: [{ url: u("1517686469429-8bdb88b9f907", 800), alt: "" }, { url: u("1554118811-1e0d58224f24", 800), alt: "" }, { url: u("1509042239860-f550ce710b93", 800), alt: "" }, { url: u("1495474472287-4d71bcdd2085", 800), alt: "" }] }),
        section(testimonials, { heading: "คำชมที่ทำให้เราอยากตื่นเช้า", variant: "marquee", items: [
          { quote: "ครัวซองต์กรอบนอกนุ่มใน เนยหอมมาก สั่งทุกวันศุกร์", name: "คุณมิ้น", role: "ลูกค้าประจำ", avatar: avatar("mint-cafe"), rating: 5 },
          { quote: "เค้กวันเกิดลูกสวยตรงปก เด็ก ๆ ชอบมาก", name: "คุณแม่น้ำหวาน", role: "สั่งเค้ก 2 ปอนด์", avatar: avatar("mom-cafe"), rating: 5 },
          { quote: "สั่งผ่านเว็บแล้วมารับ ไม่ต้องรอ สะดวกมากช่วงเช้ารีบ ๆ", name: "คุณต้น", role: "ออฟฟิศแถวนี้", avatar: avatar("ton-cafe"), rating: 5 },
        ] }),
        section(faq, { heading: "คำถามที่พบบ่อย", items: [
          { q: "ต้องสั่งล่วงหน้ากี่วัน?", a: "เบเกอรี่ทั่วไป 1 วัน (สั่งก่อน 18:00 รับพรุ่งนี้) เค้กสั่งทำ 2 วัน" },
          { q: "ส่งถึงบ้านไหม?", a: "ส่งผ่าน Grab/Lalamove ในกรุงเทพฯ คิดค่าส่งตามจริง หรือรับที่ร้านฟรี" },
          { q: "มีเมนูไม่มีกลูเตนไหม?", a: "มีบราวนี่และคุกกี้ไม่มีกลูเตนทุกวัน" },
        ] }),
        section(cta, { variant: "card", heading: "พรุ่งนี้เช้าอยากกินอะไร?", body: "สั่งก่อน 18:00 วันนี้ รับได้พรุ่งนี้ตั้งแต่ 8 โมง", primaryCta: { label: "สั่งล่วงหน้า", href: "/products" } }),
      ],
    },
    aboutPage({ heading: "Sugar Puff — ครัวเล็ก ๆ ที่เริ่มจากเตาอบในคอนโด", body: "เริ่มจากการอบคุกกี้ให้เพื่อนในปี 2020 จนมีคนขอซื้อ จึงเปิดร้านเล็ก ๆ ที่เจริญกรุงในปี 2022 เราทำทุกอย่างเองในครัวหลังร้าน ใช้เนยฝรั่งเศสและไข่ไก่อารมณ์ดี และลดน้ำตาลลง 30% เพราะอยากให้กินได้ทุกวัน" }),
    contactPage(),
    ...legalPages("Sugar Puff"),
  ],
  async seed(tx, tenantId) {
    const [pastry, cakes, drinks] = await tx
      .insert(categories)
      .values([
        { tenantId, name: "เบเกอรี่", slug: "pastry", sort: 0 },
        { tenantId, name: "เค้ก", slug: "cakes", sort: 1 },
        { tenantId, name: "เครื่องดื่ม", slug: "drinks", sort: 2 },
      ])
      .returning({ id: categories.id });
    const items = [
      { n: "ครัวซองต์เนยฝรั่งเศส", s: "croissant", p: 7500, c: pastry!.id, img: u("1555507036-ab1f4038808a", 900), f: true, stock: 40 },
      { n: "แอลมอนด์ครัวซองต์", s: "almond-croissant", p: 9500, c: pastry!.id, img: u("1509440159596-0249088772ff", 900), f: true, stock: 30 },
      { n: "คุกกี้ช็อกโกแลตชิป (3 ชิ้น)", s: "cookies", p: 12000, c: pastry!.id, img: u("1499636136210-6f4ee915583e", 900), f: true, stock: 50 },
      { n: "บราวนี่ไม่มีกลูเตน", s: "gf-brownie", p: 8500, c: pastry!.id, img: u("1606313564200-e75d5e30476c", 900), stock: 25 },
      { n: "ชีสเค้กญี่ปุ่น 1 ปอนด์", s: "jp-cheesecake", p: 49000, c: cakes!.id, img: u("1524351199678-941a58a3df50", 900), f: true, stock: 10, type: "preorder" },
      { n: "เค้กมะพร้าวอ่อน 1 ปอนด์", s: "coconut-cake", p: 55000, c: cakes!.id, img: u("1578985545062-69928b1d9587", 900), f: true, stock: 10, type: "preorder" },
      { n: "เค้กวันเกิดสั่งทำ (เริ่มต้น)", s: "custom-cake", p: 89000, c: cakes!.id, img: u("1535141192574-5d4897c12636", 900), f: true, stock: 5, type: "preorder" },
      { n: "ลาเต้คั่วเอง (เย็น)", s: "latte", p: 8500, c: drinks!.id, img: u("1509042239860-f550ce710b93", 900), stock: 100 },
    ];
    await tx.insert(products).values(
      items.map((it, i) => ({
        tenantId,
        name: it.n,
        slug: it.s,
        shortDescription: "อบใหม่ทุกเช้า สั่งล่วงหน้า 1 วัน",
        description: `<p>${it.n} ทำสดใหม่ทุกวัน</p>`,
        status: "active",
        type: (it as any).type ?? "physical",
        categoryId: it.c,
        images: [{ url: it.img, alt: it.n }],
        price: it.p,
        stock: it.stock,
        featured: !!it.f,
        soldCount: 100 - i * 7,
        ratingAvg: 490,
        ratingCount: 30,
        sort: i,
        publishedAt: new Date(),
      })),
    );
    await tx.insert(shippingMethods).values([
      { tenantId, name: "รับที่ร้าน (เจริญกรุง 43)", type: "pickup", config: { amount: 0 }, estimatedDays: "เลือกเวลารับได้", sort: 0 },
      { tenantId, name: "ส่ง Grab/Lalamove ในกรุงเทพฯ", type: "flat", config: { amount: 8000 }, estimatedDays: "ภายในวัน", sort: 1 },
    ]);
  },
};
