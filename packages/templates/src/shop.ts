import type { TemplateDefinition, TemplatePage } from "@rentweb/core/tenant";
import { categories, products, productVariants, shippingMethods, discounts, reviews } from "@rentweb/db";
import { section, hero, marquee, productGrid, categoryList, imageText, testimonials, features, faq, cta, stats, stickyStory, gallery } from "@rentweb/storefront/definitions";
import { aboutPage, NEUTRAL_ABOUT, contactPage, legalPages, defaultHours, u } from "./shared";

/** About CTA: break after the question ("มีคำถาม? ทัก|เรามาได้เลย" split the phrase at desktop widths). Demo sections only. */
const ABOUT_CTA = "มีคำถาม? ทักเรามาได้เลย";
const breakAboutCta = (s: TemplatePage["sections"][number]) => (s.type === "cta" && s.props.heading === ABOUT_CTA ? { ...s, props: { ...s.props, heading: ABOUT_CTA.replace(" ", "\n") } } : s);

/** About page: a masonry of the atelier between the statement and the CTA (demo only; new shops keep the neutral page). */
function withAtelierGallery(page: TemplatePage): TemplatePage {
  const atelier = section(gallery, {
    heading: "ในสตูดิโอของเรา",
    subheading: "ตั้งแต่ปุยฝ้ายจนถึงตะเข็บสุดท้าย ทุกขั้นตอนเกิดขึ้นในเชียงใหม่",
    layout: "masonry",
    columns: 3,
    images: [
      { url: u("1640292343595-889db1c8262e", 1000), alt: "ช่างทอผ้ามัดหมี่ที่กี่ไม้", caption: "กี่ไม้ของช่างทอในสันกำแพง" },
      { url: u("1778084355441-2b03f8e9763e", 1000), alt: "ผ้าย้อมครามแขวนตาก", caption: "ย้อมครามธรรมชาติทีละรอบ" },
      { url: u("1761069183527-a1a1414ee71f", 1000), alt: "ปุยฝ้ายในไร่", caption: "ฝ้ายออร์แกนิกจากไร่ชุมชน" },
      { url: u("1643766882273-335aae5a9309", 1000), alt: "ลายผ้าทอมือระยะใกล้", caption: "ลายทอที่ไม่ซ้ำกันสักผืน" },
      { url: u("1764298493253-e49696c110e7", 1000), alt: "มือที่กำลังเย็บผ้า", caption: "ตัดเย็บและตรวจทีละชิ้น" },
      { url: u("1788500304966-2c60274a5de7", 1000), alt: "ราวเสื้อในสตูดิโอ", caption: "คอลเลกชันฤดูฝน 2026" },
    ],
  });
  return { ...page, sections: [page.sections[0]!, atelier, ...page.sections.slice(1).map(breakAboutCta)] };
}

export const shop: TemplateDefinition = {
  key: "shop",
  name: { th: "ร้านค้าออนไลน์ (แฟชั่น/ไลฟ์สไตล์)", en: "Online shop" },
  description: { th: "ร้านค้าครบวงจร สินค้า ตัวเลือก ตะกร้า ชำระเงิน PromptPay/สลิป ติดตามพัสดุ สไตล์แมกกาซีน", en: "Full e-commerce: products, variants, cart, PromptPay/slip checkout, tracking — editorial look" },
  category: "commerce",
  siteType: "shop",
  modules: ["commerce"],
  themePreset: "aurora",
  // ADMIN_B2-07: the sample brand; new (non-demo) shops get their own name instead
  sampleBrand: ["Siam Atelier"],
  // AC-02: the sample business's location / opening-hours copy; new (non-demo) shops get a placeholder or neutral copy
  neutralText: [
    ["มีค่ะ ที่ถ.นิมมานเหมินท์ เชียงใหม่ เปิดทุกวัน 10:00–20:00", "[มีหน้าร้านไหม · ที่ตั้งร้าน · วัน–เวลาเปิด]"],
    ["ทีมงานตอบ LINE 9:00–21:00", "ทีมงานตอบ LINE ในเวลาทำการ"],
  ],
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
          eyebrow: "คอลเลกชันฤดูฝน 2026",
          heading: "สวมใส่\nความเรียบง่าย\nที่ไม่ธรรมดา",
          scene: "auto",
          headingSize: "xl",
          cornerLabels: ["Monsoon ’26", "ทอมือทุกชิ้น · ผลิตจำนวนจำกัด", "01 / 08"],
          subheading: "ผ้าฝ้ายทอมือ ลินินธรรมชาติ และงานฝีมือจากช่างเชียงใหม่ — ผลิตจำนวนจำกัดทุกชิ้น",
          primaryCta: { label: "ช้อปคอลเลกชันใหม่", href: "/products" },
          secondaryCta: { label: "ดูเรื่องราวของเรา", href: "/about" },
          image: { url: u("1780387477222-730504564368", 1400, "&ar=3:4"), alt: "ลุคจั๊มป์สูทผ้าฝ้ายสีทราย คอลเลกชันฤดูฝน" },
          imageSecondary: { url: u("1643766882273-335aae5a9309", 900), alt: "รายละเอียดผ้าทอมือ" },
          badges: ["ส่งฟรีเมื่อครบ ฿990", "เปลี่ยนคืนได้ 7 วัน", "ผลิตในไทย"],
        }),
        section(marquee, { items: ["ผ้าฝ้ายทอมือ", "ส่งฟรีทั่วไทย", "ผลิตจำนวนจำกัด", "เปลี่ยนคืนได้ 7 วัน", "ของแท้จากช่างเชียงใหม่"], style: "outline", speed: 28, separator: "✦" }),
        section(categoryList, { heading: "เลือกตามหมวดหมู่", variant: "tiles" }),
        section(productGrid, { eyebrow: "มาใหม่", heading: "คอลเลกชันล่าสุด", source: "newest", limit: 8, cardStyle: "editorial" }),
        section(stickyStory, {
          eyebrow: "กว่าจะเป็นเสื้อหนึ่งตัว",
          heading: "จากเส้นด้าย ถึงตู้เสื้อผ้าของคุณ",
          subheading: "สี่ขั้นตอนช้า ๆ ที่เราไม่ยอมเร่ง เพราะผ้าที่ดีต้องใช้เวลา",
          mediaStyle: "card",
          side: "right",
          items: [
            { kicker: "Fiber", title: "ปลูกฝ้าย", body: "ฝ้ายออร์แกนิกจากไร่ชุมชน เก็บด้วยมือ ไม่ใช้สารเคมี", image: u("1761069183527-a1a1414ee71f", 1800), chips: ["ฝ้ายออร์แกนิก 100%"] },
            { kicker: "Indigo", title: "ย้อมคราม", body: "ย้อมด้วยครามธรรมชาติที่หมักเองในหม้อดิน ทีละรอบจนได้สีที่ลึก", image: u("1778084355441-2b03f8e9763e", 1800), chips: ["สีธรรมชาติ"] },
            { kicker: "Loom", title: "ทอมือ", body: "ช่างทอ 14 ครอบครัวทอด้วยกี่ไม้ทีละเส้น ลายจึงไม่ซ้ำกันสักผืน", image: u("1719462193202-7064a0b3fd04", 1800), chips: ["กี่ไม้", "ลายไม่ซ้ำ"] },
            { kicker: "Atelier", title: "ตัดเย็บ", body: "ตัดเย็บและตรวจทีละชิ้น ก่อนพับห่ออย่างดีส่งถึงตู้เสื้อผ้าของคุณ", image: u("1764298493253-e49696c110e7", 1800), chips: ["ตรวจทุกชิ้น"] },
          ],
        }),
        section(imageText, {
          eyebrow: "งานฝีมือ",
          heading: "ทุกชิ้นมีเรื่องราวของมือที่ทอมัน",
          body: "เราทำงานร่วมกับช่างทอผ้า 14 ครอบครัวในอำเภอสันกำแพง ใช้ฝ้ายออร์แกนิกย้อมสีธรรมชาติ และตัดเย็บด้วยมือทีละชิ้น จึงผลิตได้จำกัดในแต่ละเดือน",
          image: { url: u("1640292343595-889db1c8262e", 1400), alt: "ช่างทอผ้ามัดหมี่ที่กี่ไม้" },
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
            { quote: "ผ้าดีมาก ใส่สบาย ซักแล้วไม่ย้วย ซื้อซ้ำเป็นตัวที่ 4 แล้วค่ะ", name: "คุณพลอย", role: "กรุงเทพฯ", avatar: u("1534751516642-a1af1ef26a56", 160, "&ar=1:1&crop=faces"), rating: 5 },
            { quote: "แพ็กเกจสวยมาก ให้เป็นของขวัญแล้วคนรับประทับใจ", name: "คุณนัท", role: "ขอนแก่น", avatar: u("1681097561932-36d0df02b379", 160, "&ar=1:1&crop=faces"), rating: 5 },
            { quote: "ส่งไวมาก สั่งเมื่อวานได้วันนี้ ไซซ์ตรงตามตารางเลย", name: "คุณเจน", role: "ภูเก็ต", avatar: u("1548142813-c348350df52b", 160, "&ar=1:1&crop=faces"), rating: 5 },
            { quote: "ชอบที่รู้ว่าใครเป็นคนทอ มันมีความหมายมากกว่าแค่เสื้อผ้า", name: "คุณบีม", role: "เชียงใหม่", avatar: u("1544168190-79c17527004f", 160, "&ar=1:1&crop=faces"), rating: 5 },
          ],
        }),
        section(features, {
          variant: "icons",
          heading: "ช้อปอย่างสบายใจ",
          columns: 4,
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
        section(cta, { variant: "wordmark", heading: "สมัครรับข่าวคอลเลกชันใหม่ก่อนใคร", body: "รับส่วนลด 10% สำหรับการสั่งซื้อครั้งแรก", primaryCta: { label: "เริ่มช้อป", href: "/products" } }),
      ],
    },
    withAtelierGallery(aboutPage({ neutral: NEUTRAL_ABOUT.shop,
      heading: "จากกี่ทอผ้าในสันกำแพง\nสู่ตู้เสื้อผ้าของคุณ",
      body: "Siam Atelier เริ่มต้นในปี 2019 จากความตั้งใจเล็ก ๆ ที่อยากให้ผ้าทอมือยังมีที่ยืนในชีวิตประจำวัน เราออกแบบให้เรียบ ใส่ง่าย เข้ากับทุกวัน และผลิตร่วมกับช่างทอ 14 ครอบครัว โดยแบ่งรายได้อย่างเป็นธรรม\n\nทุกคอลเลกชันผลิตจำนวนจำกัด เพื่อไม่ให้เหลือทิ้งและเพื่อให้ช่างมีเวลาทำงานอย่างประณีต",
    })),
    contactPage({ faqs: [{ q: "สั่งซื้อจำนวนมากได้ไหม?", a: "ได้ค่ะ ติดต่อทีมขายผ่าน LINE เพื่อรับราคาพิเศษสำหรับการสั่งซื้อ 20 ชิ้นขึ้นไป" }] }),
    ...legalPages("Siam Atelier"),
  ],
  async seed(tx, tenantId) {
    const [apparel, bags, home] = await tx
      .insert(categories)
      .values([
        { tenantId, name: "เสื้อผ้า", slug: "apparel", image: u("1788500304966-2c60274a5de7", 800), sort: 1 },
        { tenantId, name: "กระเป๋า", slug: "bags", image: u("1524679813234-66a389fe1a42", 800), sort: 2 },
        { tenantId, name: "ของแต่งบ้าน", slug: "home", image: u("1674475760738-8c7af859f821", 800), sort: 3 },
      ])
      .returning({ id: categories.id });

    const items: Array<{ name: string; slug: string; price: number; compare?: number; cat: string; img: string; img2?: string; desc: string; featured?: boolean; sold: number; opts?: boolean; stock?: number }> = [
      { name: "เสื้อเชิ้ตลินินแขนยาว สีทราย", slug: "linen-shirt-sand", price: 149000, compare: 179000, cat: apparel!.id, img: u("1713881676551-b16f22ce4719", 1000), img2: u("1586689311267-e88bb0509995", 1000), desc: "ลินินฝรั่งเศส 100% ตัดทรงหลวมสบาย กระดุมเปลือกหอยแท้", featured: true, sold: 320, opts: true },
      { name: "เดรสฝ้ายทอมือ ย้อมคราม", slug: "indigo-dress", price: 219000, cat: apparel!.id, img: u("1596703343725-7ca01bda9a45", 1000), img2: u("1645485791314-ef2ceb335c98", 1000), desc: "ย้อมครามธรรมชาติจากสันกำแพง ลายทอไม่ซ้ำกันแต่ละชิ้น", featured: true, sold: 210, opts: true },
      { name: "กางเกงขากว้าง ผ้าฝ้ายซักนุ่ม", slug: "wide-pants", price: 129000, cat: apparel!.id, img: u("1789110853687-71692f0e86be", 1000), img2: u("1789110520148-bb52ba37759b", 1000), desc: "เอวยางยืดด้านหลัง ใส่สบายทั้งวัน", sold: 180, opts: true },
      { name: "เสื้อยืดคอกลม ฝ้ายออร์แกนิก", slug: "organic-tee", price: 69000, compare: 79000, cat: apparel!.id, img: u("1521572163474-6864f9cf17ab", 1000), img2: u("1666358084687-14347fbf364c", 1000), desc: "ฝ้ายออร์แกนิก 100% ทรงพอดีตัว เนื้อหนา 200 แกรม", featured: true, sold: 540, opts: true },
      { name: "กระเป๋าสะพายผ้าทอ ลายดอกพิกุล", slug: "tote-pikul", price: 89000, cat: bags!.id, img: u("1776219189008-b80cc6081517", 1000), img2: u("1524679813234-66a389fe1a42", 1000), desc: "ซับในกันน้ำ มีช่องซิปด้านใน ใส่แล็ปท็อป 13 นิ้วได้", featured: true, sold: 260 },
      { name: "กระเป๋าคลัตช์หนังแท้ สีน้ำตาลเข้ม", slug: "leather-clutch", price: 159000, cat: bags!.id, img: u("1749294435694-ce3c586591e6", 1000), img2: u("1749294435693-4f39ec7e0ab2", 1000), desc: "หนังวัวฟอกฝาด ยิ่งใช้ยิ่งสวย", sold: 95 },
      { name: "ปลอกหมอนผ้าฝ้ายทอ (คู่)", slug: "cushion-cover", price: 59000, cat: home!.id, img: u("1759517857499-7f27b61aad5d", 1000), img2: u("1538577880403-f9998e75dd06", 1000), desc: "ขนาด 45×45 ซม. ซิปซ่อน ซักเครื่องได้", sold: 410 },
      { name: "ผ้าคลุมโซฟาทอมือ", slug: "sofa-throw", price: 189000, cat: home!.id, img: u("1538577880403-f9998e75dd06", 1000), img2: u("1600369672770-985fd30004eb", 1000), desc: "ขนาด 130×180 ซม. ทอด้วยกี่กระตุก ย้อมสีธรรมชาติ", sold: 70 },
    ];

    const ids: Record<string, string> = {};
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
      ids[it.slug] = p!.id;
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

    // reviews on the products the demo links to (the first products row is not necessarily the linen shirt)
    const shirt = ids["linen-shirt-sand"]!;
    const dress = ids["indigo-dress"]!;
    const tote = ids["tote-pikul"]!;
    await tx.insert(reviews).values([
      { tenantId, productId: shirt, authorName: "คุณพลอย", rating: 5, title: "ผ้าดีมาก", body: "ใส่สบาย ซักแล้วไม่ย้วย", status: "approved" },
      { tenantId, productId: shirt, authorName: "คุณนัท", rating: 5, body: "แพ็กสวย ส่งไว", status: "approved" },
      { tenantId, productId: shirt, authorName: "คุณเจน", rating: 4, title: "สีสวยกว่าในรูป", body: "สีทรายอ่อนกำลังดี ลินินยับนิดหน่อยตามธรรมชาติ ไซซ์ M พอดีตัว", status: "approved" },
      { tenantId, productId: dress, authorName: "คุณบีม", rating: 5, title: "ครามสวยมาก", body: "สีครามลึกและลายทอไม่ซ้ำใคร ใส่ไปงานแล้วมีคนถามเยอะ", status: "approved" },
      { tenantId, productId: dress, authorName: "คุณแพรว", rating: 5, body: "ผ้าระบายอากาศดี ใส่หน้าร้อนได้สบาย", status: "approved" },
      { tenantId, productId: tote, authorName: "คุณมายด์", rating: 5, title: "ใส่ของได้เยอะ", body: "ใส่แล็ปท็อป 13 นิ้วพอดี ซับในกันน้ำจริง ลายดอกพิกุลน่ารัก", status: "approved" },
    ]);
  },
};
