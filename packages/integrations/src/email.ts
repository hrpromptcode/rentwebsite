/**
 * Transactional email via Resend's REST API (no SDK needed).
 * Without RESEND_API_KEY the message is logged and reported as "skipped" so flows keep working in dev.
 */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = msg.from ?? process.env.EMAIL_FROM ?? "RentWeb <noreply@rentweb.app>";
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.log(`[email:skipped] to=${Array.isArray(msg.to) ? msg.to.join(",") : msg.to} subject="${msg.subject}"`);
    return { ok: true, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.replyTo }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: json.message ?? `HTTP ${res.status}` };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Minimal branded HTML wrapper for notification emails. */
export function emailLayout(opts: { title: string; bodyHtml: string; brand?: string; accent?: string; footer?: string; cta?: { label: string; href: string } }): string {
  const accent = opts.accent ?? "#2563eb";
  return `<!doctype html><html lang="th"><body style="margin:0;background:#f6f7f9;font-family:Prompt,Segoe UI,Arial,sans-serif;color:#111">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:${accent};color:#fff;padding:20px 28px;font-size:18px;font-weight:600">${escapeHtml(opts.brand ?? "RentWeb")}</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(opts.title)}</h1><div style="font-size:15px;line-height:1.7;color:#374151">${opts.bodyHtml}</div>
${opts.cta ? `<p style="margin:24px 0 0"><a href="${opts.cta.href}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${escapeHtml(opts.cta.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">${escapeHtml(opts.footer ?? "อีเมลนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ")}</td></tr>
</table></td></tr></table></body></html>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
