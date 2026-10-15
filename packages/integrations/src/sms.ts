/**
 * SMS adapter (ThaiBulkSMS-compatible). Without credentials the message is logged and skipped.
 * Env: SMS_API_KEY, SMS_API_SECRET, SMS_SENDER
 */
export interface SmsResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  id?: string;
}

export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const key = process.env.SMS_API_KEY;
  const secret = process.env.SMS_API_SECRET;
  if (!key || !secret) {
    if (process.env.NODE_ENV !== "production") console.log(`[sms:skipped] to=${to} "${text}"`);
    return { ok: true, skipped: true };
  }
  try {
    const res = await fetch("https://api-v2.thaibulksms.com/sms", {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ msisdn: to, message: text, sender: process.env.SMS_SENDER ?? "RentWeb", force: "corporate" }),
    });
    const json = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { description?: string } };
    if (!res.ok) return { ok: false, error: json.error?.description ?? `HTTP ${res.status}` };
    return { ok: true, id: json.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
