import { and, eq } from "drizzle-orm";
import { notifications, tenantSecrets, type Tx } from "@rentweb/db";
import { decrypt } from "@rentweb/core/crypto";
import { emailLayout, sendEmail } from "./email";
import { linePush, type LineMessage } from "./line";
import { sendSms } from "./sms";

export interface NotifyTarget {
  email?: string | null;
  lineUserId?: string | null;
  phone?: string | null;
}

export interface NotifyContent {
  /** short title (email subject / LINE alt text / SMS prefix) */
  title: string;
  /** plain text (SMS + email text fallback) */
  text: string;
  /** optional richer html body for email */
  html?: string;
  /** optional LINE flex message instead of plain text */
  line?: LineMessage;
  cta?: { label: string; href: string };
}

export interface NotifyOptions {
  tenantId: string | null;
  template: string;
  brand?: string;
  accent?: string;
  /** channels to try, in order of preference; all that have a target are used */
  channels?: Array<"line" | "email" | "sms">;
  payload?: Record<string, unknown>;
}

async function tenantSecret(tx: Tx, tenantId: string, key: string): Promise<string | null> {
  const [row] = await tx.select().from(tenantSecrets).where(and(eq(tenantSecrets.tenantId, tenantId), eq(tenantSecrets.key, key))).limit(1);
  if (!row) return null;
  try {
    return decrypt({ ciphertext: row.ciphertext, iv: row.iv });
  } catch {
    return null;
  }
}

/**
 * Sends a notification over every channel the target supports and records each attempt in `notifications`.
 * Never throws – a failed provider only marks that row as failed.
 */
export async function notify(tx: Tx, target: NotifyTarget, content: NotifyContent, opts: NotifyOptions): Promise<void> {
  const channels = opts.channels ?? ["line", "email", "sms"];
  const brand = opts.brand ?? "RentWeb";

  for (const channel of channels) {
    if (channel === "line" && target.lineUserId && opts.tenantId) {
      const token = await tenantSecret(tx, opts.tenantId, "line_channel_access_token");
      const messages: LineMessage[] = content.line ? [content.line] : [{ type: "text", text: `${content.title}\n${content.text}${content.cta ? `\n${content.cta.href}` : ""}` }];
      const r = await linePush(token, target.lineUserId, messages);
      await record(tx, opts, "line", target.lineUserId, content, r.ok ? (r.skipped ? "skipped" : "sent") : "failed", r.requestId, r.error);
      if (r.ok && !r.skipped) continue; // LINE delivered → still send email receipt but skip SMS
    }
    if (channel === "email" && target.email) {
      const html = emailLayout({ title: content.title, bodyHtml: content.html ?? `<p>${content.text.replace(/\n/g, "<br/>")}</p>`, brand, accent: opts.accent, cta: content.cta });
      const r = await sendEmail({ to: target.email, subject: `${content.title} · ${brand}`, html, text: content.text });
      await record(tx, opts, "email", target.email, content, r.ok ? (r.skipped ? "skipped" : "sent") : "failed", r.id, r.error);
    }
    if (channel === "sms" && target.phone && !target.lineUserId) {
      const r = await sendSms(target.phone, `${brand}: ${content.text}`.slice(0, 160));
      await record(tx, opts, "sms", target.phone, content, r.ok ? (r.skipped ? "skipped" : "sent") : "failed", r.id, r.error);
    }
  }
}

async function record(tx: Tx, opts: NotifyOptions, channel: string, recipient: string, content: NotifyContent, status: string, providerMessageId?: string, error?: string) {
  await tx.insert(notifications).values({
    tenantId: opts.tenantId,
    channel,
    recipient,
    template: opts.template,
    payload: { title: content.title, text: content.text, ...(opts.payload ?? {}) },
    status,
    providerMessageId: providerMessageId ?? null,
    error: error ?? null,
    sentAt: status === "sent" ? new Date() : null,
  });
}
