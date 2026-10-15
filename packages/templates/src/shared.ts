import type { TemplatePage } from "@rentweb/core/tenant";
import { section, contact, text, faq, cta } from "@rentweb/storefront/definitions";

/** Unsplash image helper (hotlink, auto format). */
export const u = (id: string, w = 1600, extra = "") => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80${extra}`;
export const avatar = (seed: string) => `https://i.pravatar.cc/160?u=${encodeURIComponent(seed)}`;

export function aboutPage(opts: { title?: string; heading: string; body: string; eyebrow?: string }): TemplatePage {
  return {
    slug: "about",
    title: opts.title ?? "เกี่ยวกับเรา",
    showInNav: false,
    sections: [
      section(text, { eyebrow: opts.eyebrow ?? "เกี่ยวกับเรา", heading: opts.heading, body: opts.body, size: "large" }),
      section(cta, { heading: "มีคำถาม? ทักเรามาได้เลย", body: "ทีมงานพร้อมตอบทุกคำถามผ่าน LINE ภายในไม่กี่นาที", primaryCta: { label: "ติดต่อเรา", href: "/contact" }, variant: "card" }),
    ],
  };
}

export function contactPage(opts?: { heading?: string; body?: string; faqs?: Array<{ q: string; a: string }> }): TemplatePage {
  return {
    slug: "contact",
    title: "ติดต่อเรา",
    showInNav: false,
    sections: [
      section(contact, { heading: opts?.heading ?? "ติดต่อเรา", body: opts?.body ?? "ส่งข้อความหาเราได้ทุกช่องทาง ทีมงานตอบกลับภายใน 24 ชั่วโมง" }),
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
