/**
 * What each business module gives a shop (Thai copy for /templates/[key] "มีอะไรในเทมเพลตนี้" and /features).
 * Facts only — every line comes from the template descriptions, plan features or the existing FAQ.
 */
export const MODULE_FEATURES: Record<string, { title: string; features: string[] }> = {
  cms: {
    title: "หน้าเว็บ & ดีไซน์",
    features: [
      "จัดหน้าเว็บเองด้วยบล็อกสำเร็จรูป ไม่ต้องเขียนโค้ด",
      "ปรับโลโก้ สี ฟอนต์ไทย และเอฟเฟกต์ได้ทุกเมื่อ",
      "บทความ/บล็อก และฟอร์มติดต่อ",
      "subdomain ฟรี หรือโดเมนของคุณเองพร้อม SSL (ตั้งแต่ Pro)",
    ],
  },
  commerce: {
    title: "ขายของออนไลน์",
    features: ["ตะกร้า + ชำระเงิน PromptPay/สลิป", "สินค้าหลายตัวเลือก (ไซซ์ สี)", "คูปอง รีวิว", "ติดตามพัสดุ", "สั่งล่วงหน้าพร้อมเลือกวันรับ"],
  },
  topup: {
    title: "เติมเกม",
    features: ["เติมเกมอัตโนมัติ 24 ชม.", "กระเป๋าเงินในเว็บ", "แพ็กเกจราคาสมาชิก", "ตรวจสลิปอัตโนมัติ"],
  },
  clinic: {
    title: "คลินิก",
    features: ["ทะเบียนผู้ป่วย", "บันทึกการรักษา", "คอร์ส/แพ็กเกจทรีตเมนต์"],
  },
  booking: {
    title: "จองคิว & คลาส",
    features: ["จองคิวออนไลน์ เลือกช่าง/แพทย์ และเวลา", "วางมัดจำออนไลน์", "เตือนนัดผ่าน LINE", "คลาสจำกัดที่นั่ง + ตารางเรียนรายสัปดาห์", "คลาสพาส 5/10 ครั้ง"],
  },
  restaurant: {
    title: "ร้านอาหาร + QR",
    features: ["เมนูออนไลน์", "สแกน QR สั่งอาหารที่โต๊ะ", "จอครัว", "สั่งรับกลับบ้าน", "จองโต๊ะล่วงหน้า"],
  },
  rental: {
    title: "ที่พัก",
    features: ["เลือกวันเช็กอิน–เช็กเอาต์", "ประเภทห้องหลายหลัง", "ราคาตามฤดูกาลและวันหยุด", "ปฏิทินห้องว่าง + บริการเสริม", "มัดจำผ่านพร้อมเพย์", "หน้าเช็กอิน/เช็กเอาต์หลังบ้าน"],
  },
  events: {
    title: "อีเวนต์ & บัตร",
    features: ["ขายบัตรออนไลน์ + e-ticket QR", "เช็กอินหน้างานด้วยกล้อง", "หลายรอบ หลายประเภทบัตร", "ช่วงเวลาจำหน่าย (early bird) + จำนวนจำกัด", "คืนเงินและรายชื่อผู้เข้าร่วม"],
  },
};

/** module list for a template: business modules first, then the page/design base every site has */
export function templateFeatureGroups(modules: string[]) {
  const keys = [...modules.filter((m) => MODULE_FEATURES[m]), "cms"];
  return keys.map((k) => ({ key: k, ...MODULE_FEATURES[k]! }));
}
