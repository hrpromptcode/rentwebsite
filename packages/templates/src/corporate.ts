import type { TemplateDefinition } from "@rentweb/core/tenant";
import { forms, posts } from "@rentweb/db";
import { section, hero, logos, features, stats, imageText, team, testimonials, pricing, faq, cta, steps } from "@rentweb/storefront/definitions";
import { aboutPage, NEUTRAL_ABOUT, contactPage, legalPages, u, avatar } from "./shared";

export const corporate: TemplateDefinition = {
  key: "corporate",
  name: { th: "เว็บบริษัท / เอเจนซี่", en: "Corporate / agency" },
  description: { th: "เว็บองค์กรน่าเชื่อถือ บริการ ผลงาน ทีม บทความ ฟอร์มขอใบเสนอราคา", en: "Trustworthy corporate site: services, work, team, blog, quote form" },
  category: "content",
  siteType: "corporate",
  modules: [],
  themePreset: "obsidian", // hi-end direction §5.6 (dark studio preset)
  // ADMIN_B2-07: the sample brand; new (non-demo) shops get their own name instead
  sampleBrand: ["Northstar"],
  recommendedPresets: ["obsidian", "quartz", "midnight", "aurora"],
  complexity: 1,
  previewImage: u("1497366216548-37526070297c", 1200),
  settings: {
    tagline: "ออกแบบและพัฒนาซอฟต์แวร์ให้ธุรกิจเติบโต",
    contact: { phone: "02-555-0199", email: "contact@northstar.co.th", lineId: "@northstar", address: "อาคาร เอไอเอ แคปปิตอล เซ็นเตอร์ ชั้น 12 ถ.รัชดาภิเษก กรุงเทพฯ 10400", hours: [{ day: "จันทร์ – ศุกร์", time: "09:00 – 18:00" }], facebook: "https://facebook.com" },
    header: { cta: { label: "ขอใบเสนอราคา", href: "/contact" } },
  },
  navigation: {
    header: [
      { label: "บริการ", href: "/services" },
      { label: "ผลงาน", href: "/work" },
      { label: "เกี่ยวกับเรา", href: "/about" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "บริการ", href: "/services" },
      { label: "ผลงาน", href: "/work" },
      { label: "ร่วมงานกับเรา", href: "/careers" },
      { label: "บริษัท", href: "#", children: [{ label: "เกี่ยวกับเรา", href: "/about" }, { label: "ติดต่อ", href: "/contact" }] },
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
          eyebrow: "Software & Design Studio · Bangkok",
          heading: "สร้างระบบที่ทีมของคุณอยากใช้ทุกวัน",
          subheading: "เราออกแบบและพัฒนาเว็บแอป ระบบหลังบ้าน และแอปมือถือ สำหรับธุรกิจที่ต้องการเติบโตอย่างมีระบบ — ส่งมอบตรงเวลา 98%",
          primaryCta: { label: "ปรึกษาโปรเจกต์ฟรี", href: "/contact" },
          secondaryCta: { label: "ดูผลงาน", href: "/work" },
          image: { url: u("1522071820081-009f0129c71c", 1400), alt: "ทีมงาน" },
          stats: [{ value: "120+", label: "โปรเจกต์ที่ส่งมอบ" }, { value: "98%", label: "ส่งตรงเวลา" }, { value: "9 ปี", label: "ประสบการณ์" }],
        }),
        section(logos, { heading: "องค์กรที่ไว้วางใจเรา", items: Array.from({ length: 6 }, (_, i) => ({ url: `https://dummyimage.com/200x60/94a3b8/ffffff&text=Partner+${i + 1}`, alt: `Partner ${i + 1}` })) }),
        section(features, {
          variant: "cards",
          eyebrow: "บริการ",
          heading: "ครบทุกขั้นตอน ตั้งแต่ไอเดียถึงใช้งานจริง",
          columns: 3,
          items: [
            { icon: "Compass", title: "Discovery & UX", description: "วิจัยผู้ใช้ กำหนดขอบเขต ออกแบบ wireframe และ prototype ที่ทดสอบได้" },
            { icon: "Code2", title: "Web & Mobile Development", description: "Next.js, React Native, Node — โค้ดสะอาด ทดสอบอัตโนมัติ ส่งมอบพร้อมเอกสาร" },
            { icon: "Cloud", title: "Cloud & DevOps", description: "ออกแบบ infra บน AWS/GCP ที่ปลอดภัย ประหยัด และขยายได้" },
            { icon: "BarChart3", title: "Data & Dashboard", description: "รวมข้อมูลจากหลายระบบเป็นแดชบอร์ดที่ผู้บริหารเข้าใจในพริบตา" },
            { icon: "ShieldCheck", title: "Security Review", description: "ตรวจสอบช่องโหว่และปฏิบัติตาม PDPA ก่อนขึ้นระบบจริง" },
            { icon: "LifeBuoy", title: "Support & Growth", description: "ดูแลระบบหลังส่งมอบ พร้อม SLA และการพัฒนาต่อยอดรายเดือน" },
          ],
        }),
        section(steps, {
          eyebrow: "วิธีทำงาน",
          heading: "โปร่งใสทุกสัปดาห์",
          items: [
            { title: "เข้าใจปัญหา", description: "เวิร์กช็อป 1 วันกับทีมของคุณ สรุปเป้าหมายและตัวชี้วัด" },
            { title: "ออกแบบและสร้าง", description: "ส่งมอบทุก 2 สัปดาห์ ดูของจริง ปรับได้ตลอด" },
            { title: "ส่งมอบและดูแล", description: "อบรมทีม เอกสารครบ ดูแลต่อเนื่องตาม SLA" },
          ],
        }),
        section(imageText, {
          eyebrow: "ผลงานเด่น",
          heading: "ระบบจัดการคลังสินค้าสำหรับผู้ค้าปลีก 200 สาขา",
          body: "ลดเวลาเช็กสต็อกจาก 3 วันเหลือ 2 ชั่วโมง ด้วยระบบสแกนบาร์โค้ดบนมือถือและแดชบอร์ดเรียลไทม์ ใช้งานจริงใน 200 สาขาภายใน 6 เดือน",
          image: { url: u("1552664730-d307ca884978", 1400), alt: "เคสสตั๊ดดี้" },
          imagePosition: "right",
          bullets: ["ลดเวลาเช็กสต็อก 92%", "สแกนบาร์โค้ดผ่านมือถือ", "แดชบอร์ดผู้บริหารเรียลไทม์"],
          cta: { label: "ดูผลงานทั้งหมด", href: "/work" },
        }),
        section(stats, { variant: "cards", items: [{ value: 120, suffix: "+", label: "โปรเจกต์" }, { value: 98, suffix: "%", label: "ส่งตรงเวลา" }, { value: 35, label: "ทีมงาน" }, { value: 4.9, label: "คะแนนความพึงพอใจ" }] }),
        section(team, {
          eyebrow: "ทีมผู้บริหาร",
          heading: "คนที่จะดูแลโปรเจกต์ของคุณ",
          variant: "grid",
          members: [
            { name: "ธนกร วิริยะ", role: "CEO & Founder", avatar: u("1560250097-0b93528c311a", 800), bio: "อดีตหัวหน้าทีมวิศวกรที่ Agoda" },
            { name: "พิมพ์มาดา ศรีสุข", role: "Head of Design", avatar: u("1573496359142-b8d87734a5a2", 800), bio: "ออกแบบผลิตภัณฑ์ให้ธนาคารชั้นนำ 3 แห่ง" },
            { name: "ณัฐพล เกียรติ", role: "CTO", avatar: u("1500648767791-00dcc994a43e", 800), bio: "Cloud architect ประสบการณ์ 14 ปี" },
            { name: "อรจิรา ทองดี", role: "Head of Delivery", avatar: u("1494790108377-be9c29b29330", 800), bio: "PMP · ดูแลโปรเจกต์กว่า 60 โครงการ" },
          ],
        }),
        section(testimonials, {
          heading: "ลูกค้าพูดถึงเรา",
          variant: "spotlight",
          items: [
            { quote: "ทีม Northstar เข้าใจธุรกิจเราเร็วมาก ส่งงานทุก 2 สัปดาห์ตามที่สัญญา และระบบใช้งานจริงใน 200 สาขาโดยไม่มีปัญหาใหญ่", name: "คุณวรรณา ตั้งมั่น", role: "COO, Retail Group", avatar: avatar("wanna"), rating: 5 },
            { quote: "เอกสารและโค้ดสะอาดจนทีมในของเรารับช่วงต่อได้ทันที", name: "คุณปริญญ์", role: "IT Director", avatar: avatar("prin"), rating: 5 },
            { quote: "UX ที่ออกแบบให้ลดการโทรเข้า call center ลง 40%", name: "คุณศิริพร", role: "Head of CX", avatar: avatar("siriporn"), rating: 5 },
          ],
        }),
        section(pricing, {
          eyebrow: "แพ็กเกจดูแลระบบ",
          heading: "Support & Growth",
          subheading: "หลังส่งมอบ เลือกระดับการดูแลที่เหมาะกับธุรกิจ",
          plans: [
            { name: "Essential", price: "฿15,000", period: "เดือน", description: "สำหรับระบบที่นิ่งแล้ว", features: ["อัปเดตความปลอดภัย", "สำรองข้อมูลรายวัน", "ตอบภายใน 24 ชม."], cta: { label: "สอบถาม", href: "/contact" } },
            { name: "Growth", price: "฿45,000", period: "เดือน", description: "พัฒนาต่อยอดต่อเนื่อง", features: ["ทุกอย่างใน Essential", "พัฒนาฟีเจอร์ 40 ชม./เดือน", "ตอบภายใน 4 ชม.", "รายงานประสิทธิภาพรายเดือน"], cta: { label: "เริ่มต้น", href: "/contact" }, highlighted: true, badge: "แนะนำ" },
            { name: "Enterprise", price: "คุยกัน", period: "", description: "ทีมเฉพาะกิจ", features: ["ทีม dedicated", "SLA 99.95%", "On-call 24/7"], cta: { label: "ติดต่อฝ่ายขาย", href: "/contact" } },
          ],
        }),
        section(faq, {
          heading: "คำถามที่พบบ่อย",
          items: [
            { q: "เริ่มต้นโปรเจกต์ใช้งบเท่าไร?", a: "โปรเจกต์ส่วนใหญ่เริ่มที่ 300,000 บาท ขึ้นกับขอบเขต เราเสนอราคาหลังเวิร์กช็อป Discovery ซึ่งไม่มีค่าใช้จ่าย" },
            { q: "ใช้เวลานานแค่ไหน?", a: "MVP โดยทั่วไป 8–12 สัปดาห์ ระบบองค์กรขนาดใหญ่ 4–6 เดือน" },
            { q: "โค้ดเป็นของใคร?", a: "ของลูกค้า 100% ส่งมอบพร้อม repository และเอกสารทั้งหมด" },
          ],
        }),
        section(cta, { variant: "glow", heading: "มีโปรเจกต์ในใจ? มาคุยกัน", body: "นัดเวิร์กช็อป Discovery ฟรี 1 ชั่วโมง ไม่มีข้อผูกมัด", primaryCta: { label: "นัดคุยกับทีม", href: "/contact" } }),
      ],
    },
    {
      slug: "services",
      title: "บริการ",
      showInNav: false,
      sections: [
        section(features, { variant: "list", eyebrow: "บริการ", heading: "สิ่งที่เราทำ", subheading: "ครบวงจรตั้งแต่วิจัยผู้ใช้จนถึงดูแลระบบ", items: [
          { icon: "Compass", title: "Discovery & UX Research", description: "สัมภาษณ์ผู้ใช้ Journey map กำหนดขอบเขตและ KPI" },
          { icon: "PenTool", title: "Product Design", description: "Design system, prototype ทดสอบกับผู้ใช้จริง" },
          { icon: "Code2", title: "Web Application", description: "Next.js / TypeScript / PostgreSQL พร้อม CI/CD" },
          { icon: "Smartphone", title: "Mobile Application", description: "React Native ส่งขึ้น App Store และ Google Play" },
          { icon: "Cloud", title: "Cloud & DevOps", description: "AWS / GCP, Terraform, monitoring, cost optimization" },
          { icon: "LifeBuoy", title: "Support & Growth", description: "SLA, on-call, พัฒนาต่อยอดรายเดือน" },
        ] }),
        section(cta, { variant: "card", heading: "ไม่แน่ใจว่าต้องเริ่มจากอะไร?", body: "เวิร์กช็อป Discovery ฟรี 1 ชั่วโมง ช่วยสรุปทางเลือกและงบประมาณ", primaryCta: { label: "นัดคุย", href: "/contact" } }),
      ],
    },
    {
      slug: "work",
      title: "ผลงาน",
      sections: [
        section(imageText, { eyebrow: "Retail · 2025", heading: "ระบบคลังสินค้า 200 สาขา", body: "ลดเวลาเช็กสต็อก 92% ด้วยการสแกนบาร์โค้ดบนมือถือและแดชบอร์ดเรียลไทม์", image: { url: u("1552664730-d307ca884978", 1400), alt: "" }, imagePosition: "right", bullets: ["Next.js + PostgreSQL", "200 สาขา / 3,000 ผู้ใช้", "ส่งมอบใน 6 เดือน"] }),
        section(imageText, { eyebrow: "Healthcare · 2024", heading: "แอปนัดหมายแพทย์สำหรับโรงพยาบาลเอกชน", body: "ลดการโทรจอง 40% ผู้ป่วยจองและเลื่อนนัดเองผ่านแอป", image: { url: u("1576091160550-2173dba999ef", 1400), alt: "" }, imagePosition: "left", bullets: ["React Native", "เชื่อม HIS ของโรงพยาบาล", "4.8 ดาวบน App Store"] }),
        section(imageText, { eyebrow: "Finance · 2024", heading: "แดชบอร์ดผู้บริหารแบบเรียลไทม์", body: "รวมข้อมูลจาก 7 ระบบ แสดงผลภายใน 2 วินาที", image: { url: u("1551288049-bebda4e38f71", 1400), alt: "" }, imagePosition: "right", bullets: ["BigQuery + Looker", "7 แหล่งข้อมูล", "ผู้ใช้ 120 คน"] }),
        section(cta, { variant: "banner", heading: "อยากเห็นผลงานที่ใกล้เคียงธุรกิจของคุณ?", primaryCta: { label: "ขอดูเคสเพิ่มเติม", href: "/contact" } }),
      ],
    },
    { slug: "careers", title: "ร่วมงานกับเรา", sections: [section(features, { variant: "icons", heading: "ทำไมต้องร่วมงานกับ Northstar", items: [{ icon: "Laptop", title: "Hybrid 3 วัน", description: "เข้าออฟฟิศ 2 วัน/สัปดาห์" }, { icon: "GraduationCap", title: "งบเรียนรู้ ฿30,000/ปี", description: "คอร์ส หนังสือ คอนเฟอเรนซ์" }, { icon: "HeartPulse", title: "ประกันสุขภาพกลุ่ม", description: "รวมทันตกรรมและสายตา" }, { icon: "Sun", title: "ลาพักร้อน 15 วัน", description: "เพิ่มตามอายุงาน" }] }), section(cta, { variant: "card", heading: "ส่งเรซูเม่มาคุยกัน", body: "เปิดรับ Frontend, Backend และ Product Designer", primaryCta: { label: "ส่งเรซูเม่", href: "mailto:jobs@northstar.co.th" } })] },
    aboutPage({ neutral: NEUTRAL_ABOUT.corporate, eyebrow: "เกี่ยวกับเรา", heading: "Northstar — สตูดิโอซอฟต์แวร์ที่เชื่อในงานที่ใช้ได้จริง", body: "ก่อตั้งปี 2017 โดยวิศวกร 3 คนที่เบื่อระบบองค์กรที่ไม่มีใครอยากใช้ เราเติบโตเป็นทีม 35 คน ส่งมอบมากกว่า 120 โปรเจกต์ให้ธุรกิจค้าปลีก การเงิน และสุขภาพ\n\nเราวัดความสำเร็จจากตัวเลขของลูกค้า ไม่ใช่จำนวนฟีเจอร์" }),
    contactPage({ heading: "ขอใบเสนอราคา / นัดคุย", body: "เล่าโปรเจกต์ของคุณคร่าว ๆ ทีมจะติดต่อกลับภายใน 1 วันทำการ" }),
    ...legalPages("Northstar"),
  ],
  async seed(tx, tenantId) {
    await tx.insert(forms).values({ tenantId, name: "ติดต่อ / ขอใบเสนอราคา", slug: "contact", fields: [{ key: "name", label: "ชื่อ", type: "text", required: true }, { key: "phone", label: "เบอร์โทร", type: "tel", required: true }, { key: "email", label: "อีเมล", type: "email" }, { key: "message", label: "รายละเอียดโปรเจกต์", type: "textarea", required: true }], notifyEmails: [], successMessage: "ขอบคุณค่ะ ทีมจะติดต่อกลับภายใน 1 วันทำการ" });
    // drafts until the storefront has a /blog route – published posts would put 404 URLs into sitemap.xml (SS-06)
    await tx.insert(posts).values([
      { tenantId, slug: "pdpa-checklist-2026", title: "เช็กลิสต์ PDPA สำหรับเว็บไซต์ธุรกิจ ปี 2026", excerpt: "สิ่งที่เว็บไซต์ทุกแห่งต้องมีตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล", bodyHtml: "<p>บทความตัวอย่าง…</p>", coverImage: u("1497366216548-37526070297c", 1200), category: "กฎหมาย", status: "draft", authorName: "ทีม Northstar", publishedAt: new Date() },
      { tenantId, slug: "why-nextjs", title: "ทำไมเราเลือก Next.js สำหรับระบบองค์กร", excerpt: "เหตุผลด้านประสิทธิภาพ ความปลอดภัย และการดูแลระยะยาว", bodyHtml: "<p>บทความตัวอย่าง…</p>", coverImage: u("1461749280684-dccba630e2f6", 1200), category: "เทคโนโลยี", status: "draft", authorName: "ณัฐพล เกียรติ", publishedAt: new Date(Date.now() - 86400000 * 5) },
    ]);
  },
};
