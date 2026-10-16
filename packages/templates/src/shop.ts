import type { TemplateDefinition } from "@rentweb/core/tenant";
import { categories, products, productVariants, shippingMethods, discounts, reviews } from "@rentweb/db";
import { section, hero, marquee, productGrid, categoryList, imageText, testimonials, features, faq, cta, stats } from "@rentweb/storefront/definitions";
import { aboutPage, contactPage, legalPages, defaultHours, u, avatar } from "./shared";

export const shop: TemplateDefinition = {
  key: "shop",
  name: { th: "ร้านค้าออนไลน์ (แฟชั่น/ไลฟ์สไตล์)", en: "Online shop" },
  description: { th: "ร้านค้าครบวงจร สินค้า ตัวเลือก ตะกร้า ชำระเงิน PromptPay/สลิป ติดตามพัสดุ สไตล์แมกกาซีน", en: "Full e-commerce: products, variants, cart, PromptPay/slip checkout, tracking — editorial look" },
  category: "commerce",
  siteType: "shop",
  modules: ["commerce"],
  themePreset: "aurora",
  recommendedPresets: ["aurora", "quartz", "candy", "midnight"],
  complexity: 3,
  previewImage: u("1441986300917-64674bd600d8", 1200),
  settings: {
    tagline: "เสื้อผ้าและของใช้ดีไซน์เรียบ ทำด้วยมือในเชียงใหม่",
    contact: {
      phone: "081-234-5678",
      email: "hello@siam-atelier.co",
      lineId: "@siamatelier",
      address: "99/9 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
      hours: defaultHours,
      instagram: "https://instagram.com",
      facebook: "https://facebook.com",
    },
    header: { cta: { label: "ช้อปคอลเลกชันใหม่", href: "/products" } },
    payments: {
      promptpayId: "0812345678",
      promptpayName: "Siam Atelier",
      bankAccounts: [{ bank: "กสิกรไทย", name: "Siam Atelier จำกัด", number: "123-4-56789-0" }],
      enabled: { promptpay: true, bankTransfer: true, cod: true },
    },
  },
  moduleConfig: { commerce: { currency: "THB", lowStockThreshold: 5, allowGuestCheckout: true, payments: { bankTransfer: true, promptpay: true, cod: true } } },
  navigation: {
    header: [
      { label: "สินค้าทั้งหมด", href: "/products" },
      {
        label: "หมวดหมู่",
        href: "/collections",
        children: [
          { label: "เสื้อผ้า", href: "/collections/apparel" },
          { label: "กระเป๋า", href: "/collections/bags" },
          { label: "ของแต่งบ้าน", href: "/collections/home" },
        ],
      },
      { label: "เรื่องราวของเรา", href: "/about" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "สินค้าทั้งหมด", href: "/products" },
      { label: "เรื่องราวของเรา", href: "/about" },
      { label: "ติดต่อ", href: "/contact" },
      { label: "ช่วยเหลือ", href: "#", children: [{ label: "การจัดส่ง", href: "/refund" }, { label: "การคืนสินค้า", href: "/refund" }, { label: "ติดตามพัสดุ", href: "/account" }] },
    ],
  },
  pages: [
    {
      slug: "home",
      title: "หน้าแรก",
      kind: "home",
      sections: [
        section(hero, {
          variant: "editorial",
          eyebrow: "คอลเลกชัน ฤดูฝน 2026",
          heading: "สวมใส่ความเรียบง่าย ที่ไม่ธรรมดา",
          subheading: "ผ้าฝ้ายทอมือ ลินินธรรมชาติ และงานฝีมือจากช่างเชียงใหม่ — ผลิตจำนวนจำกัดทุกชิ้น",
          primaryCta: { label: "ช้อปคอลเลกชันใหม่", href: "/products" },
          secondaryCta: { label: "ดูเรื่องราวของเรา", href: "/about" },
          image: { url: u("1490481651871-ab68de25d43d", 1800), alt: "คอลเลกชันใหม่" },
          imageSecondary: { url: u("1515886657613-9f3515b0c78f", 900), alt: "รายละเอียดผ้า" },
          badges: ["ส่งฟรีเมื่อครบ ฿990", "เปลี่ยนคืนได้ 7 วัน", "ผลิตในไทย"],
        }),
        section(marquee, { items: ["ผ้าฝ้ายทอมือ", "ส่งฟรีทั่วไทย", "ผลิตจำนวนจำกัด", "เปลี่ยนคืนได้ 7 วัน", "ของแท้จากช่างเชียงใหม่"], style: "text", speed: 28 }),
        section(categoryList, { heading: "เลือกตามหมวดหมู่", variant: "tiles" }),
        section(productGrid, { eyebrow: "มาใหม่", heading: "คอลเลกชันล่าสุด", source: "newest", limit: 8, cardStyle: "editorial" }),
        section(imageText, {
          eyebrow: "งานฝีมือ",
          heading: "ทุกชิ้นมีเรื่องราวของมือที่ทอมัน",
          body: "เราทำงานร่วมกับช่างทอผ้า 14 ครอบครัวในอำเภอสันกำแพง ใช้ฝ้ายออร์แกนิกย้อมสีธรรมชาติ และตัดเย็บด้วยมือทีละชิ้น จึงผลิตได้จำกัดในแต่ละเดือน",
          image: { url: u("1556228453-efd6c1ff04f6", 1400), alt: "ช่างทอผ้า" },
          imagePosition: "left",
          bullets: ["ฝ้ายออร์แกนิก 100%", "ย้อมสีธรรมชาติ ไม่ระคายเคือง", "รายได้ตรงถึงชุมชนช่างทอ"],
          cta: { label: "อ่านเรื่องราวทั้งหมด", href: "/about" },
          style: "overlap",
        }),
        section(productGrid, { eyebrow: "ขายดี", heading: "ชิ้นที่ลูกค้าหลงรัก", source: "best-sellers", limit: 4, cardStyle: "hover-swap" }),
        section(stats, { variant: "row", items: [{ value: 12000, suffix: "+", label: "ลูกค้าที่ไว้ใจ" }, { value: 4.9, label: "คะแนนรีวิวเฉลี่ย" }, { value: 14, label: "ครอบครัวช่างทอ" }, { value: 48, suffix: " ชม.", label: "จัดส่งภายใน" }] }),
        section(testimonials, {
          eyebrow: "รีวิว",
          heading: "เสียงจากคนที่ใส่จริง",
          variant: "marquee",
          items: [
            { quote: "ผ้าดีมาก ใส่สบาย ซักแล้วไม่ย้วย ซื้อซ้ำเป็นตัวที่ 4 แล้วค่ะ", name: "คุณพลอย", role: "กรุงเทพฯ", avatar: avatar("ploy"), rating: 5 },
            { quote: "แพ็กเกจสวยมาก ให้เป็นของขวัญแล้วคนรับประทับใจ", name: "คุณนัท", role: "ขอนแก่น", avatar: avatar("nat"), rating: 5 },
            { quote: "ส่งไวมาก สั่งเมื่อวานได้วันนี้ ไซซ์ตรงตามตารางเลย", name: "คุณเจน", role: "ภูเก็ต", avatar: avatar("jane"), rating: 5 },
            { quote: "ชอบที่รู้ว่าใครเป็นคนทอ มันมีความหมายมากกว่าแค่เสื้อผ้า", name: "คุณบีม", role: "เชียงใหม่", avatar: avatar("beam"), rating: 5 },
          ],
        }),
        section(features, {
          variant: "icons",
          heading: "ช้อปอย่างสบายใจ",
          items: [
            { icon: "Truck", title: "ส่งฟรีเมื่อครบ ฿990", description: "จัดส่งทั่วไทยภายใน 1–3 วัน" },
            { icon: "RefreshCcw", title: "เปลี่ยน/คืนได้ 7 วัน", description: "ไม่พอดี เปลี่ยนไซซ์ได้ฟรี 1 ครั้ง" },
            { icon: "ShieldCheck", title: "ชำระเงินปลอดภัย", description: "PromptPay บัตรเครดิต หรือเก็บเงินปลายทาง" },
            { icon: "MessageCircle", title: "แชตได้ทุกวัน", description: "ทีมงานตอบ LINE 9:00–21:00" },
          ],
        }),
        section(faq, {
          heading: "คำถามที่พบบ่อย",
          items: [
            { q: "ใช้เวลาจัดส่งกี่วัน?", a: "กรุงเทพฯและปริมณฑล 1–2 วัน ต่างจังหวัด 2–3 วัน ส่งโดย Flash Express และ Kerry" },
            { q: "เปลี่ยนไซซ์ได้ไหม?", a: "ได้ภายใน 7 วัน สินค้าต้องยังไม่ถูกซักและมีป้ายครบ ค่าส่งเปลี่ยนครั้งแรกฟรี" },
            { q: "มีหน้าร้านไหม?", a: "มีค่ะ ที่ถ.นิมมานเหมินท์ เชียงใหม่ เปิดทุกวัน 10:00–20:00" },
          ],
        }),
        section(cta, { variant: "glow", heading: "สมัครรับข่าวคอลเลกชันใหม่ก่อนใคร", body: "รับส่วนลด 10% สำหรับการสั่งซื้อครั้งแรก", primaryCta: { label: "เริ่มช้อป", href: "/products" } }),
      ],
    },
    aboutPage({
      heading: "จากกี่ทอผ้าในสันกำแพง สู่ตู้เสื้อผ้าของคุณ",
      body: "Siam Atelier เริ่มต้นในปี 2019 จากความตั้งใจเล็ก ๆ ที่อยากให้ผ้าทอมือยังมีที่ยืนในชีวิตประจำวัน เราออกแบบให้เรียบ ใส่ง่าย เข้ากับทุกวัน และผลิตร่วมกับช่างทอ 14 ครอบครัว โดยแบ่งรายได้อย่างเป็นธรรม\n\nทุกคอลเลกชันผลิตจำนวนจำกัด เพื่อไม่ให้เหลือทิ้งและเพื่อให้ช่างมีเวลาทำงานอย่างประณีต",
    }),
    contactPage({ faqs: [{ q: "สั่งซื้อจำนวนมากได้ไหม?", a: "ได้ค่ะ ติดต่อทีมขายผ่าน LINE เพื่อรับราคาพิเศษสำหรับการสั่งซื้อ 20 ชิ้นขึ้นไป" }] }),
    ...legalPages("Siam Atelier"),
  ],
  async seed(tx, tenantId) {
    const [apparel, bags, home] = await tx
      .insert(categories)
      .values([
        { tenantId, name: "เสื้อผ้า", slug: "apparel", image: u("1434389677669-e08b4cac3105", 800), sort: 1 },
        { tenantId, name: "กระเป๋า", slug: "bags", image: u("1548036328-c9fa89d128fa", 800), sort: 2 },
        { tenantId, name: "ของแต่งบ้าน", slug: "home", image: u("1513161455079-7dc1de15ef3e", 800), sort: 3 },
      ])
      .returning({ id: categories.id });

    const items: Array<{ name: string; slug: string; price: number; compare?: number; cat: string; img: string; img2?: string; desc: string; featured?: boolean; sold: number; opts?: boolean; stock?: number }> = [
      { name: "เสื้อเชิ้ตลินินแขนยาว สีทราย", slug: "linen-shirt-sand", price: 149000, compare: 179000, cat: apparel!.id, img: u("1596755094514-f87e34085b2c", 1000), img2: u("1521572163474-6864f9cf17ab", 1000), desc: "ลินินฝรั่งเศส 100% ตัดทรงหลวมสบาย กระดุมเปลือกหอยแท้", featured: true, sold: 320, opts: true },
      { name: "เดรสฝ้ายทอมือ ย้อมคราม", slug: "indigo-dress", price: 219000, cat: apparel!.id, img: u("1515372039744-b8f02a3ae446", 1000), img2: u("1529139574466-a303027c1d8b", 1000), desc: "ย้อมครามธรรมชาติจากสันกำแพง ลายทอไม่ซ้ำกันแต่ละชิ้น", featured: true, sold: 210, opts: true },
      { name: "กางเกงขากว้าง ผ้าฝ้ายซักนุ่ม", slug: "wide-pants", price: 129000, cat: apparel!.id, img: u("1594633312681-425c7b97ccd1", 1000), desc: "เอวยางยืดด้านหลัง ใส่สบายทั้งวัน", sold: 180, opts: true },
      { name: "เสื้อยืดคอกลม ฝ้ายออร์แกนิก", slug: "organic-tee", price: 69000, compare: 79000, cat: apparel!.id, img: u("1521572163474-6864f9cf17ab", 1000), desc: "ฝ้ายออร์แกนิก 100% ทรงพอดีตัว เนื้อหนา 200 แกรม", featured: true, sold: 540, opts: true },
      { name: "กระเป๋าสะพายผ้าทอ ลายดอกพิกุล", slug: "tote-pikul", price: 89000, cat: bags!.id, img: u("1553062407-98eeb64c6a62", 1000), desc: "ซับในกันน้ำ มีช่องซิปด้านใน ใส่แล็ปท็อป 13 นิ้วได้", featured: true, sold: 260 },
      { name: "กระเป๋าคลัตช์หนังแท้ สีน้ำตาลเข้ม", slug: "leather-clutch", price: 159000, cat: bags!.id, img: u("1591561954557-26941169b49e", 1000), desc: "หนังวัวฟอกฝาด ยิ่งใช้ยิ่งสวย", sold: 95 },
      { name: "ปลอกหมอนผ้าฝ้ายทอ (คู่)", slug: "cushion-cover", price: 59000, cat: home!.id, img: u("1522771739844-6a9f6d5f14af", 1000), desc: "ขนาด 45×45 ซม. ซิปซ่อน ซักเครื่องได้", sold: 410 },
      { name: "ผ้าคลุมโซฟาทอมือ", slug: "sofa-throw", price: 189000, cat: home!.id, img: u("1513161455079-7dc1de15ef3e", 1000), desc: "ขนาด 130×180 ซม. ทอด้วยกี่กระตุก ย้อมสีธรรมชาติ", sold: 70 },
    ];

    for (const it of items) {
      const [p] = await tx
        .insert(products)
        .values({
          tenantId,
          name: it.name,
          slug: it.slug,
          description: `<p>${it.desc}</p><p>ผลิตในประเทศไทย โดยช่างฝีมือจากเชียงใหม่ ซักด้วยน้ำเย็น ตากในที่ร่ม</p>`,
          shortDescription: it.desc,
          status: "active",
          type: "physical",
          categoryId: it.cat,
          images: [{ url: it.img, alt: it.name }, ...(it.img2 ? [{ url: it.img2, alt: it.name }] : [])],
          price: it.price,
          compareAtPrice: it.compare,
          hasVariants: !!it.opts,
          options: it.opts ? [{ name: "ไซซ์", values: ["S", "M", "L", "XL"] }] : [],
          stock: it.opts ? 0 : (it.stock ?? 25),
          featured: !!it.featured,
          soldCount: it.sold,
          ratingAvg: 480,
          ratingCount: Math.round(it.sold / 6),
          weightGrams: 400,
          tags: it.featured ? ["แนะนำ"] : [],
          publishedAt: new Date(),
        })
        .returning({ id: products.id });
      if (it.opts) {
        await tx.insert(productVariants).values(
          ["S", "M", "L", "XL"].map((s, i) => ({
            tenantId,
            productId: p!.id,
            title: s,
            optionValues: { ไซซ์: s },
            sku: `${it.slug.toUpperCase()}-${s}`,
            price: it.price,
            compareAtPrice: it.compare,
            stock: s === "XL" ? 3 : 12,
            position: i,
          })),
        );
      }
    }

    await tx.insert(shippingMethods).values([
      { tenantId, name: "Flash Express (ส่งด่วน)", type: "free_over", config: { amount: 5000, threshold: 99000 }, estimatedDays: "1–3 วัน", sort: 1 },
      { tenantId, name: "Kerry Express", type: "flat", config: { amount: 6000 }, estimatedDays: "1–3 วัน", sort: 2 },
      { tenantId, name: "เก็บเงินปลายทาง (COD)", type: "cod", config: { amount: 6000, fee: 3000 }, estimatedDays: "2–4 วัน", sort: 3 },
      { tenantId, name: "รับที่ร้าน (เชียงใหม่)", type: "pickup", config: { amount: 0 }, estimatedDays: "พร้อมรับใน 1 วัน", sort: 4 },
    ]);

    await tx.insert(discounts).values([
      { tenantId, code: "WELCOME10", name: "ลูกค้าใหม่ลด 10%", type: "percent", value: 10, minSubtotal: 50000, maxDiscount: 30000, perCustomerLimit: 1 },
      { tenantId, code: "FREESHIP", name: "ส่งฟรี", type: "free_shipping", value: 0, minSubtotal: 59000 },
    ]);

    const [first] = await tx.select({ id: products.id }).from(products).limit(1);
    if (first) {
      await tx.insert(reviews).values([
        { tenantId, productId: first.id, authorName: "คุณพลอย", rating: 5, title: "ผ้าดีมาก", body: "ใส่สบาย ซักแล้วไม่ย้วย", status: "approved" },
        { tenantId, productId: first.id, authorName: "คุณนัท", rating: 5, body: "แพ็กสวย ส่งไว", status: "approved" },
      ]);
    }
  },
};
