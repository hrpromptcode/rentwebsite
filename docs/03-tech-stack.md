# 03 — เฟรมเวิร์กและเทคโนโลยี (หน้าบ้าน / หลังบ้าน / บริการภายนอก / Hosting)

> ตอบคำถาม: ใช้อะไรสร้าง, ทำไม, ทางเลือกคืออะไร, โค้ดจัดระเบียบอย่างไร, จะ host ที่ไหนในแต่ละช่วง

## 1. สรุป stack ในตารางเดียว

| ชั้น | เลือก | ทางเลือกที่พิจารณา | เหตุผลที่เลือก |
|---|---|---|---|
| ภาษา | **TypeScript ทั้งระบบ** | PHP (Laravel), Python, Go | ทีมเล็ก ใช้ type/validation ชุดเดียวทั้ง front/back/DB |
| เฟรมเวิร์กหน้าบ้าน + BFF | **Next.js 16 (App Router, React Server Components, Server Actions), React 19** | Remix/React Router 7, Nuxt, SvelteKit, Astro | middleware สำหรับ multi-tenant, SSR/ISR เพื่อ SEO หน้าร้าน, ecosystem/ตัวอย่าง (Vercel Platforms Starter Kit) มากที่สุด |
| UI | **Tailwind CSS v4 + shadcn/ui (Radix)** | Mantine, Chakra, Ant Design | ธีมผ่าน CSS variables ตรงกับ design tokens ต่อ tenant, ปรับแต่งได้เต็มที่, เบา |
| ฟอร์ม/validation | React Hook Form + **Zod** | Valibot, Yup | schema เดียวใช้ทั้ง client, server action, section props, settings |
| ตาราง/ข้อมูลหลังบ้าน | TanStack Table + TanStack Query | | ตารางใหญ่, filter, pagination แบบ server |
| ปฏิทิน (Booking) | FullCalendar หรือ Schedule-X | | มุมมองวัน/สัปดาห์/ต่อพนักงาน, ลากวาง |
| Rich text | Tiptap | Lexical | รายละเอียดสินค้า/บทความ, ปลอดภัยกว่า HTML ดิบ |
| i18n | next-intl | | ไทย/อังกฤษ ทั้ง UI และเนื้อหา |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Prisma, Kysely | เบา, ใกล้ SQL, ทำ `set_config` สำหรับ RLS ง่าย, type-safe |
| ฐานข้อมูล | **PostgreSQL 16+ (Supabase)** | Neon, AWS RDS, self-host | RLS, Storage, Realtime, backup, dashboard ครบ; ยังเป็น Postgres มาตรฐาน ย้ายออกได้ |
| Auth (เจ้าของร้าน/พนักงาน/คุณ) | **Better Auth** (organization plugin, 2FA, OAuth Google, LINE Login) | Supabase Auth, Auth.js, Clerk | ควบคุม schema เอง, องค์กร/สมาชิกหลาย tenant ในตัว, ไม่ผูกกับ vendor |
| Auth (ลูกค้าของร้าน) | **ระบบเองในแอป**: เบอร์ OTP, LINE Login, อีเมล magic link, session cookie ต่อ hostname | | unique ต่อ tenant, guest checkout, เรียบง่าย |
| Cache / rate limit | **Upstash Redis** + `@upstash/ratelimit` | Vercel KV, Redis บน VPS | serverless-friendly, จ่ายตามใช้ |
| คิว / งานเบื้องหลัง | **Inngest** (ช่วงแรก, ไม่ต้องดูแล worker) → BullMQ worker เมื่อ self-host | Trigger.dev, Vercel Cron, QStash | retry/idempotency/cron ครบ, debug ง่าย |
| ไฟล์/รูป | **Cloudflare R2** (S3 API) + Cloudflare CDN + image resizing | Supabase Storage, S3 | egress ฟรี (ร้านค้ารูปเยอะ), ถูก |
| อีเมล | **Resend** + React Email | SES, Postmark, Brevo | เทมเพลตเป็น React, deliverability ดี |
| LINE | LINE Messaging API + LINE Login + LIFF | | ช่องทางหลักของลูกค้าไทย |
| SMS | ThaiBulkSMS / SMSMKT (ผ่าน adapter) | Twilio (แพงในไทย) | OTP, เตือนนัด |
| Payment (ร้านค้า) | **Opn Payments** (บัตร, PromptPay, TrueMoney, ผ่อน) เป็นหลัก + GB Prime Pay/Xendit + Stripe (ต่างประเทศ) + โอน/สลิป + ตรวจสลิป (SlipOK/EasySlip) | 2C2P, KBank/SCB API ตรง | adapter pattern ให้ร้านเลือกเจ้าที่ตัวเองมีบัญชี |
| Billing (ค่าเช่าแพลตฟอร์ม) | **Stripe Billing** (บัตรต่ออายุอัตโนมัติ) + PromptPay ผ่าน Opn (จ่ายรายงวด) | Opn recurring | จัดการแพ็กเกจ/proration/ใบแจ้งหนี้ให้ |
| ขนส่ง | Shippop (aggregator) → Flash, Kerry, J&T, ไปรษณีย์ไทย | เชื่อมตรงทีละเจ้า | เชื่อมครั้งเดียวได้หลายขนส่ง |
| ค้นหา | Postgres full-text + `pg_trgm` → Meilisearch เมื่อโต | Typesense, Algolia | เริ่มง่าย, ไม่มีค่าใช้จ่าย |
| Realtime | Supabase Realtime หรือ SSE | Pusher, Ably | หน้าครัว, คิวเติมเกม, แจ้งเตือนหลังบ้าน |
| Analytics | PostHog (product analytics + feature flags) + Umami (สถิติต่อร้าน, self-host) | Plausible, GA4 | privacy-friendly, per-tenant ได้ |
| Error / Logs / Uptime | Sentry + Axiom หรือ Better Stack | Datadog (แพง) | tag `tenant_id` ทุก event |
| Testing | Vitest, Testing Library, Playwright, SQL tests สำหรับ RLS, k6 (load) | Jest, Cypress | |
| CI/CD | GitHub Actions + Vercel preview deployments | GitLab | |
| Monorepo | **Turborepo + pnpm** | Nx | cache build, แชร์ packages |
| Hosting (ช่วงแรก) | **Vercel** (แอป) + Supabase + Upstash + Cloudflare | Railway, Fly.io, VPS | เริ่มเร็วสุด, preview ต่อ PR, scale อัตโนมัติ |
| Hosting (เมื่อโต) | Docker บน VPS (Hetzner/DigitalOcean/AWS Lightsail) ด้วย Coolify หรือ Dokploy, หรือ AWS/GCP กรุงเทพฯ | | ลดค่าใช้จ่าย 50–70% ที่ 300+ ร้าน |

## 2. หน้าบ้าน (Storefront + Admin) — รายละเอียด

- **Next.js App Router**: ใช้ Server Components เป็นค่าเริ่มต้น (หน้าร้านส่วนใหญ่อ่านอย่างเดียว → HTML เร็ว, JS น้อย), Client Components เฉพาะที่โต้ตอบ (ตะกร้า, ปฏิทินจอง, page builder)
- **Routing หน้าร้าน**: `app/_sites/[tenant]/(storefront)/...` ถูก rewrite จาก middleware; โมดูลประกาศ segment ของตัวเอง; layout โหลด theme + nav ครั้งเดียว
- **Theme runtime**: tokens → CSS vars ใน `<html>`; Tailwind v4 `@theme` ผูกกับ var; คอมโพเนนต์ใน `packages/ui` ห้าม hardcode สี; ตรวจ contrast อัตโนมัติ (WCAG AA) ตอนลูกค้าเลือกสีและเตือน
- **ฟอนต์ไทย**: `next/font/google` subset `thai`+`latin`, preload เฉพาะ heading/body ที่ร้านเลือก; fallback `system-ui`; กัน CLS ด้วย `size-adjust`
- **รูป**: `next/image` + custom loader ชี้ CDN (Cloudflare image resizing) เพื่อไม่ให้ Vercel คิด bandwidth/transformations
- **Page builder (หลังบ้าน)**: ฟอร์มจาก zod schema ของ section (auto-form) + preview iframe (หน้าร้านจริงใน draft mode) สื่อสารด้วย postMessage; ลากเรียงด้วย dnd-kit
- **Performance budget**: LCP < 2.5 s บน 4G, JS หน้าแรก < 150 KB gz, Lighthouse ≥ 90 ทุกเทมเพลต (เช็กใน CI)
- **Accessibility**: shadcn/Radix ให้พื้นฐาน; เป้าหมาย WCAG 2.1 AA สำหรับหน้าร้าน
- **PWA**: หน้าครัว (KDS), เช็กอินอีเวนต์, หลังบ้านบนมือถือ — manifest + service worker เฉพาะส่วนที่จำเป็น

## 3. หลังบ้าน (Backend) — รายละเอียด

สถาปัตยกรรมแบบ "Modular monolith + worker":

```
Request → Next.js (Route Handler / Server Action)
        → requireTenantCtx(permission)        // auth + tenant + role → TenantCtx
        → Service (packages/modules/<m>/services)   // business logic, ไม่รู้จัก HTTP
        → Repository (packages/db)             // Drizzle + withTenant() + RLS
        → events_outbox (ใน transaction เดียวกัน)
Worker  ← Inngest/BullMQ ดึง event → handler ในโมดูล → integrations (LINE, Opn, supplier…)
```

- **Server Actions** สำหรับฟอร์มหลังบ้าน (mutation), **Route Handlers** สำหรับ webhooks ขาเข้า, public API, ไฟล์, RSS/sitemap
- **Service layer ไม่ผูกกับ Next.js** → ภายหลังแยกเป็น API server (Hono/NestJS) หรือย้าย worker ไป container ได้โดยไม่เขียนใหม่
- **Validation ทุกขอบเขต**: input (zod) → service → DB constraints (unique, check, FK) → RLS
- **Idempotency**: ทุก mutation ที่มีเงินเกี่ยวข้องรับ `idempotencyKey` (ตาราง `idempotency_keys` ต่อ tenant)
- **Webhooks ขาเข้า** (Opn, Stripe, LINE, Shippop, supplier): ตรวจลายเซ็น → บันทึก raw → ตอบ 200 เร็ว → ประมวลผลใน worker
- **Public API + Webhooks ขาออก** (แพ็กเกจ Business): REST + API key ต่อ tenant, rate limit, เอกสาร OpenAPI; event ส่งแบบ signed (HMAC) พร้อม retry
- **Ledger (wallet/เงิน)**: double-entry (`wallet_transactions` มี debit/credit, ยอดเป็นผลรวม, ห้าม update ยอดตรง ๆ), constraint ยอดไม่ติดลบ, ทุกรายการอ้างอิงต้นทาง (order/refund/adjustment)
- **Slot engine (booking)**: คำนวณ availability เป็น pure function ที่ทดสอบได้ (input: rules, time off, bookings, buffer → output: slots), cache ผลต่อวันต่อพนักงาน, ยืนยันด้วย transaction + unique constraint

## 4. ฐานข้อมูล

- **Supabase Pro** 1 โปรเจกต์ต่อ environment (staging, prod); dev ใช้ Supabase CLI local (Docker) หรือ Neon branch
- Connection: ใช้ **pooler (Supavisor, transaction mode)** สำหรับ serverless; session mode เฉพาะ migration/worker
- Extension: `pg_trgm` (ค้นหา), `pgcrypto`, `pg_cron` (งาน DB เล็ก ๆ), `uuid v7` ผ่าน function
- Partitioning ภายหลัง: `audit_logs`, `events_outbox`, `notifications` แบ่งตามเดือน
- Backup: Supabase รายวัน (7 วันบน Pro) + **PITR add-on** เมื่อมีลูกค้าจ่ายเงินจำนวนมาก + export รายสัปดาห์ไป R2 (logical dump) เป็นสำรองนอก vendor
- ทำไมไม่ Neon: Neon เด่นเรื่อง branching/scale-to-zero (ดีสำหรับ dev/preview) แต่ Supabase ให้ Storage/Realtime/Auth/Dashboard ที่ประหยัดเวลาทีมเล็กมากกว่า → ใช้ Neon สำหรับ preview branch ได้ถ้าต้องการ
- ทำไมไม่ MySQL/MongoDB: RLS และ jsonb ของ Postgres คือหัวใจของการแยก tenant และ page builder

## 5. Auth — การออกแบบ 2 realm

| | Realm A: Platform users | Realm B: Customers ของแต่ละร้าน |
|---|---|---|
| ใคร | superadmin, เจ้าของร้าน, พนักงาน | ผู้ซื้อ/ผู้จอง/ผู้เติม |
| ไลบรารี | Better Auth (+ organization, two-factor, OAuth) | โค้ดเอง (ตาราง `customers`, `customer_sessions`) |
| ตัวตน | อีเมล (unique ทั้งระบบ) | `(tenant_id, phone)` หรือ `(tenant_id, email)` หรือ `(tenant_id, line_user_id)` |
| วิธีเข้า | รหัสผ่าน, Google, LINE, magic link; 2FA | OTP ทาง SMS/LINE, LINE Login (LIFF), magic link, guest |
| Session | cookie บน `app.rentweb.app` | cookie บน hostname ของร้าน (แยกกันเองตามโดเมน) |
| สิทธิ์ | role ต่อ tenant + permission ของโมดูล | เจ้าของข้อมูลตัวเองเท่านั้น |

LINE Login ต้องมี LINE Login channel; ร้านที่ต้องการให้ลูกค้า login ด้วย LINE ของร้าน (เพื่อผูกกับ LINE OA ของร้านและส่งข้อความได้) ต้องใช้ channel ของร้านเอง → หลังบ้านมีหน้าให้กรอก Channel ID/Secret (เข้ารหัสเก็บ) และระบบรองรับ multi-channel OAuth callback (`/auth/line/callback?tenant=…`)

## 6. การเชื่อมต่อภายนอก — ออกแบบเป็น adapter

```ts
// packages/integrations/payments/types.ts
export interface PaymentProvider {
  key: "opn" | "gbprimepay" | "xendit" | "stripe" | "bank_transfer";
  createCharge(ctx, input: { amount, currency, method, returnUrl, metadata }): Promise<ChargeResult>;
  verifyWebhook(rawBody, headers): WebhookEvent;
  refund(ctx, chargeId, amount?): Promise<RefundResult>;
  capabilities: { promptpay: boolean; card: boolean; installment: boolean; recurring: boolean };
}
```

แบบเดียวกันสำหรับ `SmsProvider`, `ShippingProvider`, `TopupSupplier`, `SlipVerifier`, `MessagingProvider` (LINE/Email) → เพิ่มเจ้าใหม่โดยไม่แตะ business logic; ทดสอบด้วย fake provider ใน CI

Thai-specific integrations ที่ต้องมีตั้งแต่แรก: PromptPay QR (ผ่าน gateway หรือ generate QR มาตรฐาน EMVCo + ตรวจสลิป), แนบสลิป + ตรวจอัตโนมัติ, LINE Messaging API, ที่อยู่ไทย (dataset จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์), ปฏิทินวันหยุดไทย (booking), พ.ศ./ค.ศ. toggle ในการแสดงผล

## 7. โครงสร้าง monorepo

```
rentweb/
├─ apps/
│  ├─ web/                 # หน้าร้านทุก tenant (*.rentweb.app, custom domains) + เว็บการตลาดของแพลตฟอร์ม
│  ├─ admin/               # app.rentweb.app (tenant admin) + console.rentweb.app (superadmin) — route group แยก, role gate
│  └─ worker/              # Inngest functions / BullMQ processors: events, cron, integrations
├─ packages/
│  ├─ db/                  # Drizzle schema (core + ทุกโมดูล), migrations, RLS SQL, seed, withTenant()
│  ├─ core/                # TenantCtx, auth helpers, billing, quotas, event bus, module registry, feature flags
│  ├─ modules/
│  │  ├─ cms/  commerce/  booking/  topup/  restaurant/  clinic/  rental/  lms/  events/  listings/  membership/  donation/
│  │  └─ <module>/ { manifest.ts, schema.ts, services/, admin/ (หน้าจอ), storefront/ (routes+sections), jobs/, tests/ }
│  ├─ ui/                  # shadcn components, token system, section primitives, Thai address picker, money/date formatters
│  ├─ themes/              # presets (minimal, bold, elegant, playful, dark-gaming, corporate, warm-local)
│  ├─ templates/           # site templates: modules + preset + pages + seed (JSON + TS)
│  ├─ integrations/        # payments/, slip/, line/, sms/, email/, shipping/, suppliers/, maps/
│  ├─ i18n/                # messages th/en
│  └─ config/              # eslint, tsconfig, tailwind preset, prettier
├─ tooling/                # scripts: create-tenant, export-tenant, import-tenant, isolation-test, cost-report
├─ docs/                   # เอกสารชุดนี้ + ADR (architecture decision records)
├─ .github/workflows/      # ci.yml (lint, typecheck, test, isolation), deploy.yml
├─ turbo.json  pnpm-workspace.yaml  .env.example
```

กฎของขอบเขต (บังคับด้วย ESLint `no-restricted-imports` + `dependency-cruiser`):

- `apps/*` เรียก `packages/modules/*` และ `core` ได้; ห้ามเรียก `db` ตรง
- `modules/*` ห้าม import กันเอง → สื่อสารผ่าน events หรือ interface ใน `core` (เช่น clinic ใช้ `BookingPort` ไม่ import booking โดยตรง)
- `integrations/*` ไม่รู้จัก DB; รับ/คืน DTO เท่านั้น
- `ui` ไม่มี business logic, ไม่รู้จัก tenant

## 8. ข้อตกลงการเขียนโค้ดที่กัน bug ของ multi-tenant

1. ทุก service function รับ `ctx: TenantCtx` เป็นพารามิเตอร์แรก (`{ tenantId, userId?, role, permissions, locale, tz }`)
2. ห้ามใช้ `db` นอก `packages/db` — ใช้ repository ที่ห่อ `withTenant(ctx.tenantId, …)` เท่านั้น
3. ทุก query มี `where eq(table.tenantId, ctx.tenantId)` แม้ RLS จะกันอยู่แล้ว (ชัดเจน + ใช้ index)
4. ทุก unique constraint / index ขึ้นต้นด้วย `tenant_id`
5. ID ภายนอก (URL, อีเมล) ใช้ uuid หรือ public id แบบสุ่ม — ไม่ใช้เลขรัน
6. เงินเป็น `bigint` สตางค์; เวลาเป็น UTC ใน DB แสดงผลด้วย `ctx.tz`
7. ทุก mutation สำคัญ → `audit_logs` + event ใน transaction เดียวกัน
8. ทุกข้อความ UI ผ่าน i18n keys; ไม่มี string ไทย hardcode ในคอมโพเนนต์
9. Error ที่คาดได้ (สต็อกหมด, slot ไม่ว่าง) คืนเป็น typed Result; bug จริง throw → Sentry พร้อม `tenant_id`
10. ก่อน merge: isolation test ผ่าน, ไม่มีคอมโพเนนต์หน้าร้านที่ hardcode สี, มี migration ที่ย้อนกลับได้

## 9. ตัวเลือก hosting เปรียบเทียบ

| ตัวเลือก | ค่าใช้จ่ายประมาณที่ 100 ร้าน | ภาระดูแล | เหมาะเมื่อ |
|---|---|---|---|
| **Vercel + Supabase + Upstash + Cloudflare** (PaaS ทั้งหมด) | ฿6,000–11,000/เดือน | ต่ำมาก | เริ่มต้นจนถึง ~300 ร้าน; ทีม 1–2 คนไม่มี DevOps |
| Railway / Fly.io (containers) + Supabase หรือ Neon | ฿4,000–8,000 | ต่ำ | ต้องการ worker แบบ long-running และลดค่า bandwidth ของ Vercel |
| **VPS + Docker (Coolify/Dokploy)** บน Hetzner/DigitalOcean/Vultr/AWS Lightsail + Cloudflare หน้าสุด | ฿2,500–5,000 | กลาง: อัปเดต OS, backup, monitoring, scale เอง | 100+ ร้าน หรือมีคนดูแลระบบ; ประหยัด 50–70% |
| AWS/GCP **กรุงเทพฯ** (ECS/Cloud Run + RDS/Cloud SQL + S3/GCS) | ฿8,000–20,000 | สูง | ลูกค้าองค์กร/โรงพยาบาลที่ต้องเก็บข้อมูลในประเทศ, latency ต่ำสุด |
| Cloudflare Workers/Pages + D1/Hyperdrive | ฿1,000–3,000 | กลาง | ถ้าออกแบบให้รันบน edge ตั้งแต่แรก (ข้อจำกัด Node API, ORM, ไลบรารี) — ไม่แนะนำสำหรับขอบเขตนี้ |

**คำแนะนำ**: เริ่ม PaaS (แถวแรก) เพื่อให้ถึงตลาดเร็ว แต่ **ทำให้ทุกแอปรันใน Docker ได้ตั้งแต่วันแรก** (`Dockerfile` + `docker-compose` สำหรับ local) และเก็บไฟล์/รูปนอก Vercel → เมื่อค่าใช้จ่าย Vercel เกิน ~฿15,000/เดือน ให้ย้าย `web`/`worker` ไป container โดยไม่แก้โค้ด

ข้อควรระวัง Vercel: แผน Hobby **ห้ามใช้เชิงพาณิชย์** → ต้อง Pro ($20/seat) ทันทีที่มีลูกค้าจ่ายเงิน; ตั้ง spend limit; bandwidth เกิน 1 TB คิด ~$0.15/GB → รูปต้องอยู่ CDN อื่น; edge requests ต่อ page view อาจ 25–40 ครั้ง

## 10. ทางเลือกที่พิจารณาแล้วไม่เลือก (และเมื่อไรควรเปลี่ยนใจ)

| ทางเลือก | ข้อดี | เหตุผลที่ไม่เลือก | เปลี่ยนใจเมื่อ |
|---|---|---|---|
| **Laravel + Filament + Inertia/Livewire** (PHP) + `stancl/tenancy` | หลังบ้านสร้างเร็วมาก, hosting ถูก, dev PHP หาง่ายในไทย, แพ็กเกจ tenancy สุกงอม | หน้าร้านที่โต้ตอบมาก (page builder, QR ordering, wallet) และ type sharing ทำยากกว่า; สองภาษา (PHP+JS) | ทีมถนัด PHP เป็นหลัก → เป็นตัวเลือกที่ดีจริง ๆ ใช้ Filament เป็น admin และ Next.js/Inertia เป็นหน้าร้าน |
| WordPress Multisite + WooCommerce | เร็วที่สุด, ธีม/ปลั๊กอินเยอะ | ความปลอดภัย/ประสิทธิภาพ/ปลั๊กอินชนกัน, ปรับให้เป็น SaaS จริงยาก, ไม่เหมาะกับ booking/top-up/clinic | ต้องการขาย "เว็บบริษัท/บล็อก" เท่านั้น |
| Headless commerce (Medusa, Saleor, Vendure) | commerce ครบ | multi-tenant ไม่ native (Vendure มี channels), ไม่ครอบคลุม vertical อื่น, 2 ระบบให้ดูแล | commerce ซับซ้อนมาก (B2B, multi-warehouse) |
| Payload CMS 3 (อยู่บน Next.js, มี multi-tenant plugin) | admin auto-generate จาก schema, อยู่ใน Next.js เดียวกัน | โมดูลธุรกิจ (slot engine, ledger) ต้องเขียนเองอยู่ดี และ UX หลังบ้านถูกกรอบของ Payload | อยากลดเวลาเขียน CRUD หลังบ้านและยอมรับ UX ของ Payload |
| Django / Rails | productive, admin ฟรี | แยกภาษากับหน้าบ้าน, ทีมเล็กเสียเวลาสลับ | ทีมถนัด Python/Ruby |
| Microservices ตั้งแต่แรก | แยก scale | ทีมเล็กจะจมกับ infra; modular monolith ให้ขอบเขตเดียวกันโดยไม่ต้องจ่ายต้นทุนเครือข่าย | 10+ นักพัฒนา |
| Multi-tenant แบบ DB แยกต่อร้าน | isolation สูงสุด | แพง/ช้า/ดูแล N ฐาน สำหรับร้านค่าเช่าหลักร้อยบาท | ลูกค้าองค์กรที่จ่ายหลักหมื่น/เดือน (ทำเป็น hybrid) |

## 11. เครื่องมือพัฒนาและเวอร์ชัน (ต.ค. 2026)

ใช้เวอร์ชัน stable ล่าสุดตอนเริ่มโปรเจกต์และล็อกด้วย `pnpm-lock.yaml`: Node 22 LTS, pnpm 10, TypeScript 5.x, Next.js 16.x, React 19.x, Tailwind 4.x, Drizzle 1.x, Better Auth 1.x, Zod 4.x, Vitest 3.x, Playwright 1.5x · เปิด Renovate/Dependabot รายสัปดาห์ · ใช้ `.nvmrc`/`engines` และ `corepack`
