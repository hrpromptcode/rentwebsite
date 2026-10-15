# 01 — สถาปัตยกรรม Multi-tenant และการแยกลูกค้า

> ตอบคำถาม: ลูกค้าหลายรายอยู่บนระบบเดียวกันได้อย่างไรโดยไม่เห็นข้อมูลกัน, URL/โดเมนทำงานอย่างไร, ธีมและเนื้อหาของแต่ละร้านเก็บและเรนเดอร์อย่างไร, ระบบขยายตัวอย่างไร

## 1. คำศัพท์

| คำ | ความหมาย |
|---|---|
| **Platform** | ระบบของคุณทั้งหมด (RentWeb) |
| **Tenant** | ลูกค้าผู้เช่า 1 ราย = 1 เว็บไซต์ (อาจมีหลายสาขา หลายโดเมน หลายพนักงาน) |
| **Tenant member** | ผู้ใช้ฝั่งหลังบ้านของร้าน (เจ้าของ, ผู้จัดการ, พนักงาน) |
| **Customer** | ลูกค้าปลายทางของร้าน (คนที่เข้ามาซื้อ/จอง/เติมเกม) — เป็นของ tenant นั้น ๆ |
| **Superadmin** | คุณและทีม ดูแลทุก tenant |
| **Module** | ชุดความสามารถที่เปิด/ปิดต่อ tenant ได้ (Commerce, Booking, Top-up ...) |
| **Template / Site type** | สูตรสำเร็จ = โมดูล + ธีม + หน้าเว็บ + ข้อมูลตัวอย่าง |

## 2. ตัวเลือกการแยกข้อมูล (Tenant isolation) และสิ่งที่เลือก

| รูปแบบ | วิธีทำ | ข้อดี | ข้อเสีย | เหมาะกับ |
|---|---|---|---|---|
| **A. Pooled (shared schema)** ✅ เลือก | DB เดียว ตารางเดียวกัน ทุกแถวมี `tenant_id` + Row Level Security | ถูกสุด, migration ครั้งเดียว, สร้าง tenant ใหม่ใน < 1 วินาที, รองรับหลายพันร้าน | ต้องมีวินัย: ลืม filter = รั่ว (RLS ช่วยกัน), noisy neighbor, backup/restore รายร้านยากกว่า | SaaS ส่วนใหญ่ (Shopify ช่วงแรก, Notion, Linear) |
| B. Schema-per-tenant | Postgres schema ต่อร้าน | แยกชัดขึ้น, restore รายร้านง่ายขึ้น | migration ต้องรัน N ครั้ง, connection pool ยุ่ง, เครื่องมือ ORM รองรับไม่ดี | 10–200 ร้านที่ต้องการ isolation สูง |
| C. Database-per-tenant | DB แยกต่อร้าน | isolation สูงสุด, ย้าย/ลบร้านง่าย, data residency | แพง (compute ต่อ DB), ดูแล N ฐาน, สร้างร้านช้า | ลูกค้าองค์กร/โรงพยาบาล |

**ตัดสินใจ: เริ่มด้วย A (Pooled + RLS) และออกแบบโค้ดให้ "ไม่รู้" ว่าตัวเองอยู่ DB ไหน** (ทุก query ผ่าน tenant context) เพื่อให้ภายหลังย้าย tenant รายใหญ่ไป DB แยก (hybrid) ได้โดยไม่แก้ business logic

สิ่งที่ "แยก" ต่อ tenant ในแบบ A:

| ทรัพยากร | วิธีแยก |
|---|---|
| ข้อมูลใน DB | `tenant_id` ทุกตาราง + RLS policy + index นำหน้าด้วย tenant_id |
| ไฟล์/รูป | key prefix `tenants/{tenant_id}/...` ใน R2, ไฟล์ส่วนตัวใช้ signed URL |
| Cache | key prefix `t:{tenant_id}:` |
| งานเบื้องหลัง | ทุก job payload มี `tenant_id`, worker ตั้ง context ก่อนทำงาน |
| Secrets ของร้าน (API key gateway) | เข้ารหัส AES-256-GCM ด้วย key ของแพลตฟอร์ม, เก็บในตาราง `tenant_secrets` |
| โดเมน/cookie/session | session ของ customer ผูกกับ hostname โดยธรรมชาติ (cookie ไม่ข้ามโดเมน) |
| โควต้า/อัตรา | rate limit และ quota ต่อ tenant (สินค้า, storage, ออเดอร์/เดือน, พนักงาน) |
| Log/Audit | ทุก log มี `tenant_id` เพื่อค้นและส่งออกรายร้านได้ |

## 3. การระบุ tenant จาก URL (Tenant resolution และ routing)

### 3.1 โครงสร้างโดเมน

| Hostname | ใช้ทำอะไร |
|---|---|
| `rentweb.app`, `www.rentweb.app` | เว็บการตลาดของแพลตฟอร์ม, สมัครใช้งาน |
| `app.rentweb.app` | หลังบ้านของร้าน (tenant admin) — เลือก workspace หลัง login |
| `console.rentweb.app` | Superadmin |
| `{slug}.rentweb.app` | หน้าร้านของ tenant (ฟรีทุกแพ็กเกจ) — wildcard DNS `*.rentweb.app` |
| `www.ร้านลูกค้า.com` | โดเมนส่วนตัวของ tenant (CNAME มาที่แพลตฟอร์ม) |
| `api.rentweb.app` | Public API / webhooks (ภายหลัง) |

สงวน subdomain เช่น `www, app, api, console, admin, mail, status, cdn, help, blog` ไม่ให้ tenant ใช้

### 3.2 ลำดับการทำงานของทุก request

```
1. Request เข้ามาที่ hostname X
2. Edge middleware (Next.js):
   - ถ้า X เป็น host ของแพลตฟอร์ม → route ไปแอปนั้น
   - ไม่เช่นนั้น: lookup Redis  host:X → {tenant_id, status, plan}
       miss → query ตาราง tenant_domains → เขียน cache (TTL 5 นาที, ลบทันทีเมื่อแก้)
   - ไม่พบ → หน้า "ไม่พบเว็บไซต์นี้"
   - status ≠ active → หน้า "ปิดปรับปรุง / ค้างชำระ / ระงับ"
   - rewrite URL เป็น /_sites/{tenant_id}/{path เดิม}  และตั้ง header x-tenant-id
3. Server component อ่าน tenant_id จาก header → โหลด tenant config (ธีม, โมดูล, ภาษา) จาก cache
4. ทุก DB call ในรอบ request นี้ทำงานภายใต้ tenant context (set_config + RLS)
```

ตัวอย่างโครง middleware (ย่อ):

```ts
// apps/web/middleware.ts
export async function middleware(req: NextRequest) {
  const host = req.headers.get("host")!.split(":")[0].toLowerCase();
  if (PLATFORM_HOSTS.has(host)) return NextResponse.next();

  const t = await resolveTenantByHost(host); // Redis → DB fallback
  if (!t) return NextResponse.rewrite(new URL("/_errors/no-site", req.url));
  if (t.status !== "active") return NextResponse.rewrite(new URL(`/_errors/${t.status}`, req.url));

  const url = req.nextUrl.clone();
  url.pathname = `/_sites/${t.id}${url.pathname}`;
  const res = NextResponse.rewrite(url);
  res.headers.set("x-tenant-id", t.id);
  return res;
}
```

### 3.3 โดเมนส่วนตัวของลูกค้า (Custom domain) — ขั้นตอนอัตโนมัติ

1. ร้านกรอก `www.myshop.com` ในหน้า Settings → Domains → ระบบสร้างแถว `tenant_domains` สถานะ `pending` + token ยืนยัน
2. ระบบแสดงคำสั่ง DNS ที่ต้องตั้ง:
   - `CNAME  www  →  cname.rentweb.app`
   - `TXT  _rentweb-verify.www  →  rw-verify=<token>` (กันคนอื่นแอบอ้างโดเมน)
   - สำหรับโดเมนเปล่า (`myshop.com`) แนะนำย้าย DNS มา Cloudflare (CNAME flattening) หรือใช้ A record ตามที่ hosting กำหนด
3. Worker ตรวจ DNS ทุก 1–2 นาที (สูงสุด 72 ชม.) → เมื่อผ่าน:
   - **แบบ Vercel**: เรียก Vercel Domains API เพิ่มโดเมนเข้าโปรเจกต์ → Vercel ออก SSL ให้อัตโนมัติ (ไม่มีค่าใช้จ่ายเพิ่ม)
   - **แบบ self-host / origin อื่น**: สร้าง Custom Hostname ใน Cloudflare for SaaS (100 hostname แรกฟรี ถัดไป $0.10/เดือน) หรือให้ Caddy/Traefik ออก Let's Encrypt on-demand
4. สถานะ → `active`, อัปเดต cache `host:www.myshop.com`
5. ตั้ง primary domain, ตั้ง redirect จาก `{slug}.rentweb.app` → โดเมนหลัก (301) เพื่อ SEO
6. ถ้า DNS หายไปภายหลัง → แจ้งเตือนร้านและ fallback ไป subdomain

### 3.4 สถานะของ tenant ที่ middleware ต้องรู้จัก

`trialing` → `active` → `past_due` (ยังเปิดอยู่ + แบนเนอร์เตือนในหลังบ้าน) → `suspended` (หน้าร้านปิด, หลังบ้านเข้าได้เฉพาะหน้าชำระเงิน) → `cancelled` (เก็บข้อมูล 30 วัน) → `deleted`

## 4. ตัวตนและสิทธิ์ (Identity & Access)

มีผู้ใช้ 3 กลุ่มที่ **ต้องแยกระบบ login กัน**:

| กลุ่ม | ระบบ auth | ขอบเขต | วิธี login |
|---|---|---|---|
| Superadmin (คุณ) | Platform auth, บังคับ 2FA | ทุก tenant, มี audit ทุกการกระทำ | อีเมล+รหัสผ่าน+TOTP, จำกัด IP ได้ |
| Tenant member | Platform auth (บัญชีเดียวอยู่ได้หลาย tenant ผ่าน `tenant_members`) | เฉพาะ tenant ที่เป็นสมาชิก ตาม role | อีเมล/รหัสผ่าน, Google, LINE Login; 2FA เปิดได้ |
| Customer (ลูกค้าของร้าน) | **Customer auth แยกต่อ tenant** — unique ที่ `(tenant_id, email/phone)` | เฉพาะร้านนั้น; อีเมลเดียวสมัครได้หลายร้าน | เบอร์โทร OTP, LINE Login (นิยมสุดในไทย), อีเมล magic link, guest checkout |

Role ของ tenant member: `owner` (คนเดียว, จัดการบิล/ลบร้าน) · `admin` · `manager` (ออเดอร์/สินค้า/ลูกค้า) · `staff` (เฉพาะงานที่มอบหมาย เช่น ครัว, หมอคนนั้น) · `viewer` · โมดูลเพิ่ม permission ย่อยได้ เช่น `clinic.records.read`

เหตุผลที่ไม่รวม customer เข้า auth เดียวกับ tenant member: user pool ส่วนใหญ่บังคับอีเมลไม่ซ้ำทั้งระบบ แต่ในโลกจริง "สมชาย" ต้องสมัครที่ร้าน A และร้าน B แยกกันได้ และข้อมูลลูกค้าเป็นทรัพย์สินของแต่ละร้าน (PDPA: ร้านคือ data controller)

## 5. Data model

### 5.1 ข้อตกลง (conventions)

- Primary key: `uuid` (v7 เพื่อเรียงตามเวลา) — ไม่ใช้เลขรันเพราะเดาจำนวนออเดอร์ของร้านอื่นได้
- ทุกตารางของ tenant: `tenant_id uuid not null references tenants(id)`, `created_at`, `updated_at`, (`deleted_at` สำหรับ soft delete)
- Index: ขึ้นต้นด้วย `tenant_id` เสมอ เช่น `(tenant_id, slug)`, `(tenant_id, created_at desc)`
- Unique constraint ต้องรวม `tenant_id` เช่น `unique (tenant_id, sku)`
- ค่าเงิน: `bigint` หน่วยสตางค์ + `currency char(3)` (ไม่ใช้ float)
- เวลา: `timestamptz` เสมอ, แสดงผลด้วย timezone ของ tenant (ค่าเริ่มต้น `Asia/Bangkok`)
- ฟิลด์ยืดหยุ่น: `jsonb` พร้อม zod schema ฝั่งแอป (เช่น theme, settings, section props)

### 5.2 ตาราง core (ของแพลตฟอร์ม)

```
tenants              id, slug, name, site_type, plan_id, status, locale, timezone, currency,
                     settings jsonb, theme jsonb, onboarding jsonb, trial_ends_at, created_at
tenant_domains       id, tenant_id, hostname, kind(subdomain|custom), is_primary,
                     verification_token, status(pending|verifying|active|failed), ssl_status, verified_at
tenant_modules       tenant_id, module_key, enabled, config jsonb, enabled_at
tenant_members       tenant_id, user_id, role, permissions jsonb, invited_by, joined_at
tenant_secrets       tenant_id, key, ciphertext, iv, key_version       -- API key ของ gateway ฯลฯ
tenant_quotas_usage  tenant_id, metric, period, value                   -- สินค้า, storage, orders
users                id, email, phone, name, avatar, password_hash?, mfa_secret?, last_login_at
plans                id, key, name, price_monthly, price_yearly, limits jsonb, modules_allowed text[]
subscriptions        id, tenant_id, plan_id, provider, provider_sub_id, status, current_period_end
invoices             id, tenant_id, number, amount, vat, status, pdf_url, paid_at
templates            id, key, name, site_type, modules text[], theme_preset, pages_seed jsonb, data_seed_ref
audit_logs           id, tenant_id?, actor_type, actor_id, action, target, diff jsonb, ip, ua, at
events_outbox        id, tenant_id, type, payload jsonb, status, attempts, next_run_at   -- ส่งต่อให้ worker
webhook_endpoints    id, tenant_id, url, secret, events text[], active
notifications        id, tenant_id, channel, to, template, payload, status, provider_msg_id
```

### 5.3 ตาราง content/theme (โมดูล CMS — ทุกเว็บมี)

```
pages                id, tenant_id, slug, title, status(draft|published), seo jsonb,
                     sections jsonb (draft), published_sections jsonb, published_at
navigation           id, tenant_id, location(header|footer), items jsonb
media                id, tenant_id, key, url, mime, size, width, height, alt, folder
forms / form_submissions
posts (blog)         id, tenant_id, slug, title, body, cover, status, published_at
```

### 5.4 ตารางของโมดูลธุรกิจ (สรุป — รายละเอียดใน 02)

```
Commerce : categories, products, product_variants, inventory_levels, carts, orders, order_items,
           payments, shipments, discounts, reviews
Booking  : services, staff, staff_services, availability_rules, time_off, bookings, booking_items,
           deposits, booking_policies
Top-up   : games, game_packages, suppliers, supplier_products, code_stock, topup_orders,
           wallets, wallet_transactions, fraud_flags
Restaurant: menus, menu_categories, menu_items, modifiers, tables, table_sessions, rest_orders,
           kitchen_tickets, reservations
Clinic   : patients, patient_consents, appointments(ใช้ bookings), visits, treatment_notes(เข้ารหัส),
           packages, package_usages
Rental   : rental_units, rate_plans, availability, rental_bookings, deposits
LMS      : courses, lessons, enrollments, progress
Events   : events, ticket_types, tickets, checkins
Listings : listings, listing_attributes, inquiries
Customers (ใช้ร่วม): customers, customer_addresses, customer_sessions, loyalty_points
```

### 5.5 Row Level Security — ตัวอย่างจริง

```sql
-- 1) role ที่แอปใช้ต่อ DB ต้องไม่มี BYPASSRLS และไม่ใช่เจ้าของตาราง
create role app_user login password '...';
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;

-- 2) ทุกตารางของ tenant
alter table products enable row level security;
alter table products force row level security;   -- บังคับแม้เจ้าของตาราง

create policy tenant_isolation on products
  for all
  using      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 3) ตารางที่ superadmin ต้องอ่านข้ามร้าน ใช้ role แยก (app_admin) + audit ทุกครั้ง
```

ฝั่งแอป (Drizzle) ทุก query ผ่าน helper เดียว:

```ts
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`); // true = เฉพาะ transaction นี้
    return fn(tx);
  });
}
// ใช้: await withTenant(ctx.tenantId, tx => tx.select().from(products))
```

หลักการ: **โค้ดแอปยังต้อง filter `tenant_id` เองทุกครั้ง** (ชัดเจน + ใช้ index) ส่วน RLS เป็น "ตาข่ายนิรภัย" ชั้นที่สองเมื่อมีคนลืม และต้องมี **automated test**: สร้าง tenant A, B → login เป็น A → พยายามอ่าน/แก้ทุก resource ของ B ผ่านทุก endpoint → ต้องได้ 404/403 ทั้งหมด (รันใน CI ทุก PR)

### 5.6 Migration strategy

- ใช้ Drizzle migrations เก็บใน repo, รันใน CI ก่อน deploy (expand → deploy → contract)
- ห้าม migration ที่ lock ตารางใหญ่นาน (เพิ่มคอลัมน์แบบ nullable, สร้าง index แบบ `concurrently`)
- ทุก migration ต้อง backward-compatible 1 เวอร์ชัน เพื่อ rollback แอปได้โดยไม่ต้อง rollback DB
- Seed แยก: `seed:platform` (plans, templates) กับ `seed:tenant` (ข้อมูลตัวอย่างตอนสร้างร้าน)

## 6. Theme & Customization engine (สิ่งที่ลูกค้า "แก้เอง" ได้)

### 6.1 ระดับการปรับแต่ง (จากง่ายไปยาก)

| ระดับ | ลูกค้าทำอะไรได้ | แพ็กเกจ |
|---|---|---|
| 1 Brand | โลโก้, favicon, OG image, ชื่อร้าน, ข้อมูลติดต่อ, โซเชียล | ทุกแพ็กเกจ |
| 2 Design tokens | สีหลัก/รอง/เน้น/พื้นหลัง/ตัวอักษร, ฟอนต์หัวข้อ/เนื้อหา (ฟอนต์ไทย), มุมโค้ง, ระยะห่าง, โหมดมืด | ทุกแพ็กเกจ |
| 3 Layout presets | สไตล์ header (กลาง/ซ้าย/โปร่งใส), การ์ดสินค้า, ปุ่ม (เหลี่ยม/โค้ง/แคปซูล), footer | ทุกแพ็กเกจ |
| 4 Page builder | เพิ่ม/ลบ/เรียง sections ในแต่ละหน้า, แก้ข้อความ/รูป/ลิงก์ใน section, สร้างหน้าใหม่ | ทุกแพ็กเกจ (จำกัดจำนวนหน้าตามแพ็กเกจ) |
| 5 Theme preset switch | สลับธีมสำเร็จรูป (Minimal, Bold, Elegant, Playful, Dark Gaming ...) โดยเนื้อหาคงเดิม | ทุกแพ็กเกจ / ธีมพรีเมียมเสียเงิน |
| 6 Custom CSS | ใส่ CSS เพิ่ม (sanitize, จำกัด selector) | Business ขึ้นไป |
| 7 Custom code | **ไม่ให้** (ความปลอดภัย/การดูแล) — ใช้ webhooks/API แทน | — |

### 6.2 โครงสร้าง theme ของ tenant (เก็บใน `tenants.theme`)

```json
{
  "preset": "minimal",
  "mode": "light",
  "colors": {
    "primary": "#0F766E", "primaryForeground": "#FFFFFF",
    "secondary": "#F1F5F9", "accent": "#F59E0B",
    "background": "#FFFFFF", "foreground": "#0F172A",
    "muted": "#64748B", "border": "#E2E8F0"
  },
  "fonts": { "heading": "Prompt", "body": "Sarabun" },
  "radius": "lg",
  "density": "comfortable",
  "layout": { "header": "centered", "productCard": "soft", "button": "pill", "footer": "columns" },
  "brand": { "logo": "media:…", "logoDark": "media:…", "favicon": "media:…", "ogImage": "media:…" },
  "customCss": null
}
```

การเรนเดอร์: server component อ่าน theme → สร้าง CSS variables ใส่ `<html style="--color-primary: …">` → Tailwind ใช้ `bg-[var(--color-primary)]` ผ่าน token classes (`bg-primary`) → **ไม่ต้อง build ใหม่ต่อร้าน** · สีที่ต้องคำนวณ (hover, สีอ่อน/เข้ม) คำนวณจาก primary ด้วย OKLCH ฝั่ง server · ฟอนต์ไทยโหลดผ่าน `next/font/google` พร้อม subset `thai, latin` (Prompt, Kanit, Sarabun, Noto Sans Thai, IBM Plex Sans Thai, Mitr, Bai Jamjuree, Anuphan)

### 6.3 Page builder แบบ Sections

หน้าเว็บ = ลิสต์ของ sections ที่มี type + props เก็บเป็น JSON:

```json
[
  { "id": "s1", "type": "hero", "props": { "heading": "…", "sub": "…", "image": "media:…", "cta": { "label": "ช้อปเลย", "href": "/products" }, "variant": "split" } },
  { "id": "s2", "type": "product-grid", "props": { "source": "collection:best-sellers", "limit": 8, "columns": 4 } },
  { "id": "s3", "type": "features", "props": { "items": [ { "icon": "truck", "title": "ส่งฟรี" } ] } },
  { "id": "s4", "type": "testimonials", "props": { "items": [ … ] } },
  { "id": "s5", "type": "faq", "props": { "items": [ … ] } },
  { "id": "s6", "type": "contact", "props": { "showMap": true, "lineId": "@myshop" } }
]
```

- Section registry: core sections (hero, text, image+text, gallery, features, testimonials, faq, cta, contact/map, pricing, team, logos, video, html-embed ที่ sanitize) + sections ที่โมดูลเพิ่มให้ (product-grid, booking-widget, game-list, menu-list, room-search, course-list)
- แต่ละ section มี zod schema → หลังบ้านสร้างฟอร์มแก้ไขอัตโนมัติ + preview สดใน iframe (postMessage)
- Draft/Publish แยกกัน, เก็บประวัติ 20 เวอร์ชันล่าสุดเพื่อย้อนกลับ
- ความรับผิดชอบ responsive/accessibility อยู่ที่ section component ไม่ใช่ลูกค้า

### 6.4 Media pipeline

อัปโหลดจากเบราว์เซอร์ → presigned URL ไป R2 โดยตรง (ไม่ผ่านเซิร์ฟเวอร์) → worker ตรวจ mime/ขนาด, สร้าง variants (thumb/md/lg, WebP/AVIF), ดึง dimension → บันทึก `media` → เสิร์ฟผ่าน Cloudflare CDN (`cdn.rentweb.app/t/{tenant}/...`) · ไฟล์ส่วนตัว (เช่น ไฟล์ดิจิทัลที่ขาย, เวชระเบียน) อยู่ bucket แยก เข้าถึงด้วย signed URL อายุสั้น · โควต้า storage ต่อแพ็กเกจ

## 7. ระบบโมดูล (Module system)

ทุกโมดูลประกาศตัวเองผ่าน manifest มาตรฐาน แพลตฟอร์มประกอบหลังบ้าน/หน้าร้านจาก manifest ของโมดูลที่ tenant เปิดอยู่:

```ts
export interface ModuleManifest {
  key: "commerce" | "booking" | "topup" | "restaurant" | "clinic" | "rental" | "lms" | "events" | "listings" | "membership";
  name: { th: string; en: string };
  version: string;
  dependsOn?: ModuleKey[];                 // เช่น clinic ต้องการ booking
  settingsSchema: z.ZodTypeAny;            // ค่าตั้งค่าต่อ tenant (เช่น สกุลเงิน, นโยบายยกเลิก)
  quotas?: Record<string, number>;         // ค่าเริ่มต้นของโควต้าที่แพ็กเกจ override ได้
  admin: { nav: NavItem[]; routes: RouteDef[]; dashboardWidgets: Widget[] };
  storefront: { routes: RouteDef[]; sections: SectionDef[]; accountTabs: TabDef[] };
  events: { emits: string[]; handles: Record<string, EventHandler> };
  jobs?: CronJobDef[];
  permissions: string[];
  onEnable?(ctx: TenantCtx): Promise<void>;  // seed, สร้างค่าเริ่มต้น
  onDisable?(ctx: TenantCtx): Promise<void>;
}
```

- ตาราง `tenant_modules` บอกว่าร้านไหนเปิดอะไร; แพ็กเกจกำหนด `modules_allowed`
- Storefront route tree: `/_sites/[tenant]/(core)/...` + โมดูลประกาศ route ของตัวเอง (`/products/[slug]`, `/book`, `/topup/[game]`, `/menu`, `/rooms`) — route ที่โมดูลปิดอยู่ตอบ 404
- หลังบ้าน: เมนูซ้ายประกอบจาก `admin.nav` ของโมดูลที่เปิด
- เทมเพลตคือ `{ modules: [...], themePreset, pages, seed }` — การเพิ่ม "ประเภทเว็บใหม่" = เพิ่มเทมเพลต ไม่ใช่โค้ดใหม่ ตราบใดที่โมดูลมีอยู่แล้ว

## 8. เหตุการณ์และงานเบื้องหลัง (Events, queue, cron)

- ทุกการเปลี่ยนแปลงสำคัญเขียน **domain event** ลง `events_outbox` ใน transaction เดียวกับข้อมูล (outbox pattern) → worker อ่านไปทำงานต่อ (รับประกันไม่หาย)
- ตัวอย่าง event → งาน:
  - `order.paid` → ตัดสต็อก, ส่ง LINE/อีเมลให้ลูกค้าและร้าน, เรียก webhook ของร้าน
  - `topup.paid` → เรียก supplier API เติมเกม → `topup.fulfilled`/`topup.failed` (คืนเงินเข้า wallet อัตโนมัติ)
  - `booking.created` → ยืนยัน + ตั้ง reminder 24 ชม. และ 1 ชม. ก่อนนัด
  - `payment.slip_uploaded` → ตรวจสลิปผ่าน API → อนุมัติ/ส่งให้ร้านตรวจเอง
  - `domain.requested` → ตรวจ DNS ซ้ำจนผ่าน
  - `subscription.past_due` → แจ้งเตือน วันที่ 1, 3, 7 → `suspended` วันที่ 10
- Cron: สรุปยอดรายวันให้ร้าน, วัดการใช้งาน (quota), ออกใบแจ้งหนี้, ล้าง cart เก่า, ลบ tenant ที่ cancelled เกิน 30 วัน, สำรอง export
- เครื่องมือ: BullMQ บน Redis (worker Node แยก, deploy บน Railway/Fly/VPS) หรือ Inngest/Trigger.dev (ไม่ต้องดูแล worker เอง) — ดู 03
- ทุก job: idempotent (มี idempotency key), retry แบบ exponential, dead-letter queue, มี `tenant_id`

## 9. Cache และประสิทธิภาพ

| จุด | วิธี |
|---|---|
| hostname → tenant | Redis, TTL 5 นาที, ลบทันทีเมื่อ domain/status เปลี่ยน (หรือ Vercel Edge Config สำหรับ read ที่ edge) |
| tenant config (theme, modules, settings) | Redis + in-memory ต่อ instance (10 วินาที) |
| หน้าร้าน | Next.js ISR + cache tags `tenant:{id}`, `tenant:{id}:product:{pid}` → revalidate เมื่อแก้ในหลังบ้าน; หน้าที่มี cart/ผู้ใช้ render แบบ dynamic เฉพาะส่วน |
| รูป | R2 + Cloudflare CDN, `next/image` ชี้ไป loader ของ CDN (ลด bandwidth ของ Vercel ซึ่งแพง) |
| DB | connection pooler (Supavisor/PgBouncer) เพราะ serverless เปิด connection เยอะ; query ที่ hot ต้องมี index `(tenant_id, …)` |
| Noisy neighbor | rate limit ต่อ tenant และต่อ IP (Upstash Ratelimit), job queue แยก priority ตามแพ็กเกจ, quota หยุดเมื่อเกิน |
| การค้นหา | Postgres full-text + `pg_trgm` ก่อน; ย้ายไป Meilisearch/Typesense เมื่อร้านมีสินค้าหลักหมื่น |

## 10. ความปลอดภัยและการแยกข้อมูล — เช็กลิสต์

- [ ] RLS เปิดและ `force` ทุกตารางที่มี `tenant_id`; role ของแอปไม่มี BYPASSRLS
- [ ] Integration test ข้าม tenant รันทุก PR (สร้าง A/B แล้วยิงทุก endpoint)
- [ ] ทุก service function รับ `TenantCtx` เป็นพารามิเตอร์แรก (lint rule ห้ามเรียก `db` ตรง ๆ นอก repository layer)
- [ ] Secrets ของร้านเข้ารหัสด้วย key ที่หมุนได้ (`key_version`), ไม่ log, แสดงแค่ 4 ตัวท้าย
- [ ] Webhook ขาเข้า (gateway, LINE, supplier) ตรวจลายเซ็น + idempotency
- [ ] CSRF (Server Actions มี origin check; เพิ่ม token สำหรับ form สาธารณะ), CSP, security headers, sanitize HTML ทุกจุดที่ลูกค้าพิมพ์
- [ ] อัปโหลด: จำกัดชนิด/ขนาด, สแกน mime จริง, ไม่เสิร์ฟจากโดเมนเดียวกับแอป (ใช้ cdn.)
- [ ] 2FA บังคับสำหรับ superadmin, แนะนำสำหรับ owner; จำกัดความพยายาม login
- [ ] Impersonation (คุณเข้าไปดูหลังบ้านร้านลูกค้า) ต้องขอเหตุผล, จำกัดเวลา, บันทึก audit, แสดงแบนเนอร์
- [ ] Audit log ทุกการแก้ไขสำคัญ (ราคา, การเงิน, สิทธิ์, โดเมน, การส่งออกข้อมูล)
- [ ] ข้อมูลอ่อนไหว (เวชระเบียน) เข้ารหัสระดับฟิลด์ + access log แยก
- [ ] Backup รายวัน + PITR; ทดสอบ restore ทุกไตรมาส; เป้าหมาย RPO ≤ 1 ชม., RTO ≤ 4 ชม.
- [ ] Export ข้อมูลรายร้าน (JSON/CSV + รูป) เพื่อ PDPA และการย้ายออก
- [ ] Dependency scanning, secret scanning ใน CI; env แยก dev/staging/prod; ไม่มี prod credentials บนเครื่องนักพัฒนา

## 11. สภาพแวดล้อมและการ deploy

| Env | ใช้ทำอะไร | ข้อมูล |
|---|---|---|
| local | พัฒนา (Supabase CLI local หรือ Docker Postgres + Redis) | seed |
| preview | ทุก PR ได้ URL ของตัวเอง (Vercel Preview) + Neon/Supabase branch | seed |
| staging | ทดสอบก่อนปล่อย, ทดสอบ migration กับสำเนาข้อมูล (anonymized) | สำเนา |
| production | ลูกค้าจริง | จริง |

- Deploy: push → CI (lint, typecheck, unit, isolation tests) → migration → deploy → smoke test → แจ้ง
- Feature flags ต่อ tenant (ตาราง `tenant_modules.config` หรือ PostHog flags) เพื่อปล่อยทีละร้าน
- Observability: Sentry (error + tracing, tag `tenant_id`), log รวมศูนย์ (Axiom/Better Stack), uptime check ทุกโดเมนหลัก, status page

## 12. เส้นทางการขยาย (Scaling path)

| ช่วง | จำนวน tenant | สิ่งที่ทำ |
|---|---|---|
| 1 | 0–300 | 1 region (สิงคโปร์), Supabase Pro + compute Small/Medium, Vercel Pro, Redis 1 ตัว |
| 2 | 300–2,000 | เพิ่ม compute DB, read replica สำหรับรายงาน, แยก worker เป็นหลาย queue, ย้ายรูปทั้งหมดไป CDN, พิจารณาย้ายแอปไป container (ลดค่า bandwidth/compute ของ Vercel) |
| 3 | 2,000+ หรือมีลูกค้าองค์กร | **Cell architecture**: หลาย "cell" (แอป+DB ชุดหนึ่ง) แต่ละ cell รับ N tenant; ตาราง routing กลางบอกว่า tenant อยู่ cell ไหน; ลูกค้าองค์กร/โรงพยาบาลได้ cell หรือ DB ของตัวเอง (hybrid) และเลือก region กรุงเทพฯ (AWS ap-southeast-7 / Google Cloud Bangkok) เพื่อ data residency |

การย้าย tenant ระหว่าง cell = export (ข้อมูล + ไฟล์) → import → สลับ routing → ตรวจสอบ → ลบต้นทาง ซึ่งเป็นไปได้เพราะทุก query ผูกกับ `tenant_id` ตั้งแต่ต้น
