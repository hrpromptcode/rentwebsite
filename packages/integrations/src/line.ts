/**
 * LINE Messaging API (push messages) — each tenant connects its own LINE Official Account;
 * the channel access token is stored encrypted in tenant_secrets under key "line_channel_access_token".
 */
export type LineMessage =
  | { type: "text"; text: string }
  | { type: "flex"; altText: string; contents: Record<string, unknown> };

export interface LinePushResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  requestId?: string;
}

export async function linePush(channelAccessToken: string | null | undefined, to: string, messages: LineMessage[]): Promise<LinePushResult> {
  if (!channelAccessToken) {
    if (process.env.NODE_ENV !== "production") console.log(`[line:skipped] to=${to} ${messages.map((m) => (m.type === "text" ? m.text : m.altText)).join(" | ")}`);
    return { ok: true, skipped: true };
  }
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { authorization: `Bearer ${channelAccessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    return { ok: true, requestId: res.headers.get("x-line-request-id") ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A compact, good-looking Flex "receipt" bubble used for orders, bookings and top-ups. */
export function flexReceipt(opts: {
  brand: string;
  title: string;
  subtitle?: string;
  rows: Array<{ label: string; value: string; bold?: boolean }>;
  footerNote?: string;
  button?: { label: string; uri: string };
  color?: string;
}): LineMessage {
  const color = opts.color ?? "#2563EB";
  return {
    type: "flex",
    altText: `${opts.brand}: ${opts.title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: color,
        paddingAll: "16px",
        contents: [
          { type: "text", text: opts.brand, color: "#FFFFFFCC", size: "xs" },
          { type: "text", text: opts.title, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true },
          ...(opts.subtitle ? [{ type: "text", text: opts.subtitle, color: "#FFFFFFCC", size: "sm", wrap: true }] : []),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: opts.rows.map((r) => ({
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: r.label, size: "sm", color: "#6B7280", flex: 3 },
            { type: "text", text: r.value, size: "sm", align: "end", flex: 5, wrap: true, weight: r.bold ? "bold" : "regular" },
          ],
        })),
      },
      footer:
        opts.button || opts.footerNote
          ? {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                ...(opts.footerNote ? [{ type: "text", text: opts.footerNote, size: "xs", color: "#6B7280", wrap: true }] : []),
                ...(opts.button ? [{ type: "button", style: "primary", color, action: { type: "uri", label: opts.button.label, uri: opts.button.uri } }] : []),
              ],
            }
          : undefined,
    },
  };
}
