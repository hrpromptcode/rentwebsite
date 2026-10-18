import { z } from "zod";
import { defineSection, image, link, type SectionDefinition } from "@rentweb/core/sections";

/* ------------------------------------------------------------------ */
/* Core sections (available to every site)                            */
/* ------------------------------------------------------------------ */

export const hero = defineSection({
  type: "hero",
  name: { th: "ฮีโร่ (ส่วนเปิดหน้า)", en: "Hero" },
  category: "hero",
  variants: ["split", "centered", "fullscreen", "editorial", "stacked"],
  schema: z.object({
    variant: z.enum(["split", "centered", "fullscreen", "editorial", "stacked"]).default("split"),
    eyebrow: z.string().default(""),
    heading: z.string().default("หัวข้อหลักของคุณ"),
    subheading: z.string().default(""),
    primaryCta: link.default({ label: "เริ่มเลย", href: "#" }),
    secondaryCta: link.optional(),
    image: image.default({ url: "", alt: "" }),
    imageSecondary: image.optional(),
    /** "theme" uses the preset's hero background effect */
    background: z.enum(["theme", "none", "gradient-mesh", "aurora", "particles", "orb-3d", "grid", "noise", "blobs", "waves", "spotlight"]).default("theme"),
    badges: z.array(z.string()).default([]),
    stats: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
    textReveal: z.boolean().default(true),
    overlay: z.number().min(0).max(1).default(0.45),
  }),
  defaults: {},
});

export const features = defineSection({
  type: "features",
  name: { th: "จุดเด่น / คุณสมบัติ", en: "Features" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("ทำไมต้องเลือกเรา"),
    subheading: z.string().default(""),
    variant: z.enum(["cards", "list", "bento", "icons"]).default("cards"),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    items: z
      .array(z.object({ icon: z.string().default("Sparkles"), title: z.string(), description: z.string().default(""), image: z.string().optional() }))
      .default([]),
  }),
  defaults: {},
});

export const text = defineSection({
  type: "text",
  name: { th: "ข้อความ", en: "Text" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default(""),
    body: z.string().default(""),
    align: z.enum(["left", "center"]).default("left"),
    size: z.enum(["normal", "large"]).default("normal"),
  }),
  defaults: {},
});

export const imageText = defineSection({
  type: "image-text",
  name: { th: "รูปภาพ + ข้อความ", en: "Image & text" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default(""),
    body: z.string().default(""),
    image: image.default({ url: "", alt: "" }),
    imagePosition: z.enum(["left", "right"]).default("right"),
    bullets: z.array(z.string()).default([]),
    cta: link.optional(),
    style: z.enum(["plain", "card", "overlap"]).default("plain"),
  }),
  defaults: {},
});

export const gallery = defineSection({
  type: "gallery",
  name: { th: "แกลเลอรี", en: "Gallery" },
  category: "media",
  schema: z.object({
    heading: z.string().default(""),
    subheading: z.string().default(""),
    layout: z.enum(["grid", "masonry", "carousel", "filmstrip"]).default("grid"),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    images: z.array(image.extend({ caption: z.string().optional() })).default([]),
  }),
  defaults: {},
});

export const testimonials = defineSection({
  type: "testimonials",
  name: { th: "รีวิวจากลูกค้า", en: "Testimonials" },
  category: "social",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("เสียงจากลูกค้า"),
    variant: z.enum(["cards", "marquee", "spotlight"]).default("cards"),
    items: z
      .array(z.object({ quote: z.string(), name: z.string(), role: z.string().default(""), avatar: z.string().default(""), rating: z.number().min(1).max(5).default(5) }))
      .default([]),
  }),
  defaults: {},
});

export const faq = defineSection({
  type: "faq",
  name: { th: "คำถามที่พบบ่อย", en: "FAQ" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("คำถามที่พบบ่อย"),
    subheading: z.string().default(""),
    items: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    layout: z.enum(["single", "two-column"]).default("single"),
  }),
  defaults: {},
});

export const cta = defineSection({
  type: "cta",
  name: { th: "ชวนให้ลงมือ (CTA)", en: "Call to action" },
  category: "cta",
  schema: z.object({
    heading: z.string().default("พร้อมเริ่มแล้วหรือยัง?"),
    body: z.string().default(""),
    primaryCta: link.default({ label: "ติดต่อเรา", href: "/contact" }),
    secondaryCta: link.optional(),
    variant: z.enum(["banner", "card", "split", "glow"]).default("banner"),
    image: image.optional(),
  }),
  defaults: {},
});

export const contact = defineSection({
  type: "contact",
  name: { th: "ติดต่อ / แผนที่", en: "Contact" },
  category: "content",
  schema: z.object({
    heading: z.string().default("ติดต่อเรา"),
    body: z.string().default(""),
    showForm: z.boolean().default(true),
    showMap: z.boolean().default(true),
    showHours: z.boolean().default(true),
    /** override tenant contact settings */
    phone: z.string().optional(),
    email: z.string().optional(),
    lineId: z.string().optional(),
    address: z.string().optional(),
    mapEmbedUrl: z.string().optional(),
  }),
  defaults: {},
});

export const stats = defineSection({
  type: "stats",
  name: { th: "ตัวเลขสถิติ", en: "Stats" },
  category: "social",
  schema: z.object({
    heading: z.string().default(""),
    variant: z.enum(["row", "cards", "big"]).default("row"),
    items: z.array(z.object({ value: z.number(), prefix: z.string().default(""), suffix: z.string().default(""), label: z.string() })).default([]),
  }),
  defaults: {},
});

export const logos = defineSection({
  type: "logos",
  name: { th: "โลโก้พาร์ตเนอร์", en: "Logos" },
  category: "social",
  schema: z.object({
    heading: z.string().default("ได้รับความไว้วางใจจาก"),
    items: z.array(image).default([]),
    marquee: z.boolean().default(true),
  }),
  defaults: {},
});

export const marquee = defineSection({
  type: "marquee",
  name: { th: "ตัววิ่ง (Marquee)", en: "Marquee" },
  category: "layout",
  schema: z.object({
    items: z.array(z.string()).default(["ส่งฟรีทั่วไทย", "เปลี่ยนคืนได้ 7 วัน", "ของแท้ 100%"]),
    speed: z.number().default(30),
    style: z.enum(["text", "outline", "badges", "giant"]).default("text"),
    separator: z.string().default("✦"),
  }),
  defaults: {},
});

export const pricing = defineSection({
  type: "pricing",
  name: { th: "ราคา / แพ็กเกจ", en: "Pricing" },
  category: "commerce",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("แพ็กเกจและราคา"),
    subheading: z.string().default(""),
    plans: z
      .array(
        z.object({
          name: z.string(),
          price: z.string(),
          period: z.string().default(""),
          description: z.string().default(""),
          features: z.array(z.string()).default([]),
          cta: link.default({ label: "เลือกแพ็กเกจ", href: "#" }),
          highlighted: z.boolean().default(false),
          badge: z.string().optional(),
        }),
      )
      .default([]),
  }),
  defaults: {},
});

export const team = defineSection({
  type: "team",
  name: { th: "ทีมงาน / แพทย์ / ช่าง", en: "Team" },
  category: "social",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("ทีมของเรา"),
    subheading: z.string().default(""),
    variant: z.enum(["grid", "cards", "large"]).default("grid"),
    members: z.array(z.object({ name: z.string(), role: z.string().default(""), avatar: z.string().default(""), bio: z.string().default(""), href: z.string().optional() })).default([]),
  }),
  defaults: {},
});

export const video = defineSection({
  type: "video",
  name: { th: "วิดีโอ", en: "Video" },
  category: "media",
  schema: z.object({
    heading: z.string().default(""),
    url: z.string().default(""), // YouTube / Vimeo URL
    poster: z.string().default(""),
    aspect: z.enum(["16/9", "9/16", "1/1"]).default("16/9"),
  }),
  defaults: {},
});

export const steps = defineSection({
  type: "steps",
  name: { th: "ขั้นตอน (วิธีใช้บริการ)", en: "Steps" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("ใช้บริการง่าย ๆ 3 ขั้นตอน"),
    items: z.array(z.object({ title: z.string(), description: z.string().default(""), icon: z.string().optional() })).default([]),
    variant: z.enum(["horizontal", "vertical", "cards"]).default("horizontal"),
  }),
  defaults: {},
});

export const spacer = defineSection({
  type: "spacer",
  name: { th: "เว้นระยะ", en: "Spacer" },
  category: "layout",
  schema: z.object({ size: z.enum(["sm", "md", "lg", "xl"]).default("md"), divider: z.boolean().default(false) }),
  defaults: {},
});

export const announcement = defineSection({
  type: "announcement",
  name: { th: "ประกาศ / โปรโมชัน", en: "Announcement" },
  category: "cta",
  schema: z.object({
    text: z.string().default("🎉 โปรโมชันพิเศษ ส่งฟรีเมื่อสั่งครบ 500 บาท"),
    cta: link.optional(),
    tone: z.enum(["primary", "accent", "muted"]).default("primary"),
  }),
  defaults: {},
});

/* ------------------------------------------------------------------ */
/* Module sections – rendered by module packages                       */
/* ------------------------------------------------------------------ */

export const productGrid = defineSection({
  type: "product-grid",
  module: "commerce",
  name: { th: "สินค้า (ตาราง)", en: "Product grid" },
  category: "commerce",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("สินค้าแนะนำ"),
    subheading: z.string().default(""),
    source: z.enum(["featured", "newest", "best-sellers", "category", "all"]).default("featured"),
    categorySlug: z.string().optional(),
    limit: z.number().min(1).max(24).default(8),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(4),
    showViewAll: z.boolean().default(true),
    cardStyle: z.enum(["standard", "editorial", "minimal", "hover-swap"]).default("standard"),
  }),
  defaults: {},
});

export const categoryList = defineSection({
  type: "category-list",
  module: "commerce",
  name: { th: "หมวดหมู่สินค้า", en: "Categories" },
  category: "commerce",
  schema: z.object({
    heading: z.string().default("เลือกตามหมวดหมู่"),
    variant: z.enum(["tiles", "pills", "circles"]).default("tiles"),
    limit: z.number().default(8),
  }),
  defaults: {},
});

export const bookingWidget = defineSection({
  type: "booking-widget",
  module: "booking",
  name: { th: "วิดเจ็ตจองคิว", en: "Booking widget" },
  category: "booking",
  schema: z.object({
    heading: z.string().default("จองคิวออนไลน์"),
    subheading: z.string().default("เลือกบริการ วัน และเวลาที่สะดวก ยืนยันทันที"),
    serviceSlug: z.string().optional(),
    compact: z.boolean().default(false),
  }),
  defaults: {},
});

export const serviceList = defineSection({
  type: "service-list",
  module: "booking",
  name: { th: "รายการบริการ", en: "Services" },
  category: "booking",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("บริการของเรา"),
    subheading: z.string().default(""),
    variant: z.enum(["cards", "list", "menu"]).default("cards"),
    limit: z.number().default(8),
    categorySlug: z.string().optional(),
  }),
  defaults: {},
});

export const staffGrid = defineSection({
  type: "staff-grid",
  module: "booking",
  name: { th: "ทีมผู้ให้บริการ (จากระบบจอง)", en: "Staff grid" },
  category: "booking",
  schema: z.object({ eyebrow: z.string().default(""), heading: z.string().default("ทีมของเรา"), subheading: z.string().default(""), limit: z.number().default(8) }),
  defaults: {},
});

export const gameGrid = defineSection({
  type: "game-grid",
  module: "topup",
  name: { th: "เกมทั้งหมด", en: "Game grid" },
  category: "topup",
  schema: z.object({
    heading: z.string().default("เลือกเกมที่ต้องการเติม"),
    subheading: z.string().default(""),
    showSearch: z.boolean().default(true),
    limit: z.number().default(24),
    variant: z.enum(["tiles", "cards"]).default("tiles"),
  }),
  defaults: {},
});

export const topupFeed = defineSection({
  type: "topup-feed",
  module: "topup",
  name: { th: "รายการเติมล่าสุด (สด)", en: "Live top-up feed" },
  category: "topup",
  schema: z.object({ heading: z.string().default("เติมล่าสุด"), limit: z.number().default(10) }),
  defaults: {},
});

export const menuHighlight = defineSection({
  type: "menu-highlight",
  module: "restaurant",
  name: { th: "เมนูแนะนำ", en: "Menu highlight" },
  category: "restaurant",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("เมนูแนะนำ"),
    subheading: z.string().default(""),
    limit: z.number().default(6),
    variant: z.enum(["cards", "filmstrip", "list"]).default("filmstrip"),
  }),
  defaults: {},
});

export const reservationCta = defineSection({
  type: "reservation-cta",
  module: "restaurant",
  name: { th: "จองโต๊ะ", en: "Reservation CTA" },
  category: "restaurant",
  schema: z.object({ heading: z.string().default("จองโต๊ะล่วงหน้า"), body: z.string().default("รับประกันที่นั่งในวันพิเศษของคุณ"), image: image.optional() }),
  defaults: {},
});

export const packageList = defineSection({
  type: "package-list",
  module: "clinic",
  name: { th: "คอร์ส / แพ็กเกจคลินิก", en: "Clinic packages" },
  category: "clinic",
  schema: z.object({ eyebrow: z.string().default(""), heading: z.string().default("คอร์สและแพ็กเกจ"), subheading: z.string().default(""), limit: z.number().default(6) }),
  defaults: {},
});

/* ------------------------------------------------------------------ */
/* Course / studio template (booking module): classes, timetable, instructors, passes */
/* ------------------------------------------------------------------ */

export const classHighlights = defineSection({
  type: "class-highlights",
  module: "booking",
  name: { th: "คลาสแนะนำ", en: "Class highlights" },
  category: "booking",
  schema: z.object({
    eyebrow: z.string().default("คลาสเรียน"),
    heading: z.string().default("คลาสยอดนิยม"),
    subheading: z.string().default(""),
    /** featured only, or every class */
    featured: z.boolean().default(true),
    level: z.enum(["", "beginner", "intermediate", "advanced", "all"]).default(""),
    limit: z.number().default(6),
    variant: z.enum(["cards", "editorial"]).default("cards"),
  }),
  defaults: {},
});

export const weeklySchedule = defineSection({
  type: "weekly-schedule",
  module: "booking",
  name: { th: "ตารางเรียนรายสัปดาห์", en: "Weekly schedule" },
  category: "booking",
  schema: z.object({
    eyebrow: z.string().default("ตารางเรียน"),
    heading: z.string().default("ตารางเรียนสัปดาห์นี้"),
    subheading: z.string().default("เลือกรอบที่สะดวก ที่นั่งคงเหลืออัปเดตแบบเรียลไทม์"),
    /** 7 = full week; 3 = today + 2 days */
    days: z.number().min(1).max(7).default(7),
    showPrice: z.boolean().default(false),
  }),
  defaults: {},
});

export const instructorGrid = defineSection({
  type: "instructor-grid",
  module: "booking",
  name: { th: "ครูผู้สอน", en: "Instructor grid" },
  category: "booking",
  schema: z.object({ eyebrow: z.string().default("ทีมครู"), heading: z.string().default("ครูผู้สอนของเรา"), subheading: z.string().default(""), limit: z.number().default(8) }),
  defaults: {},
});

export const passPricing = defineSection({
  type: "pass-pricing",
  module: "booking",
  name: { th: "คลาสพาส / แพ็กเกจ", en: "Class pass pricing" },
  category: "booking",
  schema: z.object({
    eyebrow: z.string().default("คลาสพาส"),
    heading: z.string().default("เลือกพาสที่เหมาะกับคุณ"),
    subheading: z.string().default("ซื้อครั้งเดียว ใช้ได้ทุกคลาส ยิ่งซื้อมากยิ่งคุ้ม"),
    limit: z.number().default(3),
    /** also show a single-class row from the cheapest class price */
    showDropIn: z.boolean().default(true),
  }),
  defaults: {},
});

/* ------------------------------------------------------------------ */
/* Hotel / resort template (rental module): date-range search hero, room-type grid */
/* ------------------------------------------------------------------ */

export const staySearch = defineSection({
  type: "stay-search",
  module: "rental",
  name: { th: "ฮีโร่ค้นหาห้องว่าง (เช็กอิน–เช็กเอาต์)", en: "Stay search hero" },
  category: "hero",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("พักผ่อนริมทะเล ในแบบของคุณ"),
    subheading: z.string().default(""),
    image: image.default({ url: "", alt: "" }),
    /** second photo for the collage (desktop) */
    imageSecondary: image.optional(),
    badges: z.array(z.string()).default([]),
    stats: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
    /** fullscreen photo with the search card floating at the bottom, or split photo + card */
    variant: z.enum(["fullscreen", "split"]).default("fullscreen"),
    overlay: z.number().min(0).max(1).default(0.45),
    textReveal: z.boolean().default(true),
  }),
  defaults: {},
});

export const roomGrid = defineSection({
  type: "room-grid",
  module: "rental",
  name: { th: "ประเภทห้องพัก", en: "Room types" },
  category: "rental",
  schema: z.object({
    eyebrow: z.string().default("ห้องพัก"),
    heading: z.string().default("ห้องพักและวิลล่า"),
    subheading: z.string().default(""),
    featured: z.boolean().default(false),
    limit: z.number().default(6),
    variant: z.enum(["cards", "editorial"]).default("cards"),
  }),
  defaults: {},
});

/* ------------------------------------------------------------------ */
/* Events / ticketing template (events module): featured-event hero, event grid, past highlights */
/* ------------------------------------------------------------------ */

export const eventHero = defineSection({
  type: "event-hero",
  module: "events",
  name: { th: "ฮีโร่อีเวนต์แนะนำ (นับถอยหลัง + ซื้อบัตร)", en: "Featured event hero" },
  category: "hero",
  schema: z.object({
    /** featured = the featured upcoming event (falls back to the next one); next = the soonest upcoming event */
    source: z.enum(["featured", "next"]).default("featured"),
    variant: z.enum(["fullscreen", "split"]).default("fullscreen"),
    eyebrow: z.string().default(""),
    /** empty = the event's title / summary */
    heading: z.string().default(""),
    subheading: z.string().default(""),
    ctaLabel: z.string().default("ซื้อบัตร"),
    secondaryCta: link.optional(),
    /** fallback photo when the event has no cover or nothing is on sale */
    image: image.default({ url: "", alt: "" }),
    showCountdown: z.boolean().default(true),
    overlay: z.number().min(0).max(1).default(0.5),
    textReveal: z.boolean().default(true),
  }),
  defaults: {},
});

export const eventGrid = defineSection({
  type: "event-grid",
  module: "events",
  name: { th: "อีเวนต์ (ตาราง/รายการ)", en: "Event grid" },
  category: "events",
  schema: z.object({
    eyebrow: z.string().default("อีเวนต์"),
    heading: z.string().default("งานที่กำลังจะมาถึง"),
    subheading: z.string().default(""),
    scope: z.enum(["upcoming", "past"]).default("upcoming"),
    category: z.string().optional(),
    featured: z.boolean().default(false),
    limit: z.number().min(1).max(24).default(6),
    variant: z.enum(["cards", "list"]).default("cards"),
    showViewAll: z.boolean().default(true),
  }),
  defaults: {},
});

export const eventHighlights = defineSection({
  type: "event-highlights",
  module: "events",
  name: { th: "ไฮไลต์งานที่ผ่านมา", en: "Past highlights" },
  category: "events",
  schema: z.object({
    eyebrow: z.string().default("ที่ผ่านมา"),
    heading: z.string().default("บรรยากาศงานที่ผ่านมา"),
    subheading: z.string().default(""),
    /** most recent ended events to show as poster tiles */
    limit: z.number().min(0).max(12).default(4),
    /** extra atmosphere photos mixed into the mosaic */
    images: z.array(image.extend({ caption: z.string().optional() })).default([]),
    layout: z.enum(["filmstrip", "grid"]).default("filmstrip"),
  }),
  defaults: {},
});

export const SECTION_DEFS: Record<string, SectionDefinition> = Object.fromEntries(
  [
    hero,
    features,
    text,
    imageText,
    gallery,
    testimonials,
    faq,
    cta,
    contact,
    stats,
    logos,
    marquee,
    pricing,
    team,
    video,
    steps,
    spacer,
    announcement,
    productGrid,
    categoryList,
    bookingWidget,
    serviceList,
    staffGrid,
    gameGrid,
    topupFeed,
    menuHighlight,
    reservationCta,
    packageList,
    classHighlights,
    weeklySchedule,
    instructorGrid,
    passPricing,
    staySearch,
    roomGrid,
    eventHero,
    eventGrid,
    eventHighlights,
  ].map((d) => [d.type, d as SectionDefinition]),
);

export type SectionType = keyof typeof SECTION_DEFS;

/** Build a section instance with validated/defaulted props. */
export function section<T extends SectionDefinition>(def: T, props: Partial<z.input<T["schema"]>> = {}, id?: string) {
  const parsed = def.schema.parse({ ...(def.defaults as object), ...props });
  return { id: id ?? Math.random().toString(36).slice(2, 10), type: def.type, props: parsed as Record<string, unknown> };
}

/** Validate incoming props against the definition; returns defaults when invalid. */
export function parseSectionProps(type: string, props: unknown): Record<string, unknown> | null {
  const def = SECTION_DEFS[type];
  if (!def) return null;
  const r = def.schema.safeParse(props ?? {});
  return (r.success ? r.data : def.schema.parse({})) as Record<string, unknown>;
}
