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
};

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
      if (item.kind === "object" && item.fields.some((f) => f.kind === "array" || f.kind === "json")) return { kind: "json", ...base };
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
