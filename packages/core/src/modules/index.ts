export const MODULE_KEYS = [
  "cms",
  "commerce",
  "booking",
  "topup",
  "restaurant",
  "clinic",
  "rental",
  "lms",
  "membership",
  "events",
  "listings",
  "donation",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface AdminNavItem {
  key: string;
  label: { th: string; en: string };
  href: string; // relative to /t/{slug}
  icon: string; // lucide icon name
  badgeKey?: string; // e.g. "orders.pending"
  children?: AdminNavItem[];
}

export interface ModuleMeta {
  key: ModuleKey;
  name: { th: string; en: string };
  description: { th: string; en: string };
  dependsOn: ModuleKey[];
  /** admin sidebar entries contributed by this module */
  adminNav: AdminNavItem[];
  /** storefront route prefixes owned by this module */
  storefrontRoutes: string[];
  permissions: string[];
  /** default per-plan quotas (plan.limits can override) */
  quotas: Record<string, number>;
  core?: boolean;
}

export const MODULES: Record<ModuleKey, ModuleMeta> = {
  cms: {
    key: "cms",
    name: { th: "หน้าเว็บและเนื้อหา", en: "Pages & Content" },
    description: { th: "หน้าเว็บ ธีม บล็อก ฟอร์ม สื่อ", en: "Pages, theme, blog, forms, media" },
    dependsOn: [],
    core: true,
    adminNav: [
      { key: "pages", label: { th: "หน้าเว็บ", en: "Pages" }, href: "/pages", icon: "LayoutTemplate" },
      { key: "design", label: { th: "ดีไซน์และธีม", en: "Design" }, href: "/design", icon: "Palette" },
      { key: "media", label: { th: "คลังสื่อ", en: "Media" }, href: "/media", icon: "Images" },
      { key: "blog", label: { th: "บทความ", en: "Blog" }, href: "/blog", icon: "Newspaper" },
      { key: "forms", label: { th: "ฟอร์ม", en: "Forms" }, href: "/forms", icon: "ClipboardList" },
    ],
    storefrontRoutes: ["/", "/p", "/blog", "/contact"],
    permissions: ["cms.pages.write", "cms.theme.write", "cms.media.write", "cms.blog.write"],
    quotas: { pages: 20, storageMb: 1024 },
  },
  commerce: {
    key: "commerce",
    name: { th: "ร้านค้าออนไลน์", en: "Commerce" },
    description: { th: "สินค้า ตะกร้า ชำระเงิน ออเดอร์ ขนส่ง", en: "Products, cart, checkout, orders, shipping" },
    dependsOn: [],
    adminNav: [
      { key: "orders", label: { th: "ออเดอร์", en: "Orders" }, href: "/orders", icon: "ShoppingBag", badgeKey: "orders.pending" },
      { key: "products", label: { th: "สินค้า", en: "Products" }, href: "/products", icon: "Package" },
      { key: "discounts", label: { th: "คูปองและโปรโมชัน", en: "Discounts" }, href: "/discounts", icon: "Ticket" },
      { key: "shipping", label: { th: "การจัดส่ง", en: "Shipping" }, href: "/shipping", icon: "Truck" },
      { key: "reviews", label: { th: "รีวิว", en: "Reviews" }, href: "/reviews", icon: "Star" },
    ],
    storefrontRoutes: ["/products", "/collections", "/cart", "/checkout", "/orders"],
    permissions: ["commerce.products.write", "commerce.orders.write", "commerce.orders.refund", "commerce.settings.write"],
    quotas: { products: 50, ordersPerMonth: 300 },
  },
  booking: {
    key: "booking",
    name: { th: "จองคิว / นัดหมาย", en: "Booking" },
    description: { th: "บริการ พนักงาน ตารางเวลา การจอง มัดจำ เตือนนัด", en: "Services, staff, schedules, bookings, deposits, reminders" },
    dependsOn: [],
    adminNav: [
      { key: "calendar", label: { th: "ปฏิทินการจอง", en: "Calendar" }, href: "/bookings", icon: "CalendarDays", badgeKey: "bookings.today" },
      { key: "services", label: { th: "บริการ", en: "Services" }, href: "/services", icon: "Sparkles" },
      { key: "staff", label: { th: "พนักงาน / ทรัพยากร", en: "Staff" }, href: "/staff", icon: "Users" },
    ],
    storefrontRoutes: ["/book", "/services", "/staff"],
    permissions: ["booking.manage", "booking.services.write", "booking.staff.write"],
    quotas: { services: 30, staff: 3 },
  },
  topup: {
    key: "topup",
    name: { th: "เติมเกม / สินค้าดิจิทัล", en: "Game Top-up" },
    description: { th: "เกม แพ็กเกจ กระเป๋าเงิน สต็อกโค้ด supplier", en: "Games, packages, wallet, code stock, suppliers" },
    dependsOn: [],
    adminNav: [
      { key: "topup-orders", label: { th: "รายการเติม", en: "Top-up Orders" }, href: "/topup/orders", icon: "Zap", badgeKey: "topup.queue" },
      { key: "games", label: { th: "เกมและแพ็กเกจ", en: "Games" }, href: "/topup/games", icon: "Gamepad2" },
      { key: "wallets", label: { th: "กระเป๋าเงินลูกค้า", en: "Wallets" }, href: "/topup/wallets", icon: "Wallet" },
      { key: "suppliers", label: { th: "Supplier / สต็อก", en: "Suppliers" }, href: "/topup/suppliers", icon: "Boxes" },
      { key: "blacklist", label: { th: "บัญชีดำ", en: "Blacklist" }, href: "/topup/blacklist", icon: "Ban" },
    ],
    storefrontRoutes: ["/games", "/topup", "/wallet"],
    permissions: ["topup.manage", "topup.fulfill", "topup.wallet.adjust"],
    quotas: { games: 50 },
  },
  restaurant: {
    key: "restaurant",
    name: { th: "ร้านอาหาร", en: "Restaurant" },
    description: { th: "เมนู สั่งที่โต๊ะผ่าน QR ครัว รับกลับบ้าน จองโต๊ะ", en: "Menu, QR table ordering, kitchen display, pickup, reservations" },
    dependsOn: [],
    adminNav: [
      { key: "rest-orders", label: { th: "ออเดอร์ร้าน", en: "Orders" }, href: "/restaurant/orders", icon: "UtensilsCrossed", badgeKey: "restaurant.active" },
      { key: "kds", label: { th: "จอครัว (KDS)", en: "Kitchen" }, href: "/restaurant/kitchen", icon: "ChefHat" },
      { key: "menu", label: { th: "เมนู", en: "Menu" }, href: "/restaurant/menu", icon: "BookOpen" },
      { key: "tables", label: { th: "โต๊ะและ QR", en: "Tables" }, href: "/restaurant/tables", icon: "QrCode" },
      { key: "reservations", label: { th: "จองโต๊ะ", en: "Reservations" }, href: "/restaurant/reservations", icon: "CalendarCheck" },
    ],
    storefrontRoutes: ["/menu", "/t", "/order", "/reserve"],
    permissions: ["restaurant.manage", "restaurant.kitchen"],
    quotas: { menuItems: 200, tables: 30 },
  },
  clinic: {
    key: "clinic",
    name: { th: "คลินิก / เวชระเบียน", en: "Clinic" },
    description: { th: "ผู้ป่วย การมาตรวจ บันทึกการรักษา คอร์ส/แพ็กเกจ", en: "Patients, visits, treatment notes, packages" },
    dependsOn: ["booking"],
    adminNav: [
      { key: "patients", label: { th: "ผู้ป่วย", en: "Patients" }, href: "/clinic/patients", icon: "HeartPulse" },
      { key: "visits", label: { th: "การมาตรวจวันนี้", en: "Visits" }, href: "/clinic/visits", icon: "Stethoscope" },
      { key: "packages", label: { th: "คอร์ส / แพ็กเกจ", en: "Packages" }, href: "/clinic/packages", icon: "PackageCheck" },
    ],
    storefrontRoutes: ["/packages"],
    permissions: ["clinic.patients.read", "clinic.patients.write", "clinic.records.read", "clinic.records.write"],
    quotas: { patients: 2000 },
  },
  rental: {
    key: "rental",
    name: { th: "ที่พัก / ให้เช่า", en: "Rental & Stays" },
    description: { th: "ห้องพัก รถ อุปกรณ์ จองตามช่วงวัน", en: "Rooms, cars, equipment, date-range bookings" },
    dependsOn: [],
    adminNav: [{ key: "rentals", label: { th: "หน่วยให้เช่า", en: "Rentals" }, href: "/rentals", icon: "BedDouble" }],
    storefrontRoutes: ["/rooms", "/rentals"],
    permissions: ["rental.manage"],
    quotas: { units: 50 },
  },
  lms: {
    key: "lms",
    name: { th: "คอร์สเรียนออนไลน์", en: "Courses" },
    description: { th: "คอร์ส บทเรียน ผู้เรียน ใบรับรอง", en: "Courses, lessons, enrollments, certificates" },
    dependsOn: [],
    adminNav: [{ key: "courses", label: { th: "คอร์ส", en: "Courses" }, href: "/courses", icon: "GraduationCap" }],
    storefrontRoutes: ["/courses", "/learn"],
    permissions: ["lms.manage"],
    quotas: { courses: 20 },
  },
  membership: {
    key: "membership",
    name: { th: "สมาชิก", en: "Membership" },
    description: { th: "แพ็กเกจสมาชิก เนื้อหาเฉพาะสมาชิก บัตรดิจิทัล", en: "Membership plans, gated content, digital cards" },
    dependsOn: [],
    adminNav: [{ key: "memberships", label: { th: "สมาชิก", en: "Memberships" }, href: "/memberships", icon: "BadgeCheck" }],
    storefrontRoutes: ["/membership"],
    permissions: ["membership.manage"],
    quotas: {},
  },
  events: {
    key: "events",
    name: { th: "อีเวนต์ / บัตร", en: "Events & Tickets" },
    description: { th: "อีเวนต์ ประเภทบัตร e-ticket เช็กอิน", en: "Events, ticket types, e-tickets, check-in" },
    dependsOn: [],
    adminNav: [{ key: "events", label: { th: "อีเวนต์", en: "Events" }, href: "/events", icon: "Ticket" }],
    storefrontRoutes: ["/events"],
    permissions: ["events.manage"],
    quotas: { events: 20 },
  },
  listings: {
    key: "listings",
    name: { th: "ประกาศ / ทรัพย์", en: "Listings" },
    description: { th: "อสังหา รถ ไดเรกทอรี ฟิลเตอร์ สอบถาม", en: "Real estate, cars, directories, filters, inquiries" },
    dependsOn: [],
    adminNav: [{ key: "listings", label: { th: "ประกาศ", en: "Listings" }, href: "/listings", icon: "Building2" }],
    storefrontRoutes: ["/listings"],
    permissions: ["listings.manage"],
    quotas: { listings: 100 },
  },
  donation: {
    key: "donation",
    name: { th: "รับบริจาค", en: "Donations" },
    description: { th: "แคมเปญ บริจาคครั้งเดียว/รายเดือน ใบอนุโมทนา", en: "Campaigns, one-time/recurring donations, receipts" },
    dependsOn: [],
    adminNav: [{ key: "donations", label: { th: "แคมเปญบริจาค", en: "Campaigns" }, href: "/donations", icon: "HandHeart" }],
    storefrontRoutes: ["/donate"],
    permissions: ["donation.manage"],
    quotas: {},
  },
};

/** Expands dependencies and always includes cms. */
export function resolveModules(keys: string[]): ModuleKey[] {
  const out = new Set<ModuleKey>(["cms"]);
  const visit = (k: string) => {
    if (!(k in MODULES)) return;
    const key = k as ModuleKey;
    if (out.has(key)) return;
    out.add(key);
    for (const dep of MODULES[key].dependsOn) visit(dep);
  };
  keys.forEach(visit);
  return [...out];
}

export function isModuleKey(k: string): k is ModuleKey {
  return k in MODULES;
}
