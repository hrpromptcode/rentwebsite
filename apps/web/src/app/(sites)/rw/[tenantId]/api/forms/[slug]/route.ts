import { z } from "zod";
import { and, eq, formSubmissions, forms } from "@rentweb/db";
import { emitEvent } from "@rentweb/core";
import { tenantTx } from "@/lib/tenant";

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  message: z.string().min(1).max(5000),
  website: z.string().max(0).optional(), // honeypot
}).passthrough();

export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string; slug: string }> }) {
  const { tenantId, slug } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const data = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent");

  await tenantTx(tenantId, async (tx) => {
    let [form] = await tx.select().from(forms).where(and(eq(forms.tenantId, tenantId), eq(forms.slug, slug))).limit(1);
    if (!form) {
      [form] = await tx
        .insert(forms)
        .values({
          tenantId,
          slug,
          name: slug === "contact" ? "ฟอร์มติดต่อ" : slug,
          fields: [
            { key: "name", label: "ชื่อ", type: "text", required: true },
            { key: "phone", label: "เบอร์โทร", type: "tel", required: true },
            { key: "email", label: "อีเมล", type: "email" },
            { key: "message", label: "ข้อความ", type: "textarea", required: true },
          ],
        })
        .returning();
    }
    if (!form!.active) throw new Error("form inactive");
    const { website: _hp, ...clean } = data;
    const [sub] = await tx.insert(formSubmissions).values({ tenantId, formId: form!.id, data: clean, ip, userAgent: ua }).returning({ id: formSubmissions.id });
    await emitEvent(tx, { tenantId, type: "form.submitted", payload: { formId: form!.id, submissionId: sub!.id, slug } });
  });

  return Response.json({ ok: true });
}
