import { z } from "zod";
import { defineSection, image, link, type SectionDefinition } from "@rentweb/core/sections";

/* ------------------------------------------------------------------ */
/* Shared prop building blocks (hi-end redesign, docs/design §7)       */
/* ------------------------------------------------------------------ */

/**
 * Per-section effects level. auto = follow the theme (3D scenes, pinning, velocity marquees …); calm = reveals only
 * (no WebGL, no pinned / scroll-jacked layouts, no velocity skew); off = no motion at all (plain, static markup).
 * Additive + defaulted, so every stored page keeps validating.
 */
export const FX_LEVELS = ["auto", "calm", "off"] as const;
export type FxLevel = (typeof FX_LEVELS)[number];
const fx = z.enum(FX_LEVELS).default("auto");

/** Mirrors SCENE_KINDS of @rentweb/ui/fx (kept inline: the admin bundles these definitions and must not pull the 3D kit). */
export const HERO_SCENES = ["auto", "none", "particle-morph", "floating-objects", "card-stack", "breathing-orb", "image-silk", "ocean", "stage-lights", "steam", "water-ripple", "shader"] as const;

/* ------------------------------------------------------------------ */
/* Core sections (available to every site)                            */
/* ------------------------------------------------------------------ */

export const hero = defineSection({
  type: "hero",
  name: { th: "ฮีโร่ (ส่วนเปิดหน้า)", en: "Hero" },
  description: { th: "หัวข้อใหญ่ + ภาพ/ฉาก 3D ประจำธีม 7 รูปแบบ (การ์ดลอย, ภาพยนตร์ 3D …)", en: "Headline with the theme's signature 3D scene" },
  category: "hero",
  variants: ["split", "centered", "fullscreen", "editorial", "stacked", "scatter", "cinematic"],
  schema: z.object({
    variant: z.enum(["split", "centered", "fullscreen", "editorial", "stacked", "scatter", "cinematic"]).default("split"),
    eyebrow: z.string().default(""),
    heading: z.string().default("หัวข้อหลักของคุณ"),
    subheading: z.string().default(""),
    primaryCta: link.default({ label: "เริ่มเลย", href: "#" }),
    secondaryCta: link.optional(),
    image: image.default({ url: "", alt: "" }),
    imageSecondary: image.optional(),
    /** "theme" uses the preset's hero background effect */
    background: z
      .enum(["theme", "none", "gradient-mesh", "aurora", "particles", "orb-3d", "grid", "noise", "blobs", "waves", "spotlight", "shader-aurora", "shader-silk", "shader-mesh", "shader-caustics"])
      .default("theme"),
    badges: z.array(z.string()).default([]),
    stats: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
    textReveal: z.boolean().default(true),
    overlay: z.number().min(0).max(1).default(0.45),
    /** 3D scene; "auto" = the theme preset's signature scene, "none" = photo only */
    scene: z.enum(HERO_SCENES).default("auto"),
    /** floating cards (scatter variant) / 3D card stack (game covers …) */
    cards: z.array(z.object({ image: z.string(), alt: z.string().default(""), title: z.string().default(""), tag: z.string().default(""), href: z.string().optional() })).default([]),
    /** words cycled in place of {*} in the heading (or on a new line) */
    cycleWords: z.array(z.string()).default([]),
    headingSize: z.enum(["auto", "xl", "giant"]).default("auto"),
    clock: z.boolean().default(false),
    /** tiny studio labels in the hero corners (max 3 shown) */
    cornerLabels: z.array(z.string()).default([]),
    fx,
  }),
  defaults: {},
});

export const features = defineSection({
  type: "features",
  name: { th: "จุดเด่น / คุณสมบัติ", en: "Features" },
  description: { th: "การ์ดเรืองแสง, รายการตัวเลข, เบนโต หรือเรื่องเล่าแบบเลื่อนติด", en: "Glow cards, numbered rows, bento or sticky story" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("ทำไมต้องเลือกเรา"),
    subheading: z.string().default(""),
    variant: z.enum(["cards", "list", "bento", "icons", "sticky"]).default("cards"),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    items: z
      .array(z.object({ icon: z.string().default("Sparkles"), title: z.string(), description: z.string().default(""), image: z.string().optional() }))
      .default([]),
    fx,
  }),
  defaults: {},
});

export const text = defineSection({
  type: "text",
  name: { th: "ข้อความ", en: "Text" },
  description: { th: "คอลัมน์บทความ หรือประโยคใหญ่ที่สว่างขึ้นตามการเลื่อน", en: "Editorial column or scroll-lit statement" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default(""),
    body: z.string().default(""),
    align: z.enum(["left", "center"]).default("left"),
    size: z.enum(["normal", "large"]).default("normal"),
    fx,
  }),
  defaults: {},
});

export const imageText = defineSection({
  type: "image-text",
  name: { th: "รูปภาพ + ข้อความ", en: "Image & text" },
  description: { th: "ภาพพารัลแลกซ์คู่ข้อความ แบบซ้อนชั้นหรือภาพติดขณะเลื่อน", en: "Parallax media with text, layered or pinned" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default(""),
    body: z.string().default(""),
    image: image.default({ url: "", alt: "" }),
    imagePosition: z.enum(["left", "right"]).default("right"),
    bullets: z.array(z.string()).default([]),
    cta: link.optional(),
    style: z.enum(["plain", "card", "overlap", "pinned"]).default("plain"),
    fx,
  }),
  defaults: {},
});

export const gallery = defineSection({
  type: "gallery",
  name: { th: "แกลเลอรี", en: "Gallery" },
  description: { th: "กริดพร้อมไลต์บ็อกซ์, เมสันรีพารัลแลกซ์, แกลเลอรีโค้ง 3D หรือโพลารอยด์ลากได้", en: "Grid, masonry, curved 3D, filmstrip or polaroids" },
  category: "media",
  schema: z.object({
    heading: z.string().default(""),
    subheading: z.string().default(""),
    layout: z.enum(["grid", "masonry", "carousel", "filmstrip", "curved", "polaroid"]).default("grid"),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    images: z.array(image.extend({ caption: z.string().optional() })).default([]),
    fx,
  }),
  defaults: {},
});

export const testimonials = defineSection({
  type: "testimonials",
  name: { th: "รีวิวจากลูกค้า", en: "Testimonials" },
  description: { th: "การ์ดรีวิว, แถบวิ่งสองทาง, คำพูดยักษ์ หรือฟองแชต", en: "Cards, dual marquee, spotlight quote or chat bubbles" },
  category: "social",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("เสียงจากลูกค้า"),
    variant: z.enum(["cards", "marquee", "spotlight", "chat"]).default("cards"),
    items: z
      .array(z.object({ quote: z.string(), name: z.string(), role: z.string().default(""), avatar: z.string().default(""), rating: z.number().min(1).max(5).default(5) }))
      .default([]),
    fx,
  }),
  defaults: {},
});

export const faq = defineSection({
  type: "faq",
  name: { th: "คำถามที่พบบ่อย", en: "FAQ" },
  description: { th: "แอคคอร์เดียนแบบมีเลขลำดับ เปิด-ปิดนุ่มนวล", en: "Numbered animated accordion" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("คำถามที่พบบ่อย"),
    subheading: z.string().default(""),
    items: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    layout: z.enum(["single", "two-column"]).default("single"),
    fx,
  }),
  defaults: {},
});

export const cta = defineSection({
  type: "cta",
  name: { th: "ชวนให้ลงมือ (CTA)", en: "Call to action" },
  description: { th: "หัวข้อยักษ์ + ปุ่มแม่เหล็ก บนพื้นหลังเชดเดอร์ หรือเต็มความกว้างจอ", en: "Giant heading + magnetic button on a shader" },
  category: "cta",
  schema: z.object({
    heading: z.string().default("พร้อมเริ่มแล้วหรือยัง?"),
    body: z.string().default(""),
    primaryCta: link.default({ label: "ติดต่อเรา", href: "/contact" }),
    secondaryCta: link.optional(),
    variant: z.enum(["banner", "card", "split", "glow", "wordmark"]).default("banner"),
    image: image.optional(),
    fx,
  }),
  defaults: {},
});

export const contact = defineSection({
  type: "contact",
  name: { th: "ติดต่อ / แผนที่", en: "Contact" },
  description: { th: "ช่องทางติดต่อ ฟอร์ม และแผนที่ หรือฟอร์มแบบเลือกชิป (ความสนใจ/งบ)", en: "Contact details, form and map, or chip selectors" },
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
    variant: z.enum(["classic", "chips"]).default("classic"),
    interests: z.array(z.string()).default([]),
    budgets: z.array(z.string()).default([]),
    fx,
  }),
  defaults: {},
});

export const stats = defineSection({
  type: "stats",
  name: { th: "ตัวเลขสถิติ", en: "Stats" },
  description: { th: "ตัวเลขหมุนแบบมาตรวัด (odometer) แถว การ์ด หรือขนาดยักษ์", en: "Rolling odometer numbers" },
  category: "social",
  schema: z.object({
    heading: z.string().default(""),
    variant: z.enum(["row", "cards", "big"]).default("row"),
    items: z.array(z.object({ value: z.number(), prefix: z.string().default(""), suffix: z.string().default(""), label: z.string() })).default([]),
    fx,
  }),
  defaults: {},
});

export const logos = defineSection({
  type: "logos",
  name: { th: "โลโก้พาร์ตเนอร์", en: "Logos" },
  description: { th: "แถบโลโก้วิ่งตามความเร็วการเลื่อน รองรับชื่อแบรนด์แบบตัวอักษร", en: "Velocity marquee of logos or typographic names" },
  category: "social",
  schema: z.object({
    heading: z.string().default("ได้รับความไว้วางใจจาก"),
    items: z.array(image).default([]),
    marquee: z.boolean().default(true),
    /** typographic wordmarks (accent font); shown when there are no logo images, or next to them */
    names: z.array(z.string()).default([]),
    fx,
  }),
  defaults: {},
});

export const marquee = defineSection({
  type: "marquee",
  name: { th: "ตัววิ่ง (Marquee)", en: "Marquee" },
  description: { th: "ตัวอักษรวิ่ง ตอบสนองความเร็วการเลื่อน (ปกติ/ขอบ/ป้าย/ยักษ์)", en: "Scroll-reactive marquee" },
  category: "layout",
  schema: z.object({
    items: z.array(z.string()).default(["ส่งฟรีทั่วไทย", "เปลี่ยนคืนได้ 7 วัน", "ของแท้ 100%"]),
    speed: z.number().default(30),
    style: z.enum(["text", "outline", "badges", "giant"]).default("text"),
    separator: z.string().default("✦"),
    velocity: z.boolean().default(true),
    fx,
  }),
  defaults: {},
});

export const pricing = defineSection({
  type: "pricing",
  name: { th: "ราคา / แพ็กเกจ", en: "Pricing" },
  description: { th: "การ์ดราคาเอียง 3D แพ็กเกจแนะนำมีขอบไล่สีหมุน", en: "3D tilt plans with an animated border" },
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
    fx,
  }),
  defaults: {},
});

export const team = defineSection({
  type: "team",
  name: { th: "ทีมงาน / แพทย์ / ช่าง", en: "Team" },
  description: { th: "พอร์ตเทรตโฮเวอร์เปลี่ยนสี, แถบเลื่อนแนวนอน หรือรายการพร้อมภาพลอย", en: "Portraits, horizontal track or hover list" },
  category: "social",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("ทีมของเรา"),
    subheading: z.string().default(""),
    variant: z.enum(["grid", "cards", "large", "list"]).default("grid"),
    members: z.array(z.object({ name: z.string(), role: z.string().default(""), avatar: z.string().default(""), bio: z.string().default(""), href: z.string().optional() })).default([]),
    fx,
  }),
  defaults: {},
});

export const video = defineSection({
  type: "video",
  name: { th: "วิดีโอ", en: "Video" },
  description: { th: "เฟรมภาพยนตร์ กดปุ่มเล่นแม่เหล็กแล้วโหลดวิดีโอในที่", en: "Cinematic poster frame, click to play" },
  category: "media",
  schema: z.object({
    heading: z.string().default(""),
    url: z.string().default(""), // YouTube / Vimeo URL
    poster: z.string().default(""),
    aspect: z.enum(["16/9", "9/16", "1/1"]).default("16/9"),
    fx,
  }),
  defaults: {},
});

export const steps = defineSection({
  type: "steps",
  name: { th: "ขั้นตอน (วิธีใช้บริการ)", en: "Steps" },
  description: { th: "เส้นเชื่อมวาดตามการเลื่อน, การ์ดซ้อน, เลขยักษ์ 01–04 หรืออุโมงค์ 3D", en: "Scroll-drawn line, stacking cards, giant numbers or 3D tunnel" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default("ใช้บริการง่าย ๆ 3 ขั้นตอน"),
    items: z.array(z.object({ title: z.string(), description: z.string().default(""), icon: z.string().optional() })).default([]),
    variant: z.enum(["horizontal", "vertical", "cards", "numbered", "tunnel"]).default("horizontal"),
    fx,
  }),
  defaults: {},
});

export const spacer = defineSection({
  type: "spacer",
  name: { th: "เว้นระยะ", en: "Spacer" },
  description: { th: "ช่องว่าง หรือเส้นแบ่งที่วาดตัวเองเมื่อเลื่อนถึง", en: "Space or a self-drawing divider" },
  category: "layout",
  schema: z.object({ size: z.enum(["sm", "md", "lg", "xl"]).default("md"), divider: z.boolean().default(false), fx }),
  defaults: {},
});

export const announcement = defineSection({
  type: "announcement",
  name: { th: "ประกาศ / โปรโมชัน", en: "Announcement" },
  description: { th: "แถบประกาศบาง ๆ หรือแบบวิ่งช้า ๆ", en: "Thin band, optionally scrolling" },
  category: "cta",
  schema: z.object({
    text: z.string().default("🎉 โปรโมชันพิเศษ ส่งฟรีเมื่อสั่งครบ 500 บาท"),
    cta: link.optional(),
    tone: z.enum(["primary", "accent", "muted"]).default("primary"),
    scroll: z.boolean().default(false),
    fx,
  }),
  defaults: {},
});

/* ------------------------------------------------------------------ */
/* Hi-end section types (docs/design/hi-end-direction.md §7.2)         */
/* ------------------------------------------------------------------ */

export const curvedGallery = defineSection({
  type: "curved-gallery",
  name: { th: "แกลเลอรีโค้ง 3D", en: "Curved 3D gallery" },
  description: { th: "การ์ดผลงานโค้งรอบตัวผู้ชมเหนือพื้นกริด ลาก/เลื่อนเพื่อหมุน", en: "Cards bent around the viewer above a grid floor" },
  category: "media",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default(""),
    subheading: z.string().default(""),
    bigTitle: z.string().default(""),
    bigTitleSuffix: z.string().default(""),
    items: z.array(z.object({ image: z.string(), title: z.string(), subtitle: z.string().default(""), tag: z.string().default(""), href: z.string().optional() })).default([]),
    floor: z.enum(["grid", "reflect", "none"]).default("grid"),
    autoplay: z.boolean().default(true),
    height: z.enum(["screen", "tall", "compact"]).default("screen"),
    cta: link.optional(),
    fx,
  }),
  defaults: {},
});

export const stickyStory = defineSection({
  type: "sticky-story",
  name: { th: "เรื่องเล่าแบบเลื่อนติด (Sticky story)", en: "Sticky story" },
  description: { th: "หัวข้อเรียงซ้าย ภาพทางขวาติดอยู่และเปลี่ยนตามหัวข้อที่เลื่อนถึง", en: "Titles scroll while a pinned stage morphs per item" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default(""),
    subheading: z.string().default(""),
    items: z
      .array(z.object({ title: z.string(), kicker: z.string().default(""), body: z.string().default(""), image: z.string().default(""), chips: z.array(z.string()).default([]), href: z.string().optional() }))
      .default([]),
    mediaStyle: z.enum(["card", "arch", "full", "device", "plate"]).default("card"),
    side: z.enum(["left", "right"]).default("right"),
    counter: z.boolean().default(true),
    fx,
  }),
  defaults: {},
});

export const tunnel = defineSection({
  type: "tunnel",
  name: { th: "อุโมงค์ขั้นตอน 3D", en: "Wormhole steps" },
  description: { th: "กล้องบินผ่านอุโมงค์ลวดเมื่อเลื่อน ทีละขั้นตอน", en: "Camera flies through a wireframe tunnel, step by step" },
  category: "content",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default(""),
    steps: z.array(z.object({ kicker: z.string().default(""), title: z.string(), body: z.string().default(""), image: z.string().default("") })).default([]),
    tint: z.enum(["primary", "accent", "foreground"]).default("primary"),
    length: z.enum(["short", "normal", "long"]).default("normal"),
    fx,
  }),
  defaults: {},
});

export const giantWordmark = defineSection({
  type: "giant-wordmark",
  name: { th: "ตัวอักษรยักษ์ (Wordmark)", en: "Giant wordmark" },
  description: { th: "ชื่อแบรนด์เต็มความกว้างจอ ยกขึ้น/พารัลแลกซ์/สปอตไลต์", en: "Brand name fitted to the full width" },
  category: "layout",
  schema: z.object({
    /** "" = the shop name */
    text: z.string().default(""),
    style: z.enum(["solid", "outline", "gradient", "image"]).default("solid"),
    image: image.optional(),
    effect: z.enum(["rise", "parallax", "spotlight", "marquee"]).default("rise"),
    caption: z.string().default(""),
    fx,
  }),
  defaults: {},
});

export const horizontalScroll = defineSection({
  type: "horizontal-scroll",
  name: { th: "การ์ดเลื่อนแนวนอน", en: "Horizontal scroll" },
  description: { th: "การ์ดวิ่งแนวนอนตามการเลื่อนหน้า (มือถือปัดได้)", en: "Pinned track that moves sideways as you scroll" },
  category: "media",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default(""),
    subheading: z.string().default(""),
    items: z.array(z.object({ image: z.string(), title: z.string(), body: z.string().default(""), tag: z.string().default(""), href: z.string().optional() })).default([]),
    cardStyle: z.enum(["poster", "editorial", "numbered"]).default("poster"),
    ratio: z.enum(["3/4", "4/5", "16/10", "1/1"]).default("4/5"),
    fx,
  }),
  defaults: {},
});

export const projectList = defineSection({
  type: "project-list",
  name: { th: "รายการผลงาน (Hover preview)", en: "Project list" },
  description: { th: "รายชื่อผลงานตัวใหญ่ ชี้แล้วมีภาพลอยตามเมาส์", en: "Big rows with a floating cursor preview" },
  category: "media",
  schema: z.object({
    eyebrow: z.string().default(""),
    heading: z.string().default(""),
    bigTitle: z.string().default(""),
    items: z.array(z.object({ title: z.string(), category: z.string().default(""), year: z.string().default(""), image: z.string().default(""), summary: z.string().default(""), href: z.string().optional() })).default([]),
    layout: z.enum(["list-hover", "grid-staggered"]).default("list-hover"),
    cursorLabel: z.string().default("ดูโปรเจกต์"),
    fx,
  }),
  defaults: {},
});

export const interlude = defineSection({
  type: "interlude",
  name: { th: "ฉากคั่น 3D", en: "3D interlude" },
  description: { th: "ฉาก 3D เต็มจอคั่นระหว่างเนื้อหา พร้อมประโยคเด่น", en: "Full-screen 3D moment with a statement" },
  category: "media",
  schema: z.object({
    scene: z.enum(["shader", "particle-morph", "floating-objects", "breathing-orb", "ocean", "stage-lights", "steam", "water-ripple"]).default("shader"),
    heading: z.string().default(""),
    body: z.string().default(""),
    cta: link.optional(),
    /** particle-morph text shapes / word cycler */
    words: z.array(z.string()).default([]),
    height: z.enum(["screen", "tall"]).default("screen"),
    align: z.enum(["center", "left"]).default("center"),
    /** photo for water-ripple (and the static poster) */
    image: image.optional(),
    fx,
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
    curvedGallery,
    stickyStory,
    tunnel,
    giantWordmark,
    horizontalScroll,
    projectList,
    interlude,
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
