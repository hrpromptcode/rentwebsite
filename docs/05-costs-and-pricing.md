# 05 — ค่าใช้จ่าย โดเมน และการตั้งราคาเช่า

> ตอบคำถาม: ต้องจ่ายอะไรบ้าง เท่าไร ในแต่ละช่วง, โดเมนราคาเท่าไรและใครจ่าย, ค่าบริการที่ผันแปรตามการใช้งาน, ควรตั้งราคาเช่าเท่าไร, คุ้มทุนเมื่อไร
>
> **สมมติฐาน**: อัตราแลกเปลี่ยน **฿34/USD**, ราคา ณ ต.ค. 2026 จากหน้าราคาผู้ให้บริการและบทความที่ค้นได้ (แหล่งอ้างอิงท้ายไฟล์), ราคาต่างประเทศ **ยังไม่รวม VAT 7%** ที่อาจถูกเรียกเก็บ, ตัวเลขเป็นช่วงประมาณเพื่อวางงบ — **ตรวจราคาจริงก่อนจ่ายทุกครั้ง**

## 1. ค่าโดเมน

### 1.1 ราคาต่อปีตาม TLD

| TLD | ราคาประมาณ/ปี | เงื่อนไขการจด | หมายเหตุ |
|---|---|---|---|
| **.com** | ที่ registrar ราคาทุน (Cloudflare Registrar, Porkbun) ≈ **$10.5–12 ≈ ฿360–420**; registrar ไทย ฿400–600; GoDaddy ต่ออายุ $22.99 (เลี่ยง) | ไม่มี | ราคาส่งของ Verisign $10.26 → **$10.97 ตั้งแต่ 1 พ.ย. 2026** ราคาปลีกจะขยับตาม; ราคาปีแรกมักเป็นโปร ดูราคาต่ออายุเสมอ |
| **.co.th** | **฿800 + VAT = ฿856** (THNIC โดยตรง); ตัวแทน ฿750–1,000 | ต้องมี **หนังสือรับรองบริษัท** หรือเครื่องหมายการค้า และชื่อโดเมนต้องสอดคล้องกับชื่อนิติบุคคล | น่าเชื่อถือสำหรับตลาดไทย; THNIC มีโปร "จด 2 ปีจ่าย 1 ปี" เป็นช่วง ๆ |
| **.in.th** | ≈ **฿450** | บุคคลธรรมดาใช้บัตรประชาชน | ถูก ไม่ต้องมีบริษัท เหมาะเป็นโดเมนสำรอง/ร้านเล็ก |
| .th (ระดับสอง) | หลักพันบาทขึ้นไป | เงื่อนไขเฉพาะ | ไม่จำเป็น |
| .app / .dev / .shop / .store / .online / .co | $12–40 | ไม่มี | .app/.dev บังคับ HTTPS (ดีอยู่แล้ว) |
| .io / .ai | $35–100+ | | แพงและไม่จำเป็นสำหรับตลาดไทย |

### 1.2 โดเมนของแพลตฟอร์ม (คุณจ่าย)

| รายการ | ค่าใช้จ่าย/ปี |
|---|---|
| โดเมนหลัก 1 ตัว (.com หรือ .app) | ฿400–1,400 |
| ป้องกันแบรนด์: .co.th (เมื่อมีบริษัท) + .in.th | ฿1,300 |
| Wildcard subdomain `*.rentweb.app` | ฟรี (DNS record เดียว) |
| SSL ทุก subdomain และโดเมนลูกค้า | ฟรี (Let's Encrypt ผ่าน Vercel / Cloudflare) |
| **รวม** | **≈ ฿1,700–2,700/ปี** |

จองชื่อก่อนทำอย่างอื่น — subdomain ของลูกค้าทุกรายจะผูกกับชื่อนี้ เปลี่ยนภายหลังเจ็บตัว

### 1.3 โดเมนของลูกค้า (ใครจ่าย อย่างไร)

| รูปแบบ | ข้อดี | ข้อเสีย | แนะนำ |
|---|---|---|---|
| **ลูกค้าซื้อเองแล้วชี้ CNAME มา** | โดเมนเป็นของลูกค้าจริง, คุณไม่ต้องดูแลต่ออายุ/WHOIS, ไม่มีต้นทุน | ลูกค้าไม่เก่งเทคนิค → ต้องมีคู่มือละเอียด + วิดีโอ + ปุ่ม "ตรวจสอบ DNS" | ✅ ค่าเริ่มต้น |
| แพลตฟอร์มขายโดเมนให้ (reseller API: Namecheap, ResellerClub, OpenProvider, Porkbun; .co.th ผ่าน THNIC reseller) | สะดวกลูกค้า, กำไร ฿100–300/โดเมน, ตั้ง DNS อัตโนมัติ | ต้องจัดการต่ออายุ, ข้อพิพาท, โดเมนหมดอายุ = เว็บล่ม, งานซัพพอร์ตเพิ่ม | เฟส 4 ขึ้นไป ราคาขาย ฿490–890/ปี |
| ค่า SSL/hostname เพิ่ม | Vercel: ฟรี (ตรวจ limit จำนวนโดเมนต่อโปรเจกต์กับ Vercel ก่อน) · Cloudflare for SaaS: 100 hostname แรกฟรี ถัดไป **$0.10/hostname/เดือน** | | 1,000 โดเมนลูกค้า ≈ $90/เดือน ถ้าผ่าน Cloudflare for SaaS |

อีเมลบนโดเมนลูกค้า (เช่น contact@ร้าน.com) ไม่อยู่ในบริการ — แนะนำ Google Workspace (≈ ฿250/ผู้ใช้/เดือน) หรือ Zoho Mail (ฟรี–ถูก)

## 2. ค่าโครงสร้างพื้นฐานรายเดือน แยก 3 ช่วง

### ช่วง A — พัฒนาและเปิด beta (0–10 ร้าน)

| รายการ | แผน | USD/เดือน | THB/เดือน |
|---|---|---|---|
| Vercel | Hobby ระหว่างพัฒนา (**ห้ามใช้เชิงพาณิชย์**) → Pro 1 seat ทันทีที่มีลูกค้า | 0 → 20 | 0 → 680 |
| Supabase | Free ระหว่างพัฒนา (หยุดเองหลังไม่ใช้งาน 7 วัน) → Pro เมื่อเปิดจริง (รวมเครดิต compute $10 = Micro) | 0 → 25 | 0 → 850 |
| Upstash Redis | Free | 0 | 0 |
| Cloudflare (DNS, CDN, WAF, for SaaS 100 hostname) | Free | 0 | 0 |
| Cloudflare R2 | Free 10 GB | 0 | 0 |
| Resend | Free 3,000 อีเมล/เดือน (100/วัน) | 0 | 0 |
| Sentry / PostHog | Free tier | 0 | 0 |
| งานเบื้องหลัง | Inngest free หรือ Vercel Cron | 0–5 | 0–170 |
| โดเมนแพลตฟอร์ม (เฉลี่ยต่อเดือน) | | ~1 | ~40 |
| **รวม** | | **$1 → ~$51** | **฿40 → ~฿1,750** |

### ช่วง B — 50–100 ร้านที่จ่ายเงิน

| รายการ | แผน | USD/เดือน | THB/เดือน |
|---|---|---|---|
| Vercel Pro | 1–2 seats ($20/seat) + usage; bandwidth ภายใน 1 TB ถ้ารูปอยู่ CDN อื่น | 40–80 | 1,360–2,720 |
| Supabase Pro | $25 + compute Small/Medium ($15–60) + storage/egress เพิ่ม | 50–100 | 1,700–3,400 |
| Upstash Redis | pay-as-you-go / fixed | 10–20 | 340–680 |
| Cloudflare R2 | 100–300 GB รูป, egress ฟรี | 2–5 | 70–170 |
| Resend Pro | 50,000 อีเมล | 20 | 680 |
| Sentry Team | | 26 | 884 |
| งานเบื้องหลัง | Inngest/Trigger.dev หรือ worker บน Railway | 10–25 | 340–850 |
| Logs/Uptime | Better Stack / Axiom | 0–25 | 0–850 |
| Cloudflare for SaaS | เฉพาะเมื่อโดเมนลูกค้า > 100 | 0–5 | 0–170 |
| ตรวจสลิปอัตโนมัติ (ถ้ารวมในแพ็กเกจและคุณจ่ายแทน) | | 10–30 | 340–1,020 |
| **รวม** | | **≈ $170–335** | **≈ ฿5,800–11,400** |
| **ต่อร้าน (ที่ 100 ร้าน)** | | | **≈ ฿60–115/ร้าน/เดือน** |

### ช่วง C — 500–1,000 ร้าน

| รายการ | แผน | USD/เดือน | THB/เดือน |
|---|---|---|---|
| Vercel Pro + usage | bandwidth เกิน 1 TB ($0.15/GB), function/edge requests, compute | 250–700 | 8,500–23,800 |
| Supabase | compute Large/XL ($110–210) + PITR ($100) + read replica + storage | 300–600 | 10,200–20,400 |
| Upstash | | 50–100 | 1,700–3,400 |
| R2 | 1–3 TB | 15–45 | 510–1,530 |
| Resend Scale | | 90–200 | 3,060–6,800 |
| Sentry Business | | 80–100 | 2,720–3,400 |
| งานเบื้องหลัง | | 50–150 | 1,700–5,100 |
| Logs/Uptime | | 50–100 | 1,700–3,400 |
| Cloudflare Pro zone + for SaaS (300 hostname) | | 50 | 1,700 |
| เครื่องมือซัพพอร์ต/status page | | 30–50 | 1,020–1,700 |
| **รวม** | | **≈ $965–2,095** | **≈ ฿33,000–71,000** |
| **ต่อร้าน (ที่ 1,000 ร้าน)** | | | **≈ ฿33–71/ร้าน/เดือน** |

ช่วง C คือจุดที่ควรย้าย `web`/`worker` ออกจาก Vercel ไป container (ดูข้อ 3) ซึ่งลดบรรทัดแรกลงเหลือ ~$100–250

## 3. ทางเลือก self-host (เปรียบเทียบที่ช่วง B)

| รายการ | ราคา | USD/เดือน |
|---|---|---|
| VPS 4 vCPU / 8 GB × 2 (app + worker) — Hetzner CPX/DigitalOcean/Vultr (หลังการขึ้นราคาของ Hetzner ปี 2026 ช่องว่างราคาแคบลง) | $25–50/เครื่อง | 50–100 |
| ฐานข้อมูล: Supabase Pro (คง) หรือ DigitalOcean Managed Postgres 2 GB หรือ Postgres บน VPS 8 GB + backup | | 25–60 |
| Backup ไป R2/S3 | | 5 |
| Cloudflare Free + for SaaS, Coolify/Dokploy (ฟรี) | | 0 |
| Resend, Sentry, Upstash (คง) | | 56–66 |
| **รวม** | | **≈ $135–230 ≈ ฿4,600–7,800** |

ประหยัดกว่า PaaS ไม่มากในช่วง B (เพราะ DB/อีเมล/monitoring ยังจ่ายเหมือนเดิม) แต่ **ช่วง C ประหยัด 40–60%** แลกกับเวลาดูแลระบบ 4–8 ชม./เดือน และความเสี่ยงเมื่อเครื่องล่มกลางคืน

AWS กรุงเทพฯ (ap-southeast-7) สำหรับลูกค้าที่ต้องการข้อมูลในประเทศ: EC2 t3.micro ≈ $0.012/ชม. (≈ $9/เดือน), t3.medium ≈ $35/เดือน, RDS เล็กสุด ≈ $30–60/เดือน, egress $0.12/GB — แพงกว่า VPS 2–3 เท่า ใช้เฉพาะแพ็กเกจ Enterprise

## 4. ค่าบริการที่ผันแปรตามการใช้งาน (และใครควรจ่าย)

| รายการ | ราคา (ต.ค. 2026) | ใครจ่าย |
|---|---|---|
| **Payment gateway** (บัญชีของร้าน) | Opn: บัตร **3.65%**, PromptPay **1.65%** (+VAT) · Pay Solutions: บัตร 3%, PromptPay 1% · Xendit: บัตร 3.2% + ฿10, QR 0.8–1.65% · Stripe ไทย: บัตรในประเทศ 3.65% + ฿10, ต่างประเทศ 4.75% + ฿10, PromptPay 1.65% · ธนาคารโดยตรง MDR 2.5–3.5% + ค่าแรกเข้า/รายปี | **ร้านค้า** (หักจากยอดขายของร้าน) |
| ตรวจสลิปอัตโนมัติ (SlipOK, EasySlip ฯลฯ) | ≈ ฿0.2–1/สลิป หรือแพ็กเกจรายเดือนหลักร้อยบาท | ร้าน หรือรวมโควต้าในแพ็กเกจ Pro (300 สลิป/เดือน) |
| **LINE Official Account (ไทย)** | Free 300 ข้อความ broadcast/เดือน · Basic **฿1,280** (15,000 ข้อความ) · Pro **฿1,780** (35,000 ข้อความ) +VAT · ข้อความตอบกลับ (reply) ไม่นับ · ข้อความเกินมีค่าใช้จ่ายเพิ่ม | ร้านค้า (LINE OA ของร้าน) — ร้านเล็กใช้ Free พอ เพราะแจ้งเตือนออเดอร์ส่วนใหญ่เป็น push 1:1 ซึ่งนับเป็นข้อความ |
| SMS (OTP, เตือนนัด) | ≈ ฿0.15/ข้อความที่ปริมาณสูง; ร้านเล็ก ≈ ฿0.3–0.6 | ร้าน (คิดตามใช้) หรือรวมโควต้า; ผลักให้ใช้ LINE แทนเพราะถูกกว่า |
| อีเมลธุรกรรม | Resend $20/50,000 (≈ ฿0.014/ฉบับ) | แพลตฟอร์ม |
| ขนส่ง | ตามจริง + ค่าธรรมเนียม aggregator | ร้าน |
| Supplier เติมเกม | ราคาทุนต่อแพ็กเกจ, เติมเงินล่วงหน้ากับ supplier | ร้าน |
| แผนที่ | Google Maps embed ฟรี / Longdo Map / OpenStreetMap | แพลตฟอร์ม |
| **ค่าธรรมเนียมรับค่าเช่าของคุณ** | Stripe ไทย 3.65% + ฿10 (บัตร) / PromptPay ผ่าน Opn 1.65% | คุณ (≈ 2–4% ของรายได้) |

หลักการ: **ค่าใช้จ่ายที่แปรตามยอดขายของร้าน ให้ร้านจ่ายผ่านบัญชีของร้านเอง** → ต้นทุนแพลตฟอร์มของคุณคงที่และคาดเดาได้

## 5. ค่าใช้จ่ายครั้งเดียวและค่าแรงพัฒนา

| รายการ | ประมาณ |
|---|---|
| จดบริษัท (ค่าธรรมเนียมราชการ + บริการ) | ฿10,000–20,000 |
| ทะเบียนพาณิชย์อิเล็กทรอนิกส์ | ฿50 |
| เอกสารกฎหมาย: ToS + Privacy + DPA + SLA (ทนายร่าง) | ฿15,000–50,000 (ร่างเองแล้วให้ทนายรีวิว ฿5,000–15,000) |
| เครื่องหมายการค้า (ถ้าต้องการ .co.th โดยไม่มีบริษัท / ป้องกันแบรนด์) | ฿1,000–8,000 ต่อจำพวก + ค่าบริการ |
| โลโก้/แบรนด์/ธีมตั้งต้นจากนักออกแบบ | ฿5,000–50,000 |
| ฟอนต์ไทย | ฟรี (Google Fonts) |
| เครื่องมือ: GitHub (ฟรี–$4/คน), AI coding assistant ($20–200/คน), Figma (ฟรี–$15) | ฿0–7,000/เดือน |
| บัญชี sandbox ของ Opn/Stripe/LINE Developers | ฟรี |

ค่าแรงพัฒนา (ตัวเลขตลาดไทยโดยประมาณ ปี 2026):

| ทางเลือก | ค่าใช้จ่ายถึงจบเฟส 3 (≈ 34–42 person-week) |
|---|---|
| ทำเอง | ค่าเสียโอกาส 9–11 เดือน |
| จ้าง dev ระดับกลาง ฿50,000–90,000/เดือน × 1 คน + คุณ | ฿250,000–500,000 (5 เดือน) |
| จ้าง senior ฿90,000–180,000/เดือน × 1 คน + คุณ | ฿450,000–900,000 |
| ฟรีแลนซ์รายโมดูล | ฿80,000–250,000/โมดูล |
| เอเจนซี่ทำ MVP (เฟส 0–1) | ฿800,000–3,000,000+ และต้องมีคนในต่อยอด |

## 6. โมเดลราคาเช่าที่แนะนำ

| แพ็กเกจ | ราคา | สิ่งที่ได้ |
|---|---|---|
| **ทดลอง** 14 วัน | ฿0 (ไม่ต้องใส่บัตร) | ทุกฟีเจอร์ของ Pro, subdomain, แบนเนอร์ "ทดลองใช้", `noindex` |
| **Starter** | **฿390/เดือน** หรือ ฿3,900/ปี | subdomain, 1 เทมเพลต, 1 โมดูลธุรกิจ, 50 สินค้า/บริการ, 1 ผู้ใช้, 1 GB, รับเงินโอน/สลิป + PromptPay, แจ้งเตือนอีเมล, "Powered by RentWeb" |
| **Pro** ⭐ | **฿990/เดือน** หรือ ฿9,900/ปี | โดเมนส่วนตัว, ทุกโมดูลในกลุ่มธุรกิจ, 1,000 รายการ, 5 ผู้ใช้, 10 GB, LINE แจ้งเตือน + LINE Login, ตรวจสลิปอัตโนมัติ 300 ใบ/เดือน, คูปอง/รีวิว/บล็อก, ไม่มี Powered by, รายงาน |
| **Business** | **฿2,490/เดือน** หรือ ฿24,900/ปี | หลายสาขา, ไม่จำกัดรายการ, 15 ผู้ใช้, 50 GB, Custom CSS, API/webhooks, broadcast LINE/อีเมล, รายงานขั้นสูง, ซัพพอร์ตด่วน, ตรวจสลิปไม่จำกัด |
| **Enterprise** | ฿8,000+/เดือน (เสนอราคา) | DB/region แยก (กรุงเทพฯ), SLA 99.95%, SSO, ธีมออกแบบเฉพาะ, DPA เฉพาะ, อบรม |

บริการเสริม (รายได้เพิ่มที่ margin สูง):

| บริการ | ราคา |
|---|---|
| ตั้งค่าร้านให้ (ใส่สินค้า/บริการ, โลโก้, โดเมน, LINE) | ฿2,900–9,900 ครั้งเดียว |
| ธีมพรีเมียม | ฿990–2,990 ครั้งเดียว |
| โดเมน (.com/.in.th/.co.th) ผ่านแพลตฟอร์ม | ฿490–890/ปี (เฟส 4) |
| ผู้ใช้เพิ่ม | ฿99/คน/เดือน |
| แพ็ก SMS | ตามจริง + 20% |
| ย้ายข้อมูลจากระบบเดิม | ฿5,000+ |
| ถ่ายภาพสินค้า/เขียนคอนเทนต์ (พาร์ตเนอร์) | ส่วนแบ่ง 20–30% |

ตำแหน่งในตลาด (ตัวเลขคู่แข่งเป็นค่าประมาณ ตรวจสอบก่อนใช้สื่อสาร): ถูกกว่า Shopify (≈ $29–39/เดือน + ค่าธรรมเนียม) · เฉพาะทางกว่า Wix/Squarespace (ไม่มีจองคิว/คลินิก/เติมเกมแบบไทย) · ครอบคลุมธุรกิจบริการที่เว็บสำเร็จรูปไทย (LnwShop, Page365, MakeWebEasy, Ketshopweb ช่วง ฿0–3,000/เดือน) เน้นเฉพาะร้านค้า · จุดขาย: **LINE + PromptPay + สลิป + ภาษาไทย + ประเภทธุรกิจครบ ในราคาหลักร้อย**

**ไม่แนะนำ** เก็บ % ต่อรายการขายในปีแรก: ต้องเห็นเงินทุกรายการ (ซึ่งเราออกแบบให้ไม่ผ่านมือเรา) และร้านไทยต่อต้านค่าธรรมเนียมต่อยอดขายมาก

## 7. Unit economics และจุดคุ้มทุน

สมมติ ARPU ฿800/เดือน (ส่วนผสม Starter 40% / Pro 50% / Business 10%), ค่าธรรมเนียมรับเงิน 3%, churn 3–4%/เดือน

| ร้านที่จ่ายเงิน | รายได้สุทธิ/เดือน | ค่า infra/เดือน | infra ต่อร้าน | กำไรขั้นต้นก่อนค่าแรง |
|---|---|---|---|---|
| 10 | ฿7,760 | ฿1,750 | ฿175 | ฿6,000 |
| 50 | ฿38,800 | ฿6,000 | ฿120 | ฿32,800 |
| 100 | ฿77,600 | ฿9,000 | ฿90 | ฿68,600 |
| 300 | ฿232,800 | ฿20,000 | ฿67 | ฿212,800 |
| 1,000 | ฿776,000 | ฿55,000 | ฿55 | ฿721,000 |

- คุ้มค่า infra ตั้งแต่ **~3 ร้าน**
- คุ้มเงินเดือน dev 1 คน (฿70,000) + infra ที่ **~100 ร้าน**
- คุ้มทีม 3 คน + การตลาด (฿250,000/เดือน) ที่ **~350 ร้าน**
- ที่ churn 3.5%/เดือน ต้องหาลูกค้าใหม่ ≈ 3.5% ของฐานทุกเดือนแค่เพื่อคงที่ → การตลาดและ onboarding สำคัญเท่าโค้ด
- ค่าใช้จ่ายได้ลูกค้า (CAC) ที่ยอมรับได้ ≈ 3–4 เดือนของ ARPU (฿2,500–3,200) ถ้าอายุลูกค้าเฉลี่ย ≈ 2 ปี

## 8. วิธีคุมค่าใช้จ่ายตั้งแต่วันแรก

1. ตั้ง **spend limit** บน Vercel และ alert บน Supabase/Upstash/R2
2. รูป/ไฟล์ทั้งหมดเสิร์ฟจาก Cloudflare (R2 + CDN) ไม่ผ่าน Vercel → ลด bandwidth bill ที่แพงที่สุด
3. ISR + cache tags สำหรับหน้าร้าน; ไม่ render dynamic ทั้งหน้าเพื่อแค่ตะกร้า
4. โควต้าต่อแพ็กเกจ (storage, ข้อความ, งานเบื้องหลัง) และจำกัดอัตราต่อร้าน
5. Compute ของ Supabase ปรับตามจริง; เปิด PITR เมื่อมีลูกค้าจ่ายเงินมากพอ
6. หยุด trial ที่ไม่ใช้งาน 30 วัน (unpublish, ไม่ลบ) ลด ISR/cron/อีเมล
7. ใช้ LINE แทน SMS ทุกที่ที่ทำได้
8. ทบทวนต้นทุนต่อร้านทุกเดือนในคอนโซล; ร้านที่ใช้ผิดปกติให้ขยับแพ็กเกจ
9. ทำให้ทุกแอปรันใน Docker ตั้งแต่แรก → ย้ายเมื่อค่า Vercel > ฿15,000/เดือน

## 9. แหล่งอ้างอิงราคา (ค้น ต.ค. 2026)

โดเมน

- [THNIC — .co.th ฿800/ปี ไม่รวม VAT](https://www.thnic.co.th/coth) · [หน้าแรก THNIC ฿856/ปี](https://www.thnic.co.th/)
- [NokHosting — .in.th ฿450, .co.th ฿750](https://www.nokhosting.com/domain) · [Hinet — .co.th ฿1,000](https://www.hinetcomputer.com/home/service-domain.html) · [Z.com โดเมนไทย](https://domain.z.com/th/domain-th/)
- [Verisign .com wholesale $10.26 → $10.97 (1 พ.ย. 2026)](https://elvisonunwa.com/general/the-actual-cost-of-a-domain-name-in-2026-and-who-is-keeping-the-difference) · [เปรียบเทียบราคา .com 149 registrar](https://domainoffer.net/tld/com) · [Network Solutions — ราคาโดเมน 2026](https://www.networksolutions.com/blog/how-much-does-domain-name-cost/)

Payment gateway ไทย

- [Opn Payments — หน้าราคา](https://www.opn.ooo/th-th/pricing/) · [Statrys — เปรียบเทียบ gateway ไทย 2026](https://statrys.com/blog/best-payment-gateways-in-thailand) · [Outsourcify — 7 gateway เปรียบเทียบ](https://outsourcify.net/guides/thailands-online-payment-gateways/) · [Boldrails — ค่าธรรมเนียมและรอบโอน](https://boldrails.com/blog/best-payment-gateways-thailand) · [Stripe — ค่าธรรมเนียม gateway ในไทย](https://stripe.com/resources/more/payment-gateway-fees-thailand) · [Xendit — gateway สำหรับ Shopify ไทย 2026](https://www.xendit.co/en-th/blog/top-payment-gateway-for-shopify-ecommerce-brands-in-thailand-2026/) · [Creative.co.th — เปรียบเทียบค่าธรรมเนียม 2026](https://creative.co.th/en/13954/)

Hosting / Cloud

- [Makerkit — Vercel cost 2026 (calculator)](https://makerkit.dev/blog/saas/vercel-cost) · [Activepieces — Vercel pricing 2026](https://www.activepieces.com/blog/vercel-pricing-in-2026-how-the-costs-scale.md) · [Costbench — Vercel plans](https://costbench.com/software/developer-tools/vercel/)
- [Makerkit — Supabase pricing 2026](https://makerkit.dev/blog/saas/supabase-pricing) · [Toolradar — Supabase pricing 2026](https://toolradar.com/blog/supabase-pricing-2026) · [Focusreactive — Supabase plans explained](https://focusreactive.com/blog/supabase-price/)
- [Cloudflare for SaaS — plans ($0.10/hostname, 100 ฟรี)](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/) · [Cloudflare changelog — เพดาน 50,000 hostnames](https://developers.cloudflare.com/changelog/2025-05-19-paygo-updates/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing) · [Filebase — R2 pricing 2026](https://filebase.com/blog/cloudflare-r2-pricing-costs-savings-and-alternatives-in-2026/)
- [Hetzner — การขึ้นราคา 2026](https://findstack.com/resources/hetzner-price-increase-2026) · [Northflank — Hetzner price increases](https://northflank.com/blog/hetzner-cloud-server-price-increases) · [DigitalOcean — Droplet pricing](https://docs.digitalocean.com/products/droplets/details/pricing/) · [Diyai — DigitalOcean pricing 2026](https://diyai.io/ai-tools/hosting/digitalocean-pricing/)
- [Classmethod — EC2 บน AWS Thailand region](https://dev.classmethod.jp/articles/ec2-thailand-region-aws-th/) · [aws-pricing.com — ap-southeast-7](https://aws-pricing.com/ap-southeast-7.html) · [Google Cloud เปิด region กรุงเทพฯ ม.ค. 2026](https://techwireasia.com/2026/01/google-cloud-opens-a-local-cloud-region-in-thailand/)

อีเมล / LINE / SMS

- [Resend pricing 2026](https://www.usecarly.com/blog/resend-pricing/) · [Automationatlas — Resend cost](https://automationatlas.io/answers/resend-pricing-explained-2026/)
- [LINE Messaging API — pricing (แยกตามประเทศ)](https://developers.line.biz/en/docs/messaging-api/pricing/) · [Relevant Audience — แพ็กเกจ LINE OA ไทย 2569](https://www.relevantaudience.com/th/digital-marketing-th/%E0%B9%84%E0%B8%A5%E0%B8%99%E0%B9%8C-%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B9%80%E0%B8%97%E0%B8%A8%E0%B9%84%E0%B8%97%E0%B8%A2-%E0%B9%82%E0%B8%8B%E0%B8%A5%E0%B8%B9%E0%B8%8A%E0%B8%B1%E0%B8%99%E0%B8%98%E0%B8%B8%E0%B8%A3%E0%B8%81%E0%B8%B4%E0%B8%88-2569/)
- [ThaiBulkSMS — เริ่มต้น ฿0.15/SMS](https://www.hunted.space/dashboard/thaibulksms) · [Messaggio — Bulk SMS Thailand](https://messaggio.com/bulk-sms/thailand)
