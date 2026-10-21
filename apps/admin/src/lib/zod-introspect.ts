import type { z } from "zod";

/**
 * Turns a zod v4 schema into a renderable field tree so the admin can auto-generate forms
 * for section props. Unknown shapes degrade to a JSON textarea.
 */
export type FieldSpec =
  | { kind: "string"; key: string; label: string; optional: boolean; multiline: boolean; defaultValue?: string }
  | { kind: "number"; key: string; label: string; optional: boolean; min?: number; max?: number; step: number; defaultValue?: number }
  | { kind: "boolean"; key: string; label: string; optional: boolean; defaultValue?: boolean }
  | { kind: "enum"; key: string; label: string; optional: boolean; options: Array<string | number>; defaultValue?: string | number }
  | { kind: "array"; key: string; label: string; optional: boolean; item: FieldSpec; defaultValue?: unknown[] }
  | { kind: "object"; key: string; label: string; optional: boolean; fields: FieldSpec[]; isImage: boolean; isLink: boolean }
  | { kind: "json"; key: string; label: string; optional: boolean };

export type ObjectSpec = Extract<FieldSpec, { kind: "object" }>;

const LABELS: Record<string, string> = {
  heading: "หัวข้อ",
  subheading: "หัวข้อรอง",
  eyebrow: "ข้อความนำ (eyebrow)",
  body: "เนื้อหา",
  variant: "รูปแบบ",
  items: "รายการ",
  image: "รูปภาพ",
  imageSecondary: "รูปที่สอง",
  images: "รูปภาพ",
  url: "URL",
  alt: "คำบรรยายรูป (alt)",
  label: "ข้อความ",
  href: "ลิงก์",
  external: "เปิดในแท็บใหม่",
  primaryCta: "ปุ่มหลัก",
  secondaryCta: "ปุ่มรอง",
  cta: "ปุ่ม",
  columns: "จำนวนคอลัมน์",
  limit: "จำนวนที่แสดง",
  showViewAll: "แสดงปุ่ม “ดูทั้งหมด”",
  background: "พื้นหลัง",
  badges: "ป้ายข้อความ",
  stats: "ตัวเลขสถิติ",
  value: "ค่า",
  description: "คำอธิบาย",
  title: "ชื่อ",
  icon: "ไอคอน (ชื่อ lucide)",
  quote: "คำพูด",
  name: "ชื่อ",
  role: "ตำแหน่ง",
  avatar: "รูปโปรไฟล์ (URL)",
  rating: "คะแนน (1–5)",
  q: "คำถาม",
  a: "คำตอบ",
  layout: "เลย์เอาต์",
  align: "การจัดวาง",
  size: "ขนาด",
  imagePosition: "ตำแหน่งรูป",
  bullets: "หัวข้อย่อย",
  style: "สไตล์",
  caption: "คำบรรยาย",
  text: "ข้อความ",
  tone: "โทนสี",
  speed: "ความเร็ว",
  separator: "ตัวคั่น",
  plans: "แพ็กเกจ",
  price: "ราคา",
  period: "ต่อ (เช่น /เดือน)",
  features: "คุณสมบัติ",
  highlighted: "เน้นแพ็กเกจนี้",
  badge: "ป้าย",
  members: "สมาชิกทีม",
  bio: "ประวัติย่อ",
  poster: "รูปปก (URL)",
  aspect: "สัดส่วนภาพ",
  divider: "แสดงเส้นแบ่ง",
  showForm: "แสดงฟอร์มติดต่อ",
  showMap: "แสดงแผนที่",
  showHours: "แสดงเวลาทำการ",
  phone: "เบอร์โทร",
  email: "อีเมล",
  lineId: "LINE ID",
  address: "ที่อยู่",
  mapEmbedUrl: "ลิงก์ฝังแผนที่ (Google Maps embed)",
  source: "แหล่งข้อมูล",
  categorySlug: "หมวดหมู่ (slug)",
  serviceSlug: "บริการ (slug)",
  cardStyle: "สไตล์การ์ด",
  compact: "แบบกระชับ",
  showSearch: "แสดงช่องค้นหา",
  marquee: "วิ่งต่อเนื่อง",
  textReveal: "ข้อความค่อย ๆ ปรากฏ",
  overlay: "ความทึบของชั้นทับรูป (0–1)",
  prefix: "คำนำหน้า",
  suffix: "คำต่อท้าย",
  // hi-end redesign (docs/design/hi-end-direction.md §7)
  fx: "เอฟเฟกต์ & 3D",
  bigTitle: "หัวข้อยักษ์",
  bigTitleSuffix: "ข้อความต่อท้ายหัวข้อยักษ์",
  floor: "พื้น 3D",
  autoplay: "หมุนอัตโนมัติ",
  height: "ความสูง",
  mediaStyle: "สไตล์สื่อ",
  side: "ฝั่งสื่อ",
  counter: "แสดงเลขลำดับ",
  chips: "ป้าย",
  kicker: "ข้อความนำ",
  steps: "ขั้นตอน",
  length: "ความยาว",
  effect: "เอฟเฟกต์",
  ratio: "สัดส่วนภาพ",
  category: "หมวด",
  year: "ปี",
  summary: "สรุป",
  cursorLabel: "ข้อความบนเคอร์เซอร์",
  scene: "วัตถุ 3D",
  words: "คำ",
  cards: "การ์ดลอย",
  cycleWords: "คำที่สลับวน ({*} ในหัวข้อ)",
  headingSize: "ขนาดหัวข้อ",
  clock: "แสดงนาฬิกา",
  cornerLabels: "ป้ายมุมจอ (สูงสุด 3)",
  interests: "ตัวเลือกความสนใจ",
  budgets: "ตัวเลือกงบประมาณ",
  names: "ชื่อแบรนด์ (ตัวอักษร)",
  velocity: "ตอบสนองการเลื่อน",
  scroll: "เลื่อนวิ่ง",
  subtitle: "คำบรรยายรอง",
  tag: "ป้าย",
  variantStyle: "สไตล์",
};

/**
 * Thai labels for enum values (buttons / selects in the auto-form). Keyed by field, with a shared fallback map; raw
 * values still show for anything unknown.
 */
const OPTION_LABELS: Record<string, Record<string, string>> = {
  _: {
    auto: "อัตโนมัติ",
    none: "ไม่มี",
    left: "ซ้าย",
    right: "ขวา",
    center: "กึ่งกลาง",
    cards: "การ์ด",
    list: "รายการ",
    grid: "กริด",
    single: "คอลัมน์เดียว",
    "two-column": "สองคอลัมน์",
    normal: "ปกติ",
    large: "ใหญ่",
    sm: "เล็ก",
    md: "กลาง",
    lg: "ใหญ่",
    xl: "ใหญ่มาก",
    primary: "สีหลัก",
    accent: "สีเน้น",
    muted: "สีอ่อน",
    foreground: "สีตัวอักษร",
  },
  fx: { auto: "เต็มที่ (ตามธีม)", calm: "เบา (ไม่มี 3D)", off: "ปิด (นิ่ง)" },
  variant: {
    split: "แบ่งซ้าย-ขวา",
    centered: "กึ่งกลาง",
    fullscreen: "ภาพเต็มจอ",
    editorial: "นิตยสาร",
    stacked: "ภาพกว้างขยายตามการเลื่อน",
    scatter: "การ์ดลอย",
    cinematic: "ภาพยนตร์ (3D)",
    bento: "เบนโต",
    icons: "ไอคอน",
    sticky: "เรื่องเล่าเลื่อนติด",
    marquee: "แถบวิ่ง",
    spotlight: "คำพูดเด่น",
    chat: "ฟองแชต",
    banner: "แบนเนอร์เต็มความกว้าง",
    card: "การ์ด + เชดเดอร์",
    glow: "เรืองแสงบนพื้นมืด",
    wordmark: "ตัวอักษรเต็มจอ",
    row: "แถว",
    big: "ตัวเลขยักษ์",
    classic: "คลาสสิก",
    chips: "เลือกชิป (ความสนใจ/งบ)",
    horizontal: "แนวนอน (เส้นวาดตามการเลื่อน)",
    vertical: "แนวตั้ง",
    numbered: "เลขยักษ์ 01–04",
    tunnel: "อุโมงค์ 3D",
    large: "แถบเลื่อนแนวนอน",
    list: "รายการ + ภาพลอย",
    tiles: "ไทล์",
    pills: "แคปซูล",
    circles: "วงกลม",
    menu: "เมนูราคา",
    filmstrip: "แถบฟิล์ม",
  },
  source: { featured: "สินค้าแนะนำ", newest: "มาใหม่", "best-sellers": "ขายดี", category: "ตามหมวดหมู่", all: "ทั้งหมด", next: "งานถัดไป" },
  scope: { upcoming: "กำลังจะมาถึง", past: "ที่ผ่านมา" },
  layout: {
    grid: "กริด + ไลต์บ็อกซ์",
    masonry: "เมสันรี (พารัลแลกซ์)",
    carousel: "แกลเลอรีโค้ง 3D (เตี้ย)",
    filmstrip: "แถบฟิล์มเลื่อนแนวนอน",
    curved: "แกลเลอรีโค้ง 3D",
    polaroid: "โพลารอยด์ลากได้",
    "list-hover": "รายการ + ภาพลอยตามเมาส์",
    "grid-staggered": "กริดสลับระดับ",
  },
  style: {
    plain: "เรียบ",
    card: "การ์ดลอยทับภาพ",
    overlap: "ซ้อนชั้นพารัลแลกซ์",
    pinned: "ภาพติดขณะเลื่อน",
    text: "ข้อความ",
    outline: "ตัวขอบ",
    badges: "ป้ายสติกเกอร์",
    giant: "ตัวอักษรยักษ์",
    solid: "ทึบ",
    gradient: "ไล่สี",
    image: "ภาพในตัวอักษร",
  },
  background: {
    theme: "ตามธีม",
    "gradient-mesh": "ไล่สี (mesh)",
    aurora: "ออโรรา",
    particles: "อนุภาค",
    "orb-3d": "วัตถุ 3D",
    noise: "นอยซ์",
    blobs: "หยดน้ำ",
    waves: "คลื่น",
    spotlight: "สปอตไลต์",
    "shader-aurora": "ออโรรา 3D",
    "shader-silk": "ผ้าไหม 3D",
    "shader-mesh": "เมช 3D",
    "shader-caustics": "แสงน้ำ 3D",
  },
  scene: {
    auto: "ตามธีม (ฉากประจำธีม)",
    none: "ไม่มี (ภาพนิ่ง)",
    "particle-morph": "อนุภาคแปลงร่าง",
    "floating-objects": "วัตถุลอย",
    "card-stack": "การ์ด 3D",
    "breathing-orb": "ลูกแก้วหายใจ",
    "image-silk": "ภาพบนผ้าไหม",
    ocean: "ผิวน้ำทะเล",
    "stage-lights": "ไฟเวที",
    steam: "ไอร้อน",
    "water-ripple": "ระลอกน้ำบนภาพ",
    shader: "พื้นหลังเชดเดอร์",
  },
  headingSize: { auto: "อัตโนมัติ", xl: "ใหญ่", giant: "ยักษ์" },
  floor: { grid: "กริด", reflect: "สะท้อน", none: "ไม่มี" },
  height: { screen: "เต็มจอ", tall: "สูงพิเศษ", compact: "กะทัดรัด" },
  mediaStyle: { card: "การ์ด", arch: "โค้งซุ้ม", full: "เต็มกรอบ", device: "มือถือ", plate: "จานกลม" },
  length: { short: "สั้น", normal: "ปกติ", long: "ยาว" },
  effect: { rise: "ลอยขึ้น", parallax: "พารัลแลกซ์", spotlight: "สปอตไลต์", marquee: "วิ่ง" },
  cardStyle: { poster: "โปสเตอร์", editorial: "นิตยสาร", numbered: "มีเลขลำดับ", standard: "มาตรฐาน", minimal: "มินิมอล", "hover-swap": "สลับภาพเมื่อชี้" },
  tint: { primary: "สีหลัก", accent: "สีเน้น", foreground: "สีตัวอักษร" },
  imagePosition: { left: "ซ้าย", right: "ขวา" },
  aspect: { "16/9": "แนวนอน 16:9", "9/16": "แนวตั้ง 9:16", "1/1": "จัตุรัส" },
};

export function optionLabel(key: string, value: string | number): string {
  const v = String(value);
  return OPTION_LABELS[key]?.[v] ?? OPTION_LABELS._?.[v] ?? v;
}

const MULTILINE = /^(body|description|a|quote|bio|subheading)$/;

export function labelFor(key: string): string {
  return LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = { type: string; innerType?: any; defaultValue?: unknown; entries?: Record<string, string | number>; options?: any[]; values?: unknown[]; element?: any; shape?: Record<string, any>; checks?: any[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defOf(schema: any): AnyDef {
  return (schema?._zod?.def ?? schema?.def ?? {}) as AnyDef;
}

/** Strips default/optional/nullable wrappers, remembering what we saw. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(schema: any): { inner: any; optional: boolean; defaultValue: unknown; hasDefault: boolean } {
  let inner = schema;
  let optional = false;
  let defaultValue: unknown;
  let hasDefault = false;
  for (let i = 0; i < 8; i++) {
    const d = defOf(inner);
    if (d.type === "default" || d.type === "prefault") {
      hasDefault = true;
      try {
        defaultValue = typeof d.defaultValue === "function" ? (d.defaultValue as () => unknown)() : d.defaultValue;
      } catch {
        defaultValue = undefined;
      }
      inner = d.innerType;
      continue;
    }
    if (d.type === "optional" || d.type === "nullable" || d.type === "nonoptional") {
      if (d.type !== "nonoptional") optional = true;
      inner = d.innerType;
      continue;
    }
    if (d.type === "readonly" || d.type === "catch" || d.type === "pipe") {
      inner = d.innerType ?? (d as { in?: unknown }).in ?? inner;
      if (inner === schema) break;
      continue;
    }
    break;
  }
  return { inner, optional, defaultValue, hasDefault };
}

export function describeSchema(schema: z.ZodTypeAny, key = "", label?: string): FieldSpec {
  const { inner, optional, defaultValue, hasDefault } = unwrap(schema);
  const d = defOf(inner);
  const lbl = label ?? labelFor(key);
  const base = { key, label: lbl, optional };

  switch (d.type) {
    case "string":
      return { kind: "string", ...base, multiline: MULTILINE.test(key), defaultValue: hasDefault ? (defaultValue as string) : undefined };
    case "number":
    case "int": {
      let min: number | undefined;
      let max: number | undefined;
      let isInt = d.type === "int";
      for (const c of d.checks ?? []) {
        const cd = (c?._zod?.def ?? c?.def ?? {}) as { check?: string; value?: number; inclusive?: boolean; format?: string };
        if (cd.check === "greater_than" && typeof cd.value === "number") min = cd.inclusive ? cd.value : cd.value + 1;
        if (cd.check === "less_than" && typeof cd.value === "number") max = cd.inclusive ? cd.value : cd.value - 1;
        if (cd.check === "number_format" && cd.format && /int/.test(cd.format)) isInt = true;
      }
      const step = isInt || (max !== undefined && max > 1) ? 1 : 0.05;
      return { kind: "number", ...base, min, max, step, defaultValue: hasDefault ? (defaultValue as number) : undefined };
    }
    case "boolean":
      return { kind: "boolean", ...base, defaultValue: hasDefault ? (defaultValue as boolean) : undefined };
    case "enum":
      return { kind: "enum", ...base, options: Object.values(d.entries ?? {}), defaultValue: hasDefault ? (defaultValue as string) : undefined };
    case "literal":
      return { kind: "enum", ...base, options: (d.values ?? []) as Array<string | number>, defaultValue: hasDefault ? (defaultValue as string) : undefined };
    case "union": {
      const opts: Array<string | number> = [];
      for (const o of d.options ?? []) {
        const od = defOf(o);
        if (od.type === "literal") opts.push(...((od.values ?? []) as Array<string | number>));
        else if (od.type === "enum") opts.push(...Object.values(od.entries ?? {}));
        else return { kind: "json", ...base };
      }
      return { kind: "enum", ...base, options: opts, defaultValue: hasDefault ? (defaultValue as string) : undefined };
    }
    case "array": {
      const item = describeSchema(d.element, key, "รายการ");
      if (item.kind === "json") return { kind: "json", ...base };
      if (item.kind === "array") return { kind: "json", ...base };
      // object items may hold arrays of primitives (chips, features …); deeper nesting falls back to JSON
      if (item.kind === "object" && item.fields.some((f) => f.kind === "json" || (f.kind === "array" && f.item.kind !== "string" && f.item.kind !== "number" && f.item.kind !== "enum"))) return { kind: "json", ...base };
      return { kind: "array", ...base, item, defaultValue: hasDefault ? (defaultValue as unknown[]) : undefined };
    }
    case "object": {
      const shape = d.shape ?? {};
      const fields = Object.entries(shape).map(([k, s]) => describeSchema(s as z.ZodTypeAny, k));
      const keys = Object.keys(shape);
      const isImage = keys.includes("url") && keys.includes("alt") && keys.every((k) => ["url", "alt", "caption"].includes(k));
      const isLink = keys.includes("label") && keys.includes("href");
      return { kind: "object", ...base, fields, isImage, isLink };
    }
    default:
      return { kind: "json", ...base };
  }
}

/** Default value for a spec (used when adding array items). */
export function emptyValue(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case "string":
      return spec.defaultValue ?? "";
    case "number":
      return spec.defaultValue ?? spec.min ?? 0;
    case "boolean":
      return spec.defaultValue ?? false;
    case "enum":
      return spec.defaultValue ?? spec.options[0];
    case "array":
      return spec.defaultValue ?? [];
    case "object":
      return Object.fromEntries(spec.fields.filter((f) => !f.optional || f.kind === "string").map((f) => [f.key, emptyValue(f)]));
    case "json":
      return {};
  }
}
