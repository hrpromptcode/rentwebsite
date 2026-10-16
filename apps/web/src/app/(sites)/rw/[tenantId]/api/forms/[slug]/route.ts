import { and, eq, formSubmissions, forms, type FormField } from "@rentweb/db";
import { emitEvent, normalizeThaiPhone } from "@rentweb/core";
import { tenantTx } from "@/lib/tenant";

/** Only these form slugs may be created lazily on first submission (the storefront contact section). */
const LAZY_FORMS: Record<string, { name: string; fields: FormField[] }> = {
  contact: {
    name: "ฟอร์มติดต่อ",
    fields: [
      { key: "name", label: "ชื่อ", type: "text", required: true },
      { key: "phone", label: "เบอร์โทร", type: "tel", required: true },
      { key: "email", label: "อีเมล", type: "email" },
      { key: "message", label: "ข้อความ", type: "textarea", required: true },
    ],
  },
};

const MAX_BODY_BYTES = 32_000;
const MAX_VALUE_LEN = 5_000;
const MAX_NAME_LEN = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTL_PHONE_RE = /^\+[1-9][0-9]{7,14}$/;

type FieldErrors = Record<string, string>;

/** Thai mobile/landline (0xxxxxxxx[x], +66…) or an international +E.164 number; letters are rejected. */
function validPhone(raw: string): boolean {
  if (!/^[0-9+\-\s().]+$/.test(raw)) return false;
  if (normalizeThaiPhone(raw)) return true;
  return INTL_PHONE_RE.test(raw.replace(/[\s\-().]/g, ""));
}

function fail(status: number, error: string, fields?: FieldErrors) {
  return Response.json(fields ? { error, fields } : { error }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string; slug: string }> }) {
  const { tenantId, slug } = await params;
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return fail(413, "ข้อมูลยาวเกินไป");
  let body: unknown;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    return fail(400, "ข้อมูลไม่ถูกต้อง");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "ข้อมูลไม่ถูกต้อง");
  const input = body as Record<string, unknown>;
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : "");

  // honeypot: pretend success, store nothing
  if (str("website")) return Response.json({ ok: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent");

  const result = await tenantTx(tenantId, async (tx) => {
    let [form] = await tx.select().from(forms).where(and(eq(forms.tenantId, tenantId), eq(forms.slug, slug))).limit(1);
    if (!form) {
      // anonymous visitors must not be able to create arbitrary form definitions (SS-04)
      const lazy = LAZY_FORMS[slug];
      if (!lazy) return { kind: "not_found" as const };
      await tx.insert(forms).values({ tenantId, slug, name: lazy.name, fields: lazy.fields }).onConflictDoNothing();
      [form] = await tx.select().from(forms).where(and(eq(forms.tenantId, tenantId), eq(forms.slug, slug))).limit(1);
      if (!form) return { kind: "not_found" as const };
    }
    if (!form.active) return { kind: "inactive" as const };

    // validate against the form definition (plus the built-in contact keys)
    const defs = new Map<string, FormField>((form.fields ?? []).map((f) => [f.key, f]));
    const required = (k: string) => defs.get(k)?.required ?? false;
    const fields: FieldErrors = {};
    const name = str("name");
    if (!name) fields.name = "กรุณากรอกชื่อ";
    else if (name.length > MAX_NAME_LEN) fields.name = `ชื่อยาวเกิน ${MAX_NAME_LEN} ตัวอักษร`;
    const phone = str("phone");
    if (phone ? !validPhone(phone) : required("phone")) fields.phone = phone ? "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง เช่น 081-234-5678" : "กรุณากรอกเบอร์โทรศัพท์";
    const email = str("email").toLowerCase();
    if (email ? !EMAIL_RE.test(email) || email.length > 254 : required("email")) fields.email = email ? "รูปแบบอีเมลไม่ถูกต้อง" : "กรุณากรอกอีเมล";
    const message = str("message");
    if (!message && (required("message") || !defs.size)) fields.message = "กรุณากรอกข้อความ";
    else if (message.length > MAX_VALUE_LEN) fields.message = `ข้อความยาวเกิน ${MAX_VALUE_LEN} ตัวอักษร`;
    // any other field the owner defined
    const data: Record<string, string> = {};
    for (const [key, def] of defs) {
      if (["name", "phone", "email", "message"].includes(key)) continue;
      const v = str(key);
      if (!v && def.required) fields[key] = `กรุณากรอก${def.label}`;
      else if (v.length > MAX_VALUE_LEN) fields[key] = `${def.label}ยาวเกินไป`;
      else if (v) data[key] = v;
    }
    if (Object.keys(fields).length) return { kind: "invalid" as const, fields };

    // store only known keys – arbitrary extra JSON is dropped
    Object.assign(data, { name, message }, phone ? { phone } : {}, email ? { email } : {});
    const [sub] = await tx.insert(formSubmissions).values({ tenantId, formId: form.id, data, ip, userAgent: ua }).returning({ id: formSubmissions.id });
    await emitEvent(tx, { tenantId, type: "form.submitted", payload: { formId: form.id, submissionId: sub!.id, slug } });
    return { kind: "ok" as const, message: form.successMessage };
  });

  switch (result.kind) {
    case "not_found":
      return fail(404, "ไม่พบฟอร์มนี้");
    case "inactive":
      return fail(410, "ฟอร์มนี้ปิดรับข้อมูลแล้ว");
    case "invalid":
      return fail(400, Object.values(result.fields)[0] ?? "ข้อมูลไม่ถูกต้อง", result.fields);
    default:
      return Response.json({ ok: true, message: result.message ?? null });
  }
}
