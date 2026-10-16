import type { TemplateDefinition } from "@rentweb/core/tenant";
import { codeStock, games, gamePackages, topupBlacklist, topupSuppliers } from "@rentweb/db";
import { encryptToString } from "@rentweb/core/crypto";
import { section, hero, marquee, gameGrid, topupFeed, steps, features, faq, cta, stats, testimonials } from "@rentweb/storefront/definitions";
import { aboutPage, contactPage, legalPages, u, avatar } from "./shared";

export const topup: TemplateDefinition = {
  key: "topup",
  name: { th: "เว็บเติมเกม", en: "Game top-up store" },
  description: { th: "เติมเกมอัตโนมัติ 24 ชม. กระเป๋าเงิน แพ็กเกจราคาสมาชิก ตรวจสลิปอัตโนมัติ ธีมเกมมิ่งนีออน 3D", en: "24/7 automated game top-up with wallet, tier pricing, slip verification — neon 3D gaming theme" },
  category: "digital",
  siteType: "topup",
  modules: ["topup"],
  themePreset: "neon",
  recommendedPresets: ["neon", "studio", "midnight"],
  complexity: 4,
  previewImage: u("1542751371-adc38448a05e", 1200),
  settings: {
    tagline: "เติมเกมไว ราคาดี เปิดตลอด 24 ชั่วโมง",
    contact: { lineId: "@gamehub", facebook: "https://facebook.com", email: "support@gamehub.gg", hours: [{ day: "ทุกวัน", time: "24 ชั่วโมง (ระบบอัตโนมัติ)" }, { day: "แอดมิน", time: "09:00 – 02:00" }] },
    header: { cta: { label: "เติมเงินเข้ากระเป๋า", href: "/wallet" } },
    payments: {
      promptpayId: "0899998888",
      promptpayName: "GameHub",
      bankAccounts: [{ bank: "กรุงไทย", name: "GameHub Co., Ltd.", number: "111-2-33333-4" }],
      enabled: { promptpay: true, bankTransfer: true, wallet: true },
    },
  },
  moduleConfig: { topup: { walletEnabled: true, walletBonusPercent: 2, minWalletTopup: 2000, otpRequiredFirstOrder: true, maxOrdersPerHour: 10 } },
  navigation: {
    header: [
      { label: "เติมเกม", href: "/games" },
      { label: "กระเป๋าเงิน", href: "/wallet" },
      { label: "ตรวจสอบสถานะ", href: "/topup/status" },
      { label: "วิธีเติม", href: "/how-to" },
      { label: "ติดต่อ", href: "/contact" },
    ],
    footer: [
      { label: "เติมเกม", href: "/games" },
      { label: "กระเป๋าเงิน", href: "/wallet" },
      { label: "ตรวจสอบสถานะ", href: "/topup/status" },
      { label: "ช่วยเหลือ", href: "#", children: [{ label: "วิธีเติม", href: "/how-to" }, { label: "ติดต่อแอดมิน", href: "/contact" }] },
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
          eyebrow: "ระบบอัตโนมัติ 24 ชม.",
          heading: "เติมเกมไว ภายใน 10 วินาที",
          subheading: "RoV · Free Fire · Genshin · Valorant · PUBG และอีก 40+ เกม ราคาถูกกว่าเติมตรง จ่ายผ่าน PromptPay หรือกระเป๋าเงินในเว็บ",
          primaryCta: { label: "เลือกเกมที่จะเติม", href: "/games" },
          secondaryCta: { label: "เติมเงินกระเป๋า +2%", href: "/wallet" },
          image: { url: "", alt: "" },
          background: "theme",
          badges: ["ตรวจสลิปอัตโนมัติ", "คืนเงิน 100% ถ้าเติมไม่สำเร็จ", "ราคาสมาชิกถูกกว่า"],
          stats: [{ value: "1.2M+", label: "รายการเติมสำเร็จ" }, { value: "10 วิ", label: "เวลาเติมเฉลี่ย" }, { value: "4.9/5", label: "คะแนนจากผู้ใช้" }],
        }),
        section(marquee, { items: ["RoV", "FREE FIRE", "GENSHIN IMPACT", "VALORANT", "PUBG MOBILE", "ROBLOX", "HONKAI STAR RAIL", "MOBILE LEGENDS", "STEAM WALLET"], style: "outline", speed: 22, separator: "◆" }),
        section(topupFeed, { heading: "เติมล่าสุด (สด)", limit: 8 }),
        section(gameGrid, { heading: "เลือกเกมที่ต้องการเติม", subheading: "กด เลือกแพ็กเกจ กรอก UID แล้วจ่ายเงิน ระบบเติมให้อัตโนมัติ", showSearch: true, variant: "tiles" }),
        section(steps, {
          eyebrow: "ใช้งานง่าย",
          heading: "เติมเกมใน 3 ขั้นตอน",
          variant: "cards",
          items: [
            { title: "เลือกเกมและแพ็กเกจ", description: "กรอก UID / Server ให้ถูกต้อง ระบบจะตรวจสอบชื่อตัวละครให้", icon: "Gamepad2" },
            { title: "ชำระเงิน", description: "PromptPay QR, แนบสลิป, หรือตัดจากกระเป๋าเงินในเว็บ (ได้โบนัส 2%)", icon: "QrCode" },
            { title: "รับของทันที", description: "ระบบเติมอัตโนมัติภายใน 10 วินาที แจ้งเตือนผ่าน LINE เมื่อสำเร็จ", icon: "Zap" },
          ],
        }),
        section(features, {
          variant: "bento",
          eyebrow: "ทำไมต้อง GameHub",
          heading: "เติมที่นี่ สบายใจกว่า",
          items: [
            { icon: "ShieldCheck", title: "ปลอดภัย ไม่ต้องให้รหัสผ่าน", description: "เติมผ่าน UID เท่านั้น ไม่มีการล็อกอินแทน บัญชีไม่โดนแบน", image: u("1538481199705-c710c4e965fc", 1200) },
            { icon: "BadgePercent", title: "ราคาสมาชิก 3 ระดับ", description: "ยิ่งเติมสะสมมาก ยิ่งได้ราคาถูก สูงสุดลด 8%", image: u("1511512578047-dfb367046420", 1000) },
            { icon: "RotateCcw", title: "คืนเงิน 100%", description: "ถ้าเติมไม่สำเร็จ ระบบคืนเข้ากระเป๋าทันที" },
            { icon: "Headset", title: "แอดมินตอบไว", description: "LINE ตอบภายใน 5 นาที 09:00–02:00" },
            { icon: "History", title: "ตรวจสอบย้อนหลังได้", description: "ประวัติทุกรายการ พร้อมหลักฐานการเติม" },
          ],
        }),
        section(stats, { variant: "cards", items: [{ value: 1200000, suffix: "+", label: "รายการสำเร็จ" }, { value: 48, suffix: " เกม", label: "รองรับ" }, { value: 99.8, suffix: "%", label: "อัตราสำเร็จ" }, { value: 24, suffix: " ชม.", label: "เปิดบริการ" }] }),
        section(testimonials, {
          heading: "ผู้เล่นพูดถึงเรา",
          variant: "cards",
          items: [
            { quote: "เติม RoV ตอนตี 2 ก็เข้าภายในไม่ถึงนาที ถูกกว่าเติมในเกมด้วย", name: "KaiZen", role: "ผู้เล่น RoV", avatar: avatar("kaizen"), rating: 5 },
            { quote: "ใช้กระเป๋าเงินได้โบนัสเพิ่ม เติมบ่อย ๆ คุ้มมาก", name: "Mintra", role: "Genshin Impact", avatar: avatar("mintra"), rating: 5 },
            { quote: "เคยเติมไม่เข้า 1 ครั้ง ระบบคืนเงินเข้ากระเป๋าเองเลย ไม่ต้องทักแอดมิน", name: "Boss_FF", role: "Free Fire", avatar: avatar("boss"), rating: 5 },
          ],
        }),
        section(faq, {
          heading: "คำถามที่พบบ่อย",
          layout: "two-column",
          items: [
            { q: "ต้องให้รหัสผ่านไหม?", a: "ไม่ต้องครับ ใช้แค่ UID (และ Server/Zone สำหรับบางเกม) เราไม่มีการล็อกอินเข้าบัญชีของคุณ" },
            { q: "ใช้เวลานานแค่ไหน?", a: "แพ็กเกจที่เป็นระบบอัตโนมัติเข้าภายใน 10–60 วินาที แพ็กเกจเติมมือใช้เวลา 5–30 นาที (แสดงไว้ที่แพ็กเกจ)" },
            { q: "เติมไม่เข้าทำอย่างไร?", a: "ระบบจะคืนเงินเข้ากระเป๋าอัตโนมัติ หากไม่ได้รับภายใน 30 นาที ทัก LINE พร้อมเลขที่รายการ" },
            { q: "เงินในกระเป๋าถอนได้ไหม?", a: "กระเป๋าเงินใช้สำหรับเติมเกมในเว็บนี้เท่านั้น ไม่สามารถถอนเป็นเงินสดได้" },
          ],
        }),
        section(cta, { variant: "glow", heading: "พร้อมแรงค์ขึ้นแล้วหรือยัง?", body: "เติมครั้งแรกวันนี้ รับโบนัสกระเป๋าเงิน 5%", primaryCta: { label: "เริ่มเติมเกม", href: "/games" } }),
      ],
    },
    {
      slug: "how-to",
      title: "วิธีเติม",
      sections: [
        section(steps, {
          heading: "วิธีเติมเกมกับ GameHub",
          variant: "vertical",
          items: [
            { title: "สมัคร/เข้าสู่ระบบด้วยเบอร์โทร", description: "ใส่เบอร์ รับ OTP ครั้งเดียว ครั้งต่อไปจำอุปกรณ์ให้" },
            { title: "เลือกเกม → แพ็กเกจ → กรอก UID", description: "ตรวจสอบชื่อตัวละครที่ระบบดึงมาแสดงให้ถูกต้องก่อนกดจ่าย" },
            { title: "ชำระเงิน", description: "สแกน PromptPay แล้วระบบตรวจสลิปอัตโนมัติ หรือตัดจากกระเป๋าเงิน" },
            { title: "รับของและเช็กประวัติ", description: "ดูสถานะได้ที่หน้า ตรวจสอบสถานะ และในบัญชีของคุณ" },
          ],
        }),
      ],
    },
    aboutPage({ heading: "GameHub — ร้านเติมเกมที่ผู้เล่นสร้างให้ผู้เล่น", body: "เราเริ่มจากกลุ่มเพื่อนที่เบื่อการเติมเกมช้าและราคาแพง จึงสร้างระบบเติมอัตโนมัติที่เชื่อมกับผู้ให้บริการโดยตรง ปัจจุบันให้บริการมากกว่า 1.2 ล้านรายการ โดยยึดหลัก ไม่ขอรหัสผ่าน คืนเงินทันทีเมื่อไม่สำเร็จ และโปร่งใสทุกรายการ" }),
    contactPage({ heading: "ติดต่อแอดมิน", body: "ปัญหาการเติม ส่งเลขที่รายการมาทาง LINE แอดมินตอบภายใน 5 นาที (09:00–02:00)" }),
    ...legalPages("GameHub"),
  ],
  async seed(tx, tenantId) {
    const [manual] = await tx
      .insert(topupSuppliers)
      .values({ tenantId, name: "เติมมือโดยแอดมิน", provider: "manual", config: {} })
      .returning({ id: topupSuppliers.id });

    const defs = [
      { name: "RoV (Arena of Valor)", slug: "rov", publisher: "Garena", img: u("1542751371-adc38448a05e", 600), cat: "mobile", fields: [{ key: "uid", label: "Open ID / UID", type: "text", required: true, placeholder: "เช่น 123456789" }], pk: [["40 คูปอง", 3500, 3300], ["120 คูปอง", 9900, 9500], ["240 คูปอง", 19900, 19000], ["500 คูปอง", 38900, 37000], ["1,200 คูปอง", 89900, 86000]] },
      { name: "Free Fire", slug: "free-fire", publisher: "Garena", img: u("1511512578047-dfb367046420", 600), cat: "mobile", fields: [{ key: "uid", label: "Player ID", type: "text", required: true }], pk: [["100 เพชร", 3300, 3100], ["310 เพชร", 9500, 9100], ["520 เพชร", 15900, 15200], ["1,060 เพชร", 31900, 30500], ["2,180 เพชร", 63900, 61000]] },
      { name: "Genshin Impact", slug: "genshin", publisher: "HoYoverse", img: u("1538481199705-c710c4e965fc", 600), cat: "mobile", fields: [{ key: "uid", label: "UID", type: "text", required: true }, { key: "server", label: "Server", type: "select", required: true, options: ["Asia", "America", "Europe", "TW/HK/MO"] }], pk: [["60 Genesis Crystals", 3500, 3300], ["330 Genesis Crystals", 17500, 16800], ["1,090 Genesis Crystals", 52900, 50500], ["Blessing of the Welkin Moon", 17500, 16500]] },
      { name: "Valorant", slug: "valorant", publisher: "Riot Games", img: u("1552820728-8b83bb6b773f", 600), cat: "pc", fields: [{ key: "riotid", label: "Riot ID#Tag", type: "text", required: true, placeholder: "Name#TAG" }], pk: [["420 VP", 11500, 11000], ["1,000 VP", 26900, 25900], ["2,100 VP", 53900, 52000]] },
      { name: "PUBG Mobile", slug: "pubg-mobile", publisher: "Tencent", img: u("1593305841991-05c297ba4575", 600), cat: "mobile", fields: [{ key: "uid", label: "Character ID", type: "text", required: true }], pk: [["60 UC", 3500, 3300], ["325 UC", 17500, 16800], ["660 UC", 34900, 33500]] },
      { name: "Roblox", slug: "roblox", publisher: "Roblox", img: u("1612287230202-1ff1d85d1bdf", 600), cat: "voucher", fields: [{ key: "username", label: "Username", type: "text", required: true }], pk: [["400 Robux", 17900, 17200], ["800 Robux", 34900, 33500], ["1,700 Robux", 69900, 67000]] },
      { name: "Mobile Legends", slug: "mlbb", publisher: "Moonton", img: u("1580327344181-c1163234e5a0", 600), cat: "mobile", fields: [{ key: "uid", label: "User ID", type: "text", required: true }, { key: "zone", label: "Zone ID", type: "text", required: true }], pk: [["86 Diamonds", 5500, 5200], ["172 Diamonds", 10900, 10400], ["257 Diamonds", 15900, 15200], ["706 Diamonds", 42900, 41000]] },
      { name: "Steam Wallet (TH)", slug: "steam-wallet", publisher: "Valve", img: u("1550745165-9bc0b252726f", 600), cat: "voucher", fields: [{ key: "contact", label: "LINE ID / อีเมลสำหรับรับโค้ด", type: "text", required: true }], pk: [["฿100", 10900, 10500], ["฿300", 31900, 30900], ["฿500", 52900, 51000], ["฿1,000", 104900, 101500]] },
    ] as const;

    const instructions: Record<string, string> = {
      rov: "เปิดเกม RoV → แตะรูปโปรไฟล์มุมซ้ายบน → ดูเลข Open ID ใต้ชื่อตัวละคร → แตะเพื่อคัดลอก",
      "free-fire": "เปิดเกม → แตะโปรไฟล์มุมซ้ายบน → Player ID อยู่ใต้ชื่อ (ตัวเลข 9–12 หลัก)",
      genshin: "เปิดเมนู Paimon → มุมล่างซ้ายจะแสดง UID 9 หลัก → เลือก Server ให้ตรงกับที่เล่น",
      valorant: "เปิด Riot Client → มุมขวาบนคลิกชื่อ → คัดลอก Riot ID พร้อม #Tag เช่น Player#TH1",
      "pubg-mobile": "เปิดเกม → แตะโปรไฟล์ → Character ID อยู่ใต้ชื่อตัวละคร",
      roblox: "ใช้ Username ที่ใช้ล็อกอิน (ไม่ใช่ Display name) ตรวจสอบตัวพิมพ์เล็ก-ใหญ่ให้ถูกต้อง",
      mlbb: "เปิดเกม → แตะโปรไฟล์ → จะเห็น User ID (Zone ID) เช่น 12345678 (1234) กรอกแยกช่อง",
      "steam-wallet": "ไม่ต้องใช้ ID เกม ระบบจะส่งโค้ด Steam Wallet ให้ที่หน้ารายการ และช่องทางติดต่อที่กรอก",
    };

    for (const [i, d] of defs.entries()) {
      const [g] = await tx
        .insert(games)
        .values({
          tenantId,
          name: d.name,
          slug: d.slug,
          publisher: d.publisher,
          image: d.img,
          banner: d.img,
          fields: d.fields as any,
          category: d.cat,
          featured: i < 4,
          sort: i,
          description: `เติม ${d.name} ราคาถูก ${d.cat === "voucher" ? "รับโค้ดทันทีหลังชำระเงิน" : "เข้าภายในไม่กี่วินาที"} ปลอดภัย ไม่ต้องให้รหัสผ่าน`,
          instructions: instructions[d.slug] ?? "เปิดเกม → โปรไฟล์ → คัดลอก ID",
        })
        .returning({ id: games.id });
      const pkgs = await tx
        .insert(gamePackages)
        .values(
          d.pk.map(([name, price, cost], j) => ({
            tenantId,
            gameId: g!.id,
            name,
            price,
            costPrice: cost,
            tierPrices: { vip: Math.round(price * 0.98), agent: Math.round(price * 0.95) },
            fulfillment: d.cat === "voucher" ? "stock" : j % 2 === 0 ? "api" : "manual",
            supplierId: manual!.id,
            estimatedMinutes: j % 2 === 0 ? 1 : 15,
            badge: j === 1 ? "ขายดี" : j === d.pk.length - 1 ? "คุ้มสุด" : null,
            sort: j,
          })),
        )
        .returning({ id: gamePackages.id, name: gamePackages.name });

      // demo code stock: ~5 encrypted Steam Wallet codes per package (Roblox stays empty to show the sold-out state)
      if (d.slug === "steam-wallet") {
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const seg = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
        await tx.insert(codeStock).values(
          pkgs.flatMap((p) =>
            Array.from({ length: 5 }, (_, n) => ({
              tenantId,
              packageId: p.id,
              codeEncrypted: encryptToString(`STEAM-${seg()}-${seg()}-${seg()}`),
              serial: `SW${p.name.replace(/[^0-9]/g, "")}-${String(n + 1).padStart(3, "0")}`,
              addedBy: "seed",
            })),
          ),
        );
      }
    }

    await tx.insert(topupBlacklist).values({ tenantId, kind: "phone", value: "0800000000", reason: "ตัวอย่าง: แจ้งโกงซ้ำหลายครั้ง (เบอร์ทดสอบ)", createdBy: "seed" });
  },
};
