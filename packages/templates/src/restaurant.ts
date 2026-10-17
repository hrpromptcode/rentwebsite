import type { TemplateDefinition } from "@rentweb/core/tenant";
import { diningTables, menuCategories, menuItemModifierGroups, menuItems, menus, modifierGroups, modifiers } from "@rentweb/db";
import { section, hero, marquee, menuHighlight, imageText, gallery, testimonials, reservationCta, faq, features, stats } from "@rentweb/storefront/definitions";
import { aboutPage, NEUTRAL_ABOUT, contactPage, legalPages, u, avatar } from "./shared";

export const restaurant: TemplateDefinition = {
  key: "restaurant",
  name: { th: "ร้านอาหาร + QR สั่งที่โต๊ะ", en: "Restaurant with QR ordering" },
  description: { th: "เมนูออนไลน์ สั่งอาหารผ่าน QR ที่โต๊ะ จอครัว รับกลับบ้าน จองโต๊ะ ธีมอบอุ่นสีเอมเบอร์", en: "Online menu, QR table ordering, kitchen display, pickup, reservations — warm ember theme" },
  category: "hospitality",
  siteType: "restaurant",
  modules: ["restaurant"],
  themePreset: "ember",
  // ADMIN_B2-07: the sample brand; new (non-demo) shops get their own name instead
  sampleBrand: ["บ้านริม"],
  neutralText: [
    ["เสิร์ฟในบ้านไม้อายุ 70 ปี", "เสิร์ฟร้อน ๆ ทุกวัน"],
    ["อารีย์ · กรุงเทพฯ", "[ย่าน · จังหวัดของร้าน]"],
  ],
  recommendedPresets: ["ember", "midnight", "candy", "aurora"],
  complexity: 3,
  previewImage: u("1517248135467-4c7edcad34c4", 1200),
  settings: {
    tagline: "อาหารไทยตำรับบ้าน ปรุงสดทุกจาน",
    contact: {
      phone: "02-987-6543",
      lineId: "@baanrim",
      address: "123 ซอยอารีย์ 4 ถ.พหลโยธิน กรุงเทพฯ 10400",
      hours: [{ day: "ทุกวัน", time: "11:00 – 22:00 (ครัวปิด 21:30)" }],
      facebook: "https://facebook.com",
      instagram: "https://instagram.com",
      mapUrl: "https://www.google.com/maps?q=Ari+Bangkok&output=embed",
    },
    header: { cta: { label: "จองโต๊ะ", href: "/reserve" } },
    payments: {
      promptpayId: "0829876543",
      promptpayName: "บ้านริม",
      bankAccounts: [{ bank: "กรุงเทพ", name: "บ้านริม", number: "222-3-44444-5" }],
      enabled: { promptpay: true, bankTransfer: true, cash: true },
    },
  },
  moduleConfig: { restaurant: { serviceChargePercent: 0, dineIn: true, pickup: true, delivery: false, reservationDeposit: 0, prepMinutesDefault: 15 } },
  navigation: {
    header: [
      { label: "เมนู", href: "/menu" },
      { label: "สั่งกลับบ้าน", href: "/order" },
      { label: "จองโต๊ะ", href: "/reserve" },
      { label: "เรื่องราว", href: "/about" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "เมนู", href: "/menu" },
      { label: "สั่งกลับบ้าน", href: "/order" },
      { label: "จองโต๊ะ", href: "/reserve" },
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
          variant: "fullscreen",
          eyebrow: "อารีย์ · กรุงเทพฯ",
          heading: "รสชาติบ้าน ที่คิดถึง",
          subheading: "อาหารไทยตำรับคุณยาย ปรุงสดจากวัตถุดิบท้องถิ่น เสิร์ฟในบ้านไม้อายุ 70 ปี",
          primaryCta: { label: "ดูเมนู", href: "/menu" },
          secondaryCta: { label: "จองโต๊ะ", href: "/reserve" },
          image: { url: u("1517248135467-4c7edcad34c4", 2000), alt: "บรรยากาศร้าน" },
          overlay: 0.5,
          stats: [{ value: "70 ปี", label: "บ้านไม้หลังเดิม" }, { value: "4.8", label: "Google Reviews" }, { value: "32", label: "เมนูประจำบ้าน" }],
        }),
        section(marquee, { items: ["แกงเขียวหวานไก่บ้าน", "ปลากะพงทอดน้ำปลา", "ยำส้มโอกุ้งสด", "ข้าวเหนียวมะม่วง", "หมูสะเต๊ะสูตรคุณยาย"], style: "giant", speed: 45, separator: "·" }),
        section(menuHighlight, { eyebrow: "เมนูแนะนำ", heading: "จานที่ทุกโต๊ะต้องสั่ง", subheading: "สแกน QR ที่โต๊ะเพื่อสั่งได้เลย หรือสั่งกลับบ้านล่วงหน้า", variant: "filmstrip", limit: 6 }),
        section(imageText, {
          eyebrow: "วัตถุดิบ",
          heading: "จากสวนถึงจาน ภายในวันเดียว",
          body: "ผักและสมุนไพรจากสวนออร์แกนิกนครปฐม ปลาจากเรือประมงพื้นบ้านประจวบฯ ส่งถึงครัวทุกเช้า เราปรุงด้วยเครื่องแกงตำมือ ไม่ใช้ผงชูรส",
          image: { url: u("1504674900247-0877df9cc836", 1400), alt: "อาหาร" },
          imagePosition: "left",
          bullets: ["เครื่องแกงตำมือทุกวัน", "ไม่ใช้ผงชูรส", "มีเมนูมังสวิรัติและไม่ใส่ถั่ว"],
          cta: { label: "ดูเมนูทั้งหมด", href: "/menu" },
        }),
        section(features, {
          variant: "cards",
          heading: "สั่งง่าย กินสบาย",
          columns: 3,
          items: [
            { icon: "QrCode", title: "สแกนสั่งที่โต๊ะ", description: "ไม่ต้องรอพนักงาน สั่งเพิ่มได้ตลอด เรียกพนักงานหรือขอบิลผ่านมือถือ" },
            { icon: "ShoppingBag", title: "สั่งกลับบ้านล่วงหน้า", description: "เลือกเวลารับ จ่ายผ่าน PromptPay มาถึงรับได้เลย ไม่ต้องรอ" },
            { icon: "CalendarCheck", title: "จองโต๊ะออนไลน์", description: "เลือกโซนในบ้านหรือสวน ยืนยันทันที เตือนก่อนถึงเวลา" },
          ],
        }),
        section(gallery, {
          heading: "บรรยากาศบ้านริม",
          layout: "masonry",
          columns: 3,
          images: [
            { url: u("1517248135467-4c7edcad34c4", 1000), alt: "ร้าน" },
            { url: u("1414235077428-338989a2e8c0", 1000), alt: "โต๊ะอาหาร" },
            { url: u("1551218808-94e220e084d2", 1000), alt: "มุมสวน" },
            { url: u("1546069901-ba9599a7e63c", 1000), alt: "จานอาหาร" },
            { url: u("1555939594-58d7cb561ad1", 1000), alt: "ย่าง" },
            { url: u("1476224203421-9ac39bcb3327", 1000), alt: "อาหาร" },
          ],
        }),
        section(testimonials, {
          heading: "ลูกค้าบอกต่อ",
          variant: "cards",
          items: [
            { quote: "แกงเขียวหวานรสชาติเหมือนที่บ้านทำจริง ๆ บรรยากาศบ้านไม้อบอุ่นมาก", name: "คุณอาร์ม", role: "Google Review", avatar: avatar("arm"), rating: 5 },
            { quote: "สั่งผ่าน QR สะดวกมาก ไม่ต้องเรียกพนักงาน อาหารมาไวด้วย", name: "คุณจูน", role: "Wongnai", avatar: avatar("june"), rating: 5 },
            { quote: "จองโต๊ะโซนสวนให้แม่วันเกิด ร้านเตรียมเค้กให้ด้วย ประทับใจ", name: "คุณบอส", role: "Facebook", avatar: avatar("bos"), rating: 5 },
          ],
        }),
        section(reservationCta, { heading: "จองโต๊ะสำหรับวันพิเศษ", body: "โซนสวนรับได้ 6–12 ที่นั่ง เหมาะกับงานเลี้ยงครอบครัว แจ้งโอกาสพิเศษได้ตอนจอง", image: { url: u("1414235077428-338989a2e8c0", 1200), alt: "" } }),
        section(stats, { variant: "row", items: [{ value: 70, suffix: " ปี", label: "บ้านไม้หลังเดิม" }, { value: 32, label: "เมนูประจำบ้าน" }, { value: 48000, suffix: "+", label: "จานที่เสิร์ฟปีที่แล้ว" }, { value: 4.8, label: "คะแนน Google" }] }),
        section(faq, {
          heading: "คำถามที่พบบ่อย",
          items: [
            { q: "มีที่จอดรถไหม?", a: "มีที่จอดหน้าร้าน 6 คัน และจอดเพิ่มได้ที่ซอยอารีย์ 4 (ฟรี) หรือเดินจาก BTS อารีย์ 5 นาที" },
            { q: "รับจองกลุ่มใหญ่ไหม?", a: "รับได้สูงสุด 40 ท่าน สำหรับ 12 ท่านขึ้นไป โปรดโทรจองล่วงหน้า 2 วัน" },
            { q: "มีเมนูมังสวิรัติไหม?", a: "มี 8 เมนู และสามารถแจ้งไม่ใส่ถั่ว/กลูเตนได้ตอนสั่ง" },
          ],
        }),
      ],
    },
    aboutPage({ neutral: NEUTRAL_ABOUT.restaurant, heading: "บ้านริม — ครัวคุณยายในบ้านไม้อายุ 70 ปี", body: "บ้านหลังนี้เป็นของคุณยายสมศรี ที่ทำอาหารเลี้ยงลูกหลานมาตลอดชีวิต เมื่อปี 2018 หลานสาวตัดสินใจเปิดบ้านเป็นร้านอาหาร เพื่อแบ่งปันสูตรของคุณยายและรักษาบ้านไม้หลังนี้ไว้\n\nเราทำทุกอย่างเหมือนที่คุณยายทำ ตำเครื่องแกงเองทุกเช้า ใช้วัตถุดิบตามฤดูกาล และเสิร์ฟด้วยความใส่ใจ" }),
    contactPage({ heading: "ติดต่อ / เดินทาง", body: "BTS อารีย์ ทางออก 3 เดิน 5 นาที มีที่จอดรถหน้าร้าน" }),
    ...legalPages("บ้านริม"),
  ],
  async seed(tx, tenantId) {
    const [menu] = await tx.insert(menus).values({ tenantId, name: "เมนูหลัก", sort: 0 }).returning({ id: menus.id });
    const cats = await tx
      .insert(menuCategories)
      .values([
        { tenantId, menuId: menu!.id, name: "ของทานเล่น", nameEn: "Starters", sort: 0 },
        { tenantId, menuId: menu!.id, name: "แกงและต้ม", nameEn: "Curries & Soups", sort: 1 },
        { tenantId, menuId: menu!.id, name: "ผัดและทอด", nameEn: "Stir-fried & Fried", sort: 2 },
        { tenantId, menuId: menu!.id, name: "ยำ", nameEn: "Salads", sort: 3 },
        { tenantId, menuId: menu!.id, name: "ของหวาน", nameEn: "Desserts", sort: 4 },
        { tenantId, menuId: menu!.id, name: "เครื่องดื่ม", nameEn: "Drinks", sort: 5 },
      ])
      .returning({ id: menuCategories.id, name: menuCategories.name });
    const cat = (n: string) => cats.find((c) => c.name === n)!.id;

    const [spicy, extra, sweet] = await tx
      .insert(modifierGroups)
      .values([
        { tenantId, name: "ระดับความเผ็ด", minSelect: 1, maxSelect: 1, required: true, sort: 0 },
        { tenantId, name: "เพิ่มพิเศษ", minSelect: 0, maxSelect: 3, sort: 1 },
        { tenantId, name: "ระดับความหวาน", minSelect: 1, maxSelect: 1, required: true, sort: 2 },
      ])
      .returning({ id: modifierGroups.id });
    await tx.insert(modifiers).values([
      { tenantId, groupId: spicy!.id, name: "ไม่เผ็ด", priceDelta: 0, sort: 0 },
      { tenantId, groupId: spicy!.id, name: "เผ็ดน้อย", priceDelta: 0, sort: 1 },
      { tenantId, groupId: spicy!.id, name: "เผ็ดกลาง", priceDelta: 0, sort: 2 },
      { tenantId, groupId: spicy!.id, name: "เผ็ดมาก (แบบคุณยาย)", priceDelta: 0, sort: 3 },
      { tenantId, groupId: extra!.id, name: "ไข่ดาว", priceDelta: 1500, sort: 0 },
      { tenantId, groupId: extra!.id, name: "ข้าวสวย", priceDelta: 2000, sort: 1 },
      { tenantId, groupId: extra!.id, name: "เพิ่มเนื้อ", priceDelta: 5000, sort: 2 },
      { tenantId, groupId: sweet!.id, name: "หวานน้อย", priceDelta: 0, sort: 0 },
      { tenantId, groupId: sweet!.id, name: "หวานปกติ", priceDelta: 0, sort: 1 },
      { tenantId, groupId: sweet!.id, name: "ไม่หวาน", priceDelta: 0, sort: 2 },
    ]);

    const items = [
      { c: "ของทานเล่น", n: "หมูสะเต๊ะสูตรคุณยาย (6 ไม้)", e: "Pork Satay", p: 16000, img: u("1555939594-58d7cb561ad1", 800), tags: ["แนะนำ"], mods: [extra!.id], f: true },
      { c: "ของทานเล่น", n: "ปอเปี๊ยะทอดผัก", e: "Vegetable Spring Rolls", p: 12000, img: u("1559847844-5315695dadae", 800), tags: ["มังสวิรัติ"], mods: [] },
      { c: "แกงและต้ม", n: "แกงเขียวหวานไก่บ้าน", e: "Green Curry", p: 22000, img: u("1455619452474-d2be8b1e70cd", 800), tags: ["แนะนำ", "เผ็ด"], spicy: 2, mods: [spicy!.id, extra!.id], f: true },
      { c: "แกงและต้ม", n: "ต้มยำกุ้งแม่น้ำ", e: "Tom Yum Goong", p: 32000, img: u("1569718212165-3a8278d5f624", 800), tags: ["แนะนำ", "เผ็ด"], spicy: 3, mods: [spicy!.id], f: true },
      { c: "แกงและต้ม", n: "แกงจืดเต้าหู้หมูสับ", e: "Clear Tofu Soup", p: 15000, img: u("1547592166-23ac45744acd", 800), tags: [], mods: [] },
      { c: "ผัดและทอด", n: "ปลากะพงทอดน้ำปลา", e: "Fried Sea Bass", p: 45000, img: u("1534939561126-855b8675edd7", 800), tags: ["แนะนำ"], mods: [], f: true },
      { c: "ผัดและทอด", n: "ผัดกะเพราเนื้อโคขุน", e: "Basil Beef", p: 19000, img: u("1512058564366-18510be2db19", 800), tags: ["เผ็ด"], spicy: 2, mods: [spicy!.id, extra!.id] },
      { c: "ผัดและทอด", n: "ผัดผักรวมน้ำมันหอย", e: "Stir-fried Vegetables", p: 14000, img: u("1512621776951-a57141f2eefd", 800), tags: ["มังสวิรัติ"], mods: [] },
      { c: "ยำ", n: "ยำส้มโอกุ้งสด", e: "Pomelo Salad", p: 21000, img: u("1546069901-ba9599a7e63c", 800), tags: ["แนะนำ"], spicy: 1, mods: [spicy!.id], f: true },
      { c: "ยำ", n: "ส้มตำไทยไข่เค็ม", e: "Som Tum", p: 12000, img: u("1540189549336-e6e99c3679fe", 800), tags: ["เผ็ด"], spicy: 2, mods: [spicy!.id] },
      { c: "ของหวาน", n: "ข้าวเหนียวมะม่วง", e: "Mango Sticky Rice", p: 14000, img: u("1551024601-bec78aea704b", 800), tags: ["แนะนำ"], mods: [], f: true },
      { c: "ของหวาน", n: "บัวลอยไข่หวาน", e: "Bua Loy", p: 9000, img: u("1567620905732-2d1ec7ab7445", 800), tags: [], mods: [] },
      { c: "เครื่องดื่ม", n: "ชาไทยเย็น", e: "Thai Iced Tea", p: 7000, img: u("1509042239860-f550ce710b93", 800), tags: [], mods: [sweet!.id] },
      { c: "เครื่องดื่ม", n: "น้ำตะไคร้ใบเตย", e: "Lemongrass Pandan", p: 6000, img: u("1495474472287-4d71bcdd2085", 800), tags: ["มังสวิรัติ"], mods: [sweet!.id] },
    ];
    for (const [i, it] of items.entries()) {
      const [row] = await tx
        .insert(menuItems)
        .values({ tenantId, categoryId: cat(it.c), name: it.n, nameEn: it.e, price: it.p, image: it.img, tags: it.tags, spicyLevel: it.spicy ?? 0, featured: !!it.f, sort: i, station: it.c === "เครื่องดื่ม" ? "bar" : it.c === "ของหวาน" ? "dessert" : "kitchen", prepMinutes: 15 })
        .returning({ id: menuItems.id });
      if (it.mods.length) await tx.insert(menuItemModifierGroups).values(it.mods.map((g, j) => ({ tenantId, itemId: row!.id, groupId: g, sort: j })));
    }

    const tables = [...Array.from({ length: 8 }, (_, i) => ({ name: `A${i + 1}`, zone: "ในบ้าน", seats: 4 })), ...Array.from({ length: 4 }, (_, i) => ({ name: `G${i + 1}`, zone: "สวน", seats: 6 }))];
    await tx.insert(diningTables).values(tables.map((t, i) => ({ tenantId, ...t, qrToken: `${tenantId.slice(0, 8)}-${t.name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`, sort: i })));
  },
};
