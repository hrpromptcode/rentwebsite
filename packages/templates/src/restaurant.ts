import type { TemplateDefinition } from "@rentweb/core/tenant";
import { diningTables, menuCategories, menuItemModifierGroups, menuItems, menus, modifierGroups, modifiers } from "@rentweb/db";
import { section, hero, marquee, menuHighlight, stickyStory, gallery, testimonials, reservationCta, faq, features, stats } from "@rentweb/storefront/definitions";
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
    // AC-02: the sample business's location / opening-hours copy; new (non-demo) shops get a placeholder or neutral copy
    ["มีที่จอดหน้าร้าน 6 คัน และจอดเพิ่มได้ที่ซอยอารีย์ 4 (ฟรี) หรือเดินจาก BTS อารีย์ 5 นาที", "[ที่จอดรถ · การเดินทางมาร้าน]"],
    ["BTS อารีย์ ทางออก 3 เดิน 5 นาที มีที่จอดรถหน้าร้าน", "[การเดินทางมาร้าน · ที่จอดรถ]"],
    // the home sticky story's clock kickers are the sample kitchen's day; new shops get time-of-day words instead
    ["05:00", "ก่อนรุ่งสาง"],
    ["07:00", "เช้าตรู่"],
    ["10:00", "ช่วงสาย"],
    ["11:00", "มื้อของคุณ"],
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
          heading: "รสชาติบ้าน\nที่คิดถึง",
          subheading: "อาหารไทยตำรับคุณยาย ปรุงสดจากวัตถุดิบท้องถิ่น เสิร์ฟในบ้านไม้อายุ 70 ปี",
          primaryCta: { label: "ดูเมนู", href: "/menu" },
          secondaryCta: { label: "จองโต๊ะ", href: "/reserve" },
          // signature scene (preset ember → steam): steam curls up out of the tom yum bowl on the dark slate
          image: { url: u("1548943487-a2e4e43b4853", 2000), alt: "ต้มยำกุ้งในชามเซรามิกสีเข้ม" },
          overlay: 0.45,
          scene: "auto",
          cornerLabels: ["ครัวไทยตำรับบ้าน", "ปรุงสดทุกจาน"],
          clock: true,
          stats: [{ value: "70 ปี", label: "บ้านไม้หลังเดิม" }, { value: "4.8", label: "Google Reviews" }, { value: "32", label: "เมนูประจำบ้าน" }],
        }),
        section(marquee, { items: ["แกงเขียวหวานไก่บ้าน", "ปลากะพงทอดน้ำปลา", "ยำส้มโอกุ้งสด", "ข้าวเหนียวมะม่วง", "หมูสะเต๊ะสูตรคุณยาย"], style: "giant", speed: 45, separator: "·" }),
        section(menuHighlight, { eyebrow: "เมนูแนะนำ", heading: "จานที่ทุกโต๊ะต้องสั่ง", subheading: "สแกน QR ที่โต๊ะเพื่อสั่งได้เลย หรือสั่งกลับบ้านล่วงหน้า", variant: "filmstrip", limit: 6 }),
        section(stickyStory, {
          eyebrow: "วัตถุดิบ",
          heading: "จากสวนถึงจาน\nภายในวันเดียว",
          subheading: "ผักและสมุนไพรจากสวนออร์แกนิกนครปฐม ปลาจากเรือประมงพื้นบ้านประจวบฯ ส่งถึงครัวทุกเช้า เราปรุงด้วยเครื่องแกงตำมือ ไม่ใช้ผงชูรส",
          mediaStyle: "full",
          side: "right",
          items: [
            { kicker: "05:00", title: "สวนผักนครปฐม", body: "โหระพา กะเพรา ตะไคร้ เก็บจากแปลงออร์แกนิกตอนฟ้ายังไม่สาง ใบยังมีน้ำค้างตอนมาถึงครัว", image: u("1777205838206-03e7248e474c", 1400), chips: ["ออร์แกนิก", "เก็บสดทุกเช้า"] },
            { kicker: "07:00", title: "ตลาดเช้า", body: "ปลาจากเรือประมงพื้นบ้าน กุ้งแม่น้ำ และผลไม้ตามฤดูกาล คัดเองทีละตะกร้าก่อนแม่ค้าจะเก็บร้าน", image: u("1747396108528-682b02327818", 1400), chips: ["ประมงพื้นบ้าน", "ตามฤดูกาล"] },
            { kicker: "10:00", title: "ครัวบ้านริม", body: "ตำเครื่องแกงด้วยครกหิน ผัดไฟแรงในกระทะเหล็ก ไม่ใช้ผงชูรส ทุกจานปรุงตามสูตรที่คุณยายสอน", image: u("1723967052599-93403a001bb1", 1400), chips: ["เครื่องแกงตำมือ", "ไม่ใช้ผงชูรส"] },
            { kicker: "11:00", title: "โต๊ะของคุณ", body: "เสิร์ฟร้อน ๆ ถึงโต๊ะ สั่งเพิ่มผ่าน QR ได้ตลอดมื้อ แล้วขอบิลจากมือถือได้เลย", image: u("1679541946014-a47f1ec0dc1a", 1400), chips: ["มีเมนูมังสวิรัติ", "แจ้งไม่ใส่ถั่วได้"], href: "/menu" },
          ],
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
            { url: u("1675150277436-9c7348972c11", 1000), alt: "สำรับอาหารไทยบนโต๊ะไม้" },
            { url: u("1517248135467-4c7edcad34c4", 1000), alt: "บรรยากาศในร้านยามค่ำ" },
            { url: u("1696785129061-6939a4c2a1fe", 1000), alt: "ไฟแรงจากเตาในครัว" },
            { url: u("1722995690313-9ef561d30143", 1000), alt: "สำรับบนใบตอง" },
            { url: u("1551218808-94e220e084d2", 1000), alt: "หั่นสมุนไพรสดในครัว" },
            { url: u("1705056508219-0aa0ceb16820", 1000), alt: "ข้าวเหนียวมะม่วง" },
            { url: u("1414235077428-338989a2e8c0", 1000), alt: "โต๊ะอาหารพร้อมเสิร์ฟ" },
            { url: u("1646850149335-f15d028036b3", 1000), alt: "สำรับอาหารเหนือ" },
            { url: u("1555939594-58d7cb561ad1", 1000), alt: "ของย่างเตาถ่าน" },
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
        section(reservationCta, { heading: "จองโต๊ะ\nสำหรับวันพิเศษ", body: "โซนสวนรับได้ 6–12 ที่นั่ง เหมาะกับงานเลี้ยงครอบครัว แจ้งโอกาสพิเศษได้ตอนจอง", image: { url: u("1414235077428-338989a2e8c0", 1200), alt: "" } }),
        section(stats, { variant: "row", items: [{ value: 70, suffix: " ปี", label: "บ้านไม้หลังเดิม" }, { value: 32, label: "เมนูประจำบ้าน" }, { value: 48000, suffix: "+", label: "จานที่เสิร์ฟปีที่แล้ว" }, { value: 12, label: "โต๊ะในบ้านและในสวน" }] }),
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
        { tenantId, menuId: menu!.id, name: "ของทานเล่น", nameEn: "Starters", description: "เปิดโต๊ะด้วยของกินเล่นจากเตาถ่าน", sort: 0 },
        { tenantId, menuId: menu!.id, name: "แกงและต้ม", nameEn: "Curries & Soups", description: "เครื่องแกงตำมือทุกเช้า ไม่ใช้ผงชูรส", sort: 1 },
        { tenantId, menuId: menu!.id, name: "ผัดและทอด", nameEn: "Stir-fried & Fried", description: "ไฟแรงจากกระทะเหล็ก หอมกลิ่นกระทะ", sort: 2 },
        { tenantId, menuId: menu!.id, name: "ยำ", nameEn: "Salads", description: "เปรี้ยว เผ็ด หวาน ปรุงสดทีละจาน", sort: 3 },
        { tenantId, menuId: menu!.id, name: "ของหวาน", nameEn: "Desserts", description: "ปิดท้ายมื้อแบบคุณยาย หวานกำลังดี", sort: 4 },
        { tenantId, menuId: menu!.id, name: "เครื่องดื่ม", nameEn: "Drinks", description: "ชงสดทุกแก้ว", sort: 5 },
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

    // images: every dish photo shows the dish (verified ids, 2026-10-22); d = the menu line under the dish name
    const items = [
      { c: "ของทานเล่น", n: "หมูสะเต๊ะสูตรคุณยาย (6 ไม้)", e: "Pork Satay", d: "หมักกะทิและเครื่องเทศข้ามคืน ย่างเตาถ่าน เสิร์ฟน้ำจิ้มถั่วและอาจาด", p: 16000, img: u("1555939594-58d7cb561ad1", 800), tags: ["แนะนำ"], mods: [extra!.id], f: true },
      { c: "ของทานเล่น", n: "ปอเปี๊ยะทอดผัก", e: "Vegetable Spring Rolls", d: "แป้งบางกรอบ ไส้วุ้นเส้นผักรวม จิ้มน้ำจิ้มบ๊วยเปรี้ยวหวาน", p: 12000, img: u("1515022376298-7333f33e704b", 800), tags: ["มังสวิรัติ"], mods: [] },
      { c: "แกงและต้ม", n: "แกงเขียวหวานไก่บ้าน", e: "Green Curry", d: "ไก่บ้านเนื้อแน่น มะเขือเปราะ ใบโหระพา น้ำแกงข้นหอมกะทิ", p: 22000, img: u("1455619452474-d2be8b1e70cd", 800), tags: ["แนะนำ", "เผ็ด"], spicy: 2, mods: [spicy!.id, extra!.id], f: true },
      { c: "แกงและต้ม", n: "ต้มยำกุ้งแม่น้ำ", e: "Tom Yum Goong", d: "กุ้งแม่น้ำตัวโต น้ำข้นเปรี้ยวจี๊ด หอมข่า ตะไคร้ ใบมะกรูด", p: 32000, img: u("1548943487-a2e4e43b4853", 800), tags: ["แนะนำ", "เผ็ด"], spicy: 3, mods: [spicy!.id], f: true },
      { c: "แกงและต้ม", n: "แกงจืดเต้าหู้หมูสับ", e: "Clear Tofu Soup", d: "น้ำซุปกระดูกเคี่ยวนาน เต้าหู้ไข่ หมูสับ สาหร่าย", p: 15000, img: u("1547592166-23ac45744acd", 800), tags: [], mods: [] },
      { c: "ผัดและทอด", n: "ปลากะพงทอดน้ำปลา", e: "Fried Sea Bass", d: "ปลากะพงทั้งตัว ทอดกรอบนอกนุ่มใน ราดน้ำปลา แกล้มยำมะม่วง", p: 45000, img: u("1533959938354-70634c231c21", 800), tags: ["แนะนำ"], mods: [], f: true },
      { c: "ผัดและทอด", n: "ผัดกะเพราเนื้อโคขุน", e: "Basil Beef", d: "เนื้อโคขุนสับหยาบ ผัดไฟแรงกับกะเพราและพริกสด", p: 19000, img: u("1707897634981-39bcfe435268", 800), tags: ["เผ็ด"], spicy: 2, mods: [spicy!.id, extra!.id] },
      { c: "ผัดและทอด", n: "ผัดผักรวมน้ำมันหอย", e: "Stir-fried Vegetables", d: "ผักสวนตามฤดูกาล ผัดไฟแรง กรอบหวาน", p: 14000, img: u("1592578630143-fac65cda7a67", 800), tags: ["มังสวิรัติ"], mods: [] },
      { c: "ยำ", n: "ยำส้มโอกุ้งสด", e: "Pomelo Salad", d: "ส้มโอฉ่ำ กุ้งลวก มะพร้าวคั่ว น้ำยำเปรี้ยวหวานกลมกล่อม", p: 21000, img: u("1546069901-ba9599a7e63c", 800), tags: ["แนะนำ"], spicy: 1, mods: [spicy!.id], f: true },
      { c: "ยำ", n: "ส้มตำไทยไข่เค็ม", e: "Som Tum", d: "มะละกอเส้นกรอบ ถั่วลิสงคั่ว ไข่เค็ม ตำในครกดินเผา", p: 12000, img: u("1652690528406-a547a6eb143f", 800), tags: ["เผ็ด"], spicy: 2, mods: [spicy!.id] },
      { c: "ของหวาน", n: "ข้าวเหนียวมะม่วง", e: "Mango Sticky Rice", d: "มะม่วงน้ำดอกไม้สุกกำลังดี ข้าวเหนียวมูนกะทิ โรยถั่วทอง", p: 14000, img: u("1705234384751-84081009588e", 800), tags: ["แนะนำ"], mods: [], f: true },
      { c: "ของหวาน", n: "บัวลอยไข่หวาน", e: "Bua Loy", d: "บัวลอยหลากสีในน้ำกะทิอบควันเทียน ใส่ไข่หวาน", p: 9000, img: u("1738573519644-93b700f3adf3", 800), tags: [], mods: [] },
      { c: "เครื่องดื่ม", n: "ชาไทยเย็น", e: "Thai Iced Tea", d: "ใบชาไทยชงเข้ม นมข้นหอมมัน ไม่หวานแหลม", p: 7000, img: u("1788016284568-2cfdc5994fd5", 800), tags: [], mods: [sweet!.id] },
      { c: "เครื่องดื่ม", n: "น้ำตะไคร้ใบเตย", e: "Lemongrass Pandan", d: "ต้มสดทุกวัน หอมตะไคร้และใบเตย ดื่มแล้วสดชื่น", p: 6000, img: u("1513558161293-cdaf765ed2fd", 800), tags: ["มังสวิรัติ"], mods: [sweet!.id] },
    ];
    for (const [i, it] of items.entries()) {
      const [row] = await tx
        .insert(menuItems)
        .values({ tenantId, categoryId: cat(it.c), name: it.n, nameEn: it.e, description: it.d, price: it.p, image: it.img, tags: it.tags, spicyLevel: it.spicy ?? 0, featured: !!it.f, sort: i, station: it.c === "เครื่องดื่ม" ? "bar" : it.c === "ของหวาน" ? "dessert" : "kitchen", prepMinutes: 15 })
        .returning({ id: menuItems.id });
      if (it.mods.length) await tx.insert(menuItemModifierGroups).values(it.mods.map((g, j) => ({ tenantId, itemId: row!.id, groupId: g, sort: j })));
    }

    const tables = [...Array.from({ length: 8 }, (_, i) => ({ name: `A${i + 1}`, zone: "ในบ้าน", seats: 4 })), ...Array.from({ length: 4 }, (_, i) => ({ name: `G${i + 1}`, zone: "สวน", seats: 6 }))];
    await tx.insert(diningTables).values(tables.map((t, i) => ({ tenantId, ...t, qrToken: `${tenantId.slice(0, 8)}-${t.name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`, sort: i })));
  },
};
