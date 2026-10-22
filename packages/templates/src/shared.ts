import type { TemplatePage } from "@rentweb/core/tenant";
import { section, contact, text, faq, cta } from "@rentweb/storefront/definitions";

/** Unsplash image helper (hotlink, auto format). */
export const u = (id: string, w = 1600, extra = "") => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80${extra}`;
export const avatar = (seed: string) => `https://i.pravatar.cc/160?u=${encodeURIComponent(seed)}`;

/**
 * Brand-neutral About copy for NEW shops (ADMIN_B2-07): the demo About page tells the sample brand's own story
 * (founding year, founder, hometown), which must never be published under a real owner's shop name.
 * "{{name}}" is replaced with the tenant's name at provisioning.
 */
export const NEUTRAL_ABOUT = {
  default: { heading: "เกี่ยวกับ {{name}}", body: "ยินดีต้อนรับสู่ {{name}} เราตั้งใจดูแลลูกค้าทุกท่านอย่างใส่ใจ หากมีคำถามหรือต้องการข้อมูลเพิ่มเติม ติดต่อเราได้ทุกช่องทางในหน้า “ติดต่อเรา”" },
  shop: { heading: "เกี่ยวกับ {{name}}", body: "{{name}} คัดสรรสินค้าที่เราอยากส่งต่อให้คุณ ทุกออเดอร์แพ็กอย่างใส่ใจและมีทีมงานดูแลหลังการขาย หากมีคำถามเรื่องสินค้า ขนาด หรือการจัดส่ง ทักมาคุยกับเราได้เลย" },
  cafe: { heading: "เกี่ยวกับ {{name}}", body: "{{name}} ตั้งใจทำขนมและเครื่องดื่มให้สดใหม่ทุกวัน เลือกวัตถุดิบที่เราไว้ใจ และพร้อมรับออร์เดอร์พิเศษสำหรับทุกโอกาส แวะมาที่ร้านหรือสั่งออนไลน์ได้เลย" },
  salon: { heading: "เกี่ยวกับ {{name}}", body: "{{name}} อยากให้ทุกการมาใช้บริการเป็นเวลาพักผ่อนที่คุ้มค่า ทีมงานดูแลทุกขั้นตอนอย่างใส่ใจ จองคิวออนไลน์ล่วงหน้าได้ตลอด 24 ชั่วโมง" },
  restaurant: { heading: "เกี่ยวกับ {{name}}", body: "{{name}} ปรุงอาหารทุกจานสดใหม่ด้วยวัตถุดิบที่คัดสรร พร้อมต้อนรับทั้งทานที่ร้าน สั่งกลับบ้าน และจองโต๊ะล่วงหน้า" },
  corporate: { heading: "เกี่ยวกับ {{name}}", body: "{{name}} ทำงานร่วมกับลูกค้าอย่างใกล้ชิด ตั้งแต่ทำความเข้าใจโจทย์ไปจนถึงส่งมอบงานและดูแลต่อเนื่อง ติดต่อเราเพื่อพูดคุยว่าเราช่วยธุรกิจของคุณได้อย่างไร" },
  clinic: { heading: "เกี่ยวกับ {{name}}", body: "{{name}} ให้คำปรึกษาก่อนทุกการรักษา และดูแลผู้รับบริการอย่างใส่ใจในทุกขั้นตอน นัดหมายล่วงหน้าออนไลน์ได้ตลอด 24 ชั่วโมง" },
} as const;

/**
 * Forced line break for "Brand — tagline" headings (direction A5): the giant About <h1> breaks after the brand instead of
 * wherever the browser's Thai line breaker lands ("Sugar Puff —⏎ครัวเล็ก ๆ …"). Headings that already contain a "\n" are kept.
 */
export function breakAfterBrand(heading: string): string {
  if (heading.includes("\n")) return heading;
  const i = heading.indexOf(" — ");
  return i > 0 ? `${heading.slice(0, i)} —\n${heading.slice(i + 3)}` : heading;
}

export function aboutPage(opts: {
  title?: string;
  heading: string;
  body: string;
  eyebrow?: string;
  /** About copy for new (non-demo) shops, see NEUTRAL_ABOUT */
  neutral?: { heading: string; body: string };
  /** break the heading after "Brand —" (default true; see breakAfterBrand) */
  lineBreak?: boolean;
}): TemplatePage {
  const neutral = opts.neutral ?? NEUTRAL_ABOUT.default;
  const heading = opts.lineBreak === false ? opts.heading : breakAfterBrand(opts.heading);
  const contactCta = () => section(cta, { heading: "มีคำถาม? ทักเรามาได้เลย", body: "ทีมงานพร้อมตอบทุกคำถามผ่าน LINE ภายในไม่กี่นาที", primaryCta: { label: "ติดต่อเรา", href: "/contact" }, variant: "card" });
  return {
    slug: "about",
    title: opts.title ?? "เกี่ยวกับเรา",
    showInNav: false,
    sections: [section(text, { eyebrow: opts.eyebrow ?? "เกี่ยวกับเรา", heading, body: opts.body, size: "large" }), contactCta()],
    neutralSections: [section(text, { eyebrow: opts.eyebrow ?? "เกี่ยวกับเรา", heading: neutral.heading, body: neutral.body, size: "large" }), contactCta()],
  };
}

export function contactPage(opts?: {
  heading?: string;
  body?: string;
  faqs?: Array<{ q: string; a: string }>;
  /** "chips" = interest / budget chips that prefill the message (same form) */
  variant?: "classic" | "chips";
  interests?: string[];
  budgets?: string[];
  showForm?: boolean;
  showMap?: boolean;
  showHours?: boolean;
}): TemplatePage {
  const extra = {
    ...(opts?.variant ? { variant: opts.variant } : {}),
    ...(opts?.interests?.length ? { interests: opts.interests } : {}),
    ...(opts?.budgets?.length ? { budgets: opts.budgets } : {}),
    ...(opts?.showForm != null ? { showForm: opts.showForm } : {}),
    ...(opts?.showMap != null ? { showMap: opts.showMap } : {}),
    ...(opts?.showHours != null ? { showHours: opts.showHours } : {}),
  };
  return {
    slug: "contact",
    title: "ติดต่อเรา",
    showInNav: false,
    sections: [
      section(contact, { heading: opts?.heading ?? "ติดต่อเรา", body: opts?.body ?? "ส่งข้อความหาเราได้ทุกช่องทาง ทีมงานตอบกลับภายใน 24 ชั่วโมง", ...extra }),
      ...(opts?.faqs?.length ? [section(faq, { heading: "คำถามที่พบบ่อย", items: opts.faqs })] : []),
    ],
  };
}

export function legalPages(name: string): TemplatePage[] {
  return [
    {
      slug: "privacy",
      title: "นโยบายความเป็นส่วนตัว",
      kind: "system",
      sections: [
        section(text, {
          heading: "นโยบายความเป็นส่วนตัว",
          body: `${name} ให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคลของคุณตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)\n\nข้อมูลที่เราเก็บ: ชื่อ เบอร์โทรศัพท์ อีเมล ที่อยู่จัดส่ง และประวัติการใช้บริการ เพื่อใช้ในการให้บริการ จัดส่งสินค้า แจ้งสถานะ และดูแลหลังการขายเท่านั้น\n\nเราจะไม่เปิดเผยข้อมูลของคุณให้บุคคลที่สาม ยกเว้นผู้ให้บริการที่จำเป็นต่อการให้บริการ (เช่น บริษัทขนส่ง ผู้ให้บริการชำระเงิน) และตามที่กฎหมายกำหนด\n\nคุณมีสิทธิ์ขอเข้าถึง แก้ไข หรือลบข้อมูลของคุณได้ทุกเมื่อ โดยติดต่อเราผ่านช่องทางในหน้า "ติดต่อเรา"`,
        }),
      ],
    },
    {
      slug: "terms",
      title: "เงื่อนไขการใช้บริการ",
      kind: "system",
      sections: [
        section(text, {
          heading: "เงื่อนไขการใช้บริการ",
          body: `การใช้งานเว็บไซต์ของ ${name} ถือว่าคุณยอมรับเงื่อนไขต่อไปนี้\n\n1. ราคาสินค้า/บริการแสดงเป็นเงินบาท รวมภาษีมูลค่าเพิ่ม (ถ้ามี) และอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งล่วงหน้า\n2. คำสั่งซื้อจะสมบูรณ์เมื่อได้รับการยืนยันการชำระเงิน\n3. การเปลี่ยน/คืนสินค้าเป็นไปตามนโยบายการคืนสินค้าของร้าน\n4. ร้านขอสงวนสิทธิ์ยกเลิกคำสั่งซื้อที่มีความผิดปกติหรือเข้าข่ายทุจริต`,
        }),
      ],
    },
    {
      slug: "refund",
      title: "นโยบายการคืนเงิน",
      kind: "system",
      sections: [
        section(text, {
          heading: "นโยบายการเปลี่ยน/คืนสินค้าและคืนเงิน",
          body: `สามารถแจ้งเปลี่ยนหรือคืนสินค้าได้ภายใน 7 วันนับจากวันที่ได้รับสินค้า หากสินค้าชำรุด เสียหาย หรือไม่ตรงตามที่สั่ง โดยสินค้าต้องอยู่ในสภาพสมบูรณ์พร้อมบรรจุภัณฑ์\n\nการคืนเงินจะดำเนินการภายใน 7–14 วันทำการหลังจากได้รับสินค้าคืนและตรวจสอบเรียบร้อย โดยคืนผ่านช่องทางเดิมที่ชำระ`,
        }),
      ],
    },
  ];
}

export const defaultHours = [
  { day: "จันทร์ – ศุกร์", time: "10:00 – 20:00" },
  { day: "เสาร์ – อาทิตย์", time: "10:00 – 21:00" },
];

export const legalNav = [
  { label: "นโยบายความเป็นส่วนตัว", href: "/privacy" },
  { label: "เงื่อนไขการใช้บริการ", href: "/terms" },
  { label: "การคืนเงิน", href: "/refund" },
];
