import type { TemplateDefinition, TemplatePage } from "@rentweb/core/tenant";
import { forms, posts } from "@rentweb/db";
import {
  section,
  hero,
  logos,
  features,
  stats,
  team,
  testimonials,
  pricing,
  faq,
  cta,
  contact,
  curvedGallery,
  projectList,
  tunnel,
  giantWordmark,
  imageText,
} from "@rentweb/storefront/definitions";
import { aboutPage, NEUTRAL_ABOUT, legalPages, u } from "./shared";

/**
 * Case studies (fictional demo clients): one list feeds the home curved gallery, the home project index and the work
 * page, so the three always tell the same story. Hi-end direction §5.6 (Vyre-like studio).
 */
const CASES = [
  {
    title: "คลังสินค้า 200 สาขา",
    client: "Siam Retail Group",
    category: "Retail",
    year: "2025",
    image: u("1586528116311-ad8dd3c8310d", 1400),
    summary: "ลดเวลาเช็กสต็อกจาก 3 วันเหลือ 2 ชั่วโมง ด้วยการสแกนบาร์โค้ดบนมือถือและแดชบอร์ดเรียลไทม์",
  },
  {
    title: "แอปนัดแพทย์",
    client: "Krungthep Health",
    category: "Healthcare",
    year: "2024",
    image: u("1576091160550-2173dba999ef", 1400),
    summary: "ผู้ป่วยจองและเลื่อนนัดเองผ่านแอป ลดสายโทรเข้าลง 40% ได้ 4.8 ดาวบน App Store",
  },
  {
    title: "ติดตามรถขนส่ง",
    client: "Chao Phraya Logistics",
    category: "Logistics",
    year: "2025",
    image: u("1494412574643-ff11b0a5c1c3", 1400),
    summary: "ติดตามรถ 1,200 คันบนแผนที่สด แจ้งลูกค้าล่วงหน้าก่อนรถถึง ลดสายสอบถามสถานะลงครึ่งหนึ่ง",
  },
  {
    title: "แดชบอร์ดผู้บริหาร",
    client: "Thonburi Capital",
    category: "Finance",
    year: "2024",
    image: u("1551288049-bebda4e38f71", 1400),
    summary: "รวมข้อมูลจาก 7 ระบบเป็นหน้าจอเดียว แสดงผลภายใน 2 วินาที ผู้บริหาร 120 คนใช้ทุกเช้า",
  },
  {
    title: "ระบบจองตรง",
    client: "Andaman Resorts",
    category: "Hospitality",
    year: "2023",
    image: u("1520250497591-112f2f40a3f4", 1400),
    summary: "ยอดจองตรงผ่านเว็บโต 3 เท่า ประหยัดค่าคอมมิชชัน OTA ได้กว่า 2 ล้านบาทต่อปี",
  },
  {
    title: "แอปสะสมแต้ม",
    client: "Lanna Foods",
    category: "F&B",
    year: "2023",
    image: u("1504674900247-0877df9cc836", 1400),
    summary: "สมาชิก 180,000 คนใน 6 เดือน สะสมและแลกแต้มผ่าน LINE ได้ทันทีที่หน้าร้าน",
  },
  {
    title: "ฟาร์มอัจฉริยะ",
    client: "Isan Agritech",
    category: "Agritech",
    year: "2026",
    image: u("1625246333195-78d9c38ad449", 1400),
    summary: "เซนเซอร์ความชื้นดิน 3,000 จุด แจ้งเตือนเกษตรกรผ่าน LINE ลดการใช้น้ำลง 25%",
  },
];

const galleryItems = CASES.map((c) => ({ image: c.image, title: c.title, subtitle: `${c.client} · ${c.year}`, tag: c.category.toUpperCase(), href: "/work" }));
const projectItems = CASES.map((c) => ({ title: c.title, category: `${c.category} — ${c.client}`, year: c.year, image: c.image, summary: c.summary, href: "/work" }));

const TEAM = [
  { name: "ธนกร วิริยะ", role: "CEO & Founder", avatar: u("1720501828093-c792c10e3f0b", 800), bio: "อดีตหัวหน้าทีมวิศวกรที่ Agoda" },
  { name: "พิมพ์มาดา ศรีสุข", role: "Head of Design", avatar: u("1758600587811-e9a20851cf7d", 800), bio: "ออกแบบผลิตภัณฑ์ให้ธนาคารชั้นนำ 3 แห่ง" },
  { name: "ณัฐพล เกียรติ", role: "CTO", avatar: u("1622902141397-a89655353bec", 800), bio: "Cloud architect ประสบการณ์ 14 ปี" },
  { name: "อรจิรา ทองดี", role: "Head of Delivery", avatar: u("1581065178047-8ee15951ede6", 800), bio: "PMP · ดูแลโปรเจกต์กว่า 60 โครงการ" },
];

const SERVICES = [
  { icon: "Compass", title: "Discovery & UX Research", description: "สัมภาษณ์ผู้ใช้ ทำ journey map กำหนดขอบเขตและ KPI ก่อนเขียนโค้ดสักบรรทัด", image: u("1581291518857-4e27b48ff24e", 1800) },
  { icon: "PenTool", title: "Product Design", description: "Design system และ prototype ที่ทดสอบกับผู้ใช้จริง ก่อนส่งต่อให้ทีมพัฒนา", image: u("1561070791-2526d30994b5", 1800) },
  { icon: "Code2", title: "Web Application", description: "Next.js / TypeScript / PostgreSQL พร้อม CI/CD ทดสอบอัตโนมัติทุกการเปลี่ยนแปลง", image: u("1461749280684-dccba630e2f6", 1800) },
  { icon: "Smartphone", title: "Mobile Application", description: "React Native แอปเดียวขึ้นได้ทั้ง App Store และ Google Play", image: u("1648279220423-14606cb98f22", 1800) },
  { icon: "Cloud", title: "Cloud & DevOps", description: "AWS / GCP, Terraform, monitoring และการลดค่าใช้จ่าย cloud ที่วัดผลได้", image: u("1558494949-ef010cbdcc31", 1800) },
  { icon: "LifeBuoy", title: "Support & Growth", description: "SLA, on-call และทีมพัฒนาต่อยอดรายเดือน หลังระบบขึ้นใช้งานจริง", image: u("1551434678-e076c223a692", 1800) },
];

/** About CTA: break after the question ("มีคำถาม? ทัก|เรามาได้เลย" split the phrase at desktop widths). Demo sections only. */
const ABOUT_CTA = "มีคำถาม? ทักเรามาได้เลย";
const breakAboutCta = (s: TemplatePage["sections"][number]) => (s.type === "cta" && s.props.heading === ABOUT_CTA ? { ...s, props: { ...s.props, heading: ABOUT_CTA.replace(" ", "\n") } } : s);

/** About = the shared statement page + the studio in numbers + the people (the closing CTA card stays last). */
function withAboutExtras(page: TemplatePage): TemplatePage {
  const extras = [
    section(stats, { variant: "row", items: [{ value: 120, suffix: "+", label: "โปรเจกต์ที่ส่งมอบ" }, { value: 35, label: "ทีมงาน" }, { value: 98, suffix: "%", label: "ส่งตรงเวลา" }, { value: 7, label: "อุตสาหกรรม" }] }),
    section(team, { eyebrow: "ทีมผู้บริหาร", heading: "คนที่จะดูแล\nโปรเจกต์ของคุณ", variant: "list", members: TEAM }),
  ];
  const insert = (list: TemplatePage["sections"]) => [list[0]!, ...extras, ...list.slice(1)];
  return { ...page, sections: insert(page.sections).map(breakAboutCta), neutralSections: page.neutralSections ? insert(page.neutralSections) : undefined };
}

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
  // the giant home wordmark is the demo brand in capitals; new shops get "" = their own shop name
  neutralText: [["NORTHSTAR", ""]],
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
        // 1 — heavy moment #1: particle-morph (crystal-flower → star → globe) behind a bottom-left giant headline
        section(hero, {
          variant: "cinematic",
          eyebrow: "Software & Design Studio",
          heading: "สร้างระบบที่ทีมของคุณ\nอยากใช้ทุกวัน",
          subheading: "เราออกแบบและพัฒนาเว็บแอป ระบบหลังบ้าน และแอปมือถือ สำหรับธุรกิจที่ต้องการเติบโตอย่างมีระบบ — ส่งมอบตรงเวลา 98%",
          primaryCta: { label: "ปรึกษาโปรเจกต์ฟรี", href: "/contact" },
          secondaryCta: { label: "ดูผลงาน", href: "/work" },
          image: { url: u("1522071820081-009f0129c71c", 1400), alt: "ทีมงาน" },
          scene: "auto",
          clock: true,
          cornerLabels: ["Northstar — Bangkok", "N 13°45′ · E 100°30′"],
        }),
        section(giantWordmark, { text: "NORTHSTAR", effect: "rise", caption: "ออกแบบ · พัฒนา · ดูแล — ระบบที่ใช้งานได้จริงทุกวัน" }),
        section(logos, { heading: "องค์กรที่ไว้วางใจเรา", items: [], names: ["Siam Retail Group", "Krungthep Health", "Chao Phraya Logistics", "Lanna Foods", "Andaman Resorts", "Isan Agritech"], marquee: true }),
        // heavy moment #2: Vyre-style curved gallery over a grid floor
        section(curvedGallery, {
          eyebrow: "ผลงานคัดสรร",
          heading: "ระบบที่ลูกค้าใช้งานจริง\nทุกวัน ทุกสาขา",
          bigTitle: "WORKS",
          bigTitleSuffix: "©19—26",
          items: galleryItems,
          floor: "grid",
          autoplay: true,
          height: "compact",
          cta: { label: "ดูผลงานทั้งหมด", href: "/work" },
        }),
        section(projectList, { eyebrow: "ดัชนีโปรเจกต์", heading: "เคสล่าสุด\nจาก 7 อุตสาหกรรม", items: projectItems, layout: "list-hover", cursorLabel: "ดูโปรเจกต์" }),
        section(stats, { variant: "big", heading: "ตัวเลขที่เราภูมิใจ", items: [{ value: 120, suffix: "+", label: "โปรเจกต์ที่ส่งมอบ" }, { value: 98, suffix: "%", label: "ส่งตรงเวลา" }, { value: 35, label: "ทีมงาน" }, { value: 9, suffix: " ปี", label: "ประสบการณ์" }] }),
        section(features, {
          variant: "list",
          eyebrow: "บริการ",
          heading: "ครบทุกขั้นตอน\nตั้งแต่ไอเดีย\nถึงใช้งานจริง",
          items: [
            { icon: "Compass", title: "Discovery & UX", description: "วิจัยผู้ใช้ กำหนดขอบเขต ออกแบบ wireframe และ prototype ที่ทดสอบได้" },
            { icon: "Code2", title: "Web & Mobile Development", description: "Next.js, React Native, Node — โค้ดสะอาด ทดสอบอัตโนมัติ ส่งมอบพร้อมเอกสาร" },
            { icon: "Cloud", title: "Cloud & DevOps", description: "ออกแบบ infra บน AWS/GCP ที่ปลอดภัย ประหยัด และขยายได้" },
            { icon: "BarChart3", title: "Data & Dashboard", description: "รวมข้อมูลจากหลายระบบเป็นแดชบอร์ดที่ผู้บริหารเข้าใจในพริบตา" },
            { icon: "ShieldCheck", title: "Security Review", description: "ตรวจสอบช่องโหว่และปฏิบัติตาม PDPA ก่อนขึ้นระบบจริง" },
            { icon: "LifeBuoy", title: "Support & Growth", description: "ดูแลระบบหลังส่งมอบ พร้อม SLA และการพัฒนาต่อยอดรายเดือน" },
          ],
        }),
        // heavy moment #3: the camera flies through the process
        section(tunnel, {
          eyebrow: "วิธีทำงาน",
          heading: "โปร่งใสทุกสัปดาห์",
          tint: "accent",
          length: "normal",
          steps: [
            { kicker: "01 · Discovery", title: "เข้าใจปัญหา", body: "เวิร์กช็อป 1 วันกับทีมของคุณ สรุปเป้าหมายและตัวชี้วัด", image: u("1552664730-d307ca884978", 1024) },
            { kicker: "02 · Design", title: "ออกแบบ", body: "prototype ที่กดได้จริง ทดสอบกับผู้ใช้ก่อนเริ่มพัฒนา", image: u("1581291518857-4e27b48ff24e", 1024) },
            { kicker: "03 · Build", title: "สร้างและทดสอบ", body: "ส่งมอบทุก 2 สัปดาห์ ดูของจริง ปรับได้ตลอด", image: u("1461749280684-dccba630e2f6", 1024) },
            { kicker: "04 · Launch", title: "ส่งมอบและดูแล", body: "อบรมทีม เอกสารครบ ดูแลต่อเนื่องตาม SLA", image: u("1522071820081-009f0129c71c", 1024) },
          ],
        }),
        section(team, {
          eyebrow: "ทีมผู้บริหาร",
          heading: "คนที่จะดูแล\nโปรเจกต์ของคุณ",
          variant: "large",
          members: TEAM,
        }),
        section(testimonials, {
          heading: "ลูกค้าพูดถึงเรา",
          variant: "spotlight",
          items: [
            { quote: "ทีม Northstar เข้าใจธุรกิจเราเร็วมาก ส่งงานทุก 2 สัปดาห์ตามที่สัญญา และระบบใช้งานจริงใน 200 สาขาโดยไม่มีปัญหาใหญ่", name: "คุณวรรณา ตั้งมั่น", role: "COO, Siam Retail Group", avatar: u("1604904612715-47bf9d9bc670", 160, "&ar=1:1&crop=faces"), rating: 5 },
            { quote: "เอกสารและโค้ดสะอาดจนทีมในของเรารับช่วงต่อได้ทันที", name: "คุณปริญญ์", role: "IT Director, Chao Phraya Logistics", avatar: u("1543132220-3ec99c6094dc", 160, "&ar=1:1&crop=faces"), rating: 5 },
            { quote: "UX ที่ออกแบบให้ลดการโทรเข้า call center ลง 40%", name: "คุณศิริพร", role: "Head of CX, Krungthep Health", avatar: u("1758691737605-69a0e78bd193", 160, "&ar=1:1&crop=faces"), rating: 5 },
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
        section(cta, { variant: "wordmark", heading: "มีโปรเจกต์ในใจ? มาคุยกัน", body: "นัดเวิร์กช็อป Discovery ฟรี 1 ชั่วโมง ไม่มีข้อผูกมัด", primaryCta: { label: "นัดคุยกับทีม", href: "/contact" } }),
      ],
    },
    {
      slug: "services",
      title: "บริการ",
      showInNav: false,
      sections: [
        section(features, { variant: "sticky", eyebrow: "บริการ", heading: "สิ่งที่เราทำ", subheading: "ครบวงจรตั้งแต่วิจัยผู้ใช้จนถึงดูแลระบบ", items: SERVICES }),
        section(cta, { variant: "card", heading: "ไม่แน่ใจว่าต้องเริ่มจากอะไร?", body: "เวิร์กช็อป Discovery ฟรี 1 ชั่วโมง ช่วยสรุปทางเลือกและงบประมาณ", primaryCta: { label: "นัดคุย", href: "/contact" } }),
      ],
    },
    {
      slug: "work",
      title: "ผลงาน",
      sections: [
        section(projectList, { eyebrow: "ผลงาน", heading: "งานที่ใช้งานจริง\nไม่ใช่แค่สไลด์สวย", items: CASES.map((c) => ({ title: c.title, category: c.category, year: c.year, image: c.image, summary: `${c.client} — ${c.summary}` })), layout: "grid-staggered", cursorLabel: "ดูโปรเจกต์" }),
        section(curvedGallery, { bigTitle: "ARCHIVE", bigTitleSuffix: "©19—26", heading: "ลากเพื่อดูทุกโปรเจกต์", items: galleryItems.map((it) => ({ ...it, href: undefined })), floor: "reflect", height: "compact" }),
        section(cta, { variant: "wordmark", heading: "อยากเห็นผลงานที่ใกล้เคียงธุรกิจของคุณ?", primaryCta: { label: "ขอดูเคสเพิ่มเติม", href: "/contact" } }),
      ],
    },
    { slug: "careers", title: "ร่วมงานกับเรา", sections: [section(features, { variant: "icons", heading: "ทำไมต้องร่วมงานกับ Northstar", columns: 4, items: [{ icon: "Laptop", title: "Hybrid 3 วัน", description: "เข้าออฟฟิศ 2 วัน/สัปดาห์" }, { icon: "GraduationCap", title: "งบเรียนรู้ ฿30,000/ปี", description: "คอร์ส หนังสือ คอนเฟอเรนซ์" }, { icon: "HeartPulse", title: "ประกันสุขภาพกลุ่ม", description: "รวมทันตกรรมและสายตา" }, { icon: "Sun", title: "ลาพักร้อน 15 วัน", description: "เพิ่มตามอายุงาน" }] }),
      // careers read thin (benefits + CTA only): the studio's working life + the open roles the CTA already names
      section(imageText, {
        eyebrow: "ชีวิตที่ Northstar",
        heading: "ทีมเล็ก งานจริง\nเดโมทุกวันศุกร์",
        body: "เราทำงานเป็นทีมย่อย 4–5 คนต่อโปรเจกต์ ดีไซเนอร์และวิศวกรคุยกับลูกค้าตั้งแต่วันแรก ทุกวันศุกร์ทีมเดโมงานที่ใช้ได้จริงให้ลูกค้าดู และทุกไตรมาสมีวันเรียนรู้ให้ลองเครื่องมือใหม่ทั้งวัน",
        image: { url: u("1552664730-d307ca884978", 1400), alt: "ทีมกำลังทำเวิร์กช็อปกับโพสต์อิทบนผนัง" },
        imagePosition: "left",
        bullets: ["ทีมละ 4–5 คน ดูแลตั้งแต่ต้นจนจบ", "เดโมงานจริงทุกวันศุกร์", "Learning day ทุกไตรมาส"],
        style: "overlap",
      }),
      section(features, {
        variant: "list",
        eyebrow: "เปิดรับ 3 ตำแหน่ง",
        heading: "ตำแหน่งที่เปิดรับ",
        items: [
          { icon: "Code", title: "Senior Frontend Engineer", description: "Next.js · React · TypeScript — Hybrid กรุงเทพฯ ประสบการณ์ 4 ปีขึ้นไป" },
          { icon: "Server", title: "Backend Engineer", description: "Node.js · PostgreSQL · AWS — Hybrid กรุงเทพฯ ประสบการณ์ 2 ปีขึ้นไป" },
          { icon: "PenTool", title: "Product Designer", description: "UX research · Figma · Design system — Hybrid กรุงเทพฯ" },
        ],
      }),
      section(cta, { variant: "card", heading: "ส่งเรซูเม่มาคุยกัน", body: "เปิดรับ Frontend, Backend และ Product Designer", primaryCta: { label: "ส่งเรซูเม่", href: "mailto:jobs@northstar.co.th" } })] },
    withAboutExtras(aboutPage({ neutral: NEUTRAL_ABOUT.corporate, eyebrow: "เกี่ยวกับเรา", heading: "Northstar —\nสตูดิโอซอฟต์แวร์ที่เชื่อใน\nงานที่ใช้ได้จริง", body: "ก่อตั้งปี 2017 โดยวิศวกร 3 คนที่เบื่อระบบองค์กรที่ไม่มีใครอยากใช้ เราเติบโตเป็นทีม 35 คน ส่งมอบมากกว่า 120 โปรเจกต์ให้ธุรกิจค้าปลีก การเงิน และสุขภาพ\n\nเราวัดความสำเร็จจากตัวเลขของลูกค้า ไม่ใช่จำนวนฟีเจอร์" })),
    {
      slug: "contact",
      title: "ติดต่อเรา",
      showInNav: false,
      sections: [
        section(contact, {
          variant: "chips",
          heading: "ขอใบเสนอราคา / นัดคุย",
          body: "เล่าโปรเจกต์ของคุณคร่าว ๆ ทีมจะติดต่อกลับภายใน 1 วันทำการ",
          interests: ["เว็บไซต์", "แอปมือถือ", "ระบบหลังบ้าน", "Data / Dashboard", "UX/UI"],
          budgets: ["< ฿300k", "฿300k–1M", "฿1M–3M", "฿3M+"],
        }),
      ],
    },
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
