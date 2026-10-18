/**
 * RFC 5545 calendar file for a ticket order / ticket (server-safe, no React or Next imports).
 * Used by the storefront .ics download route and reusable by notification e-mails.
 */

/** "20261107T120000Z" */
export function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545 line folding (75 octets) – counts bytes so Thai text folds without splitting a UTF-8 sequence. */
export function icsFold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    let end = Math.min(i + (out.length ? 74 : 75), bytes.length);
    while (end < bytes.length && end > i && (bytes[end]! & 0xc0) === 0x80) end--;
    out.push((out.length ? " " : "") + bytes.subarray(i, end).toString("utf8"));
    i = end;
  }
  return out.join("\r\n");
}

export interface IcsEventInput {
  /** stable id, e.g. `${orderId}@host` */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  url?: string | null;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  /** minutes before start for the reminder (default 120) */
  alarmMinutes?: number;
  alarmText?: string | null;
  now?: Date;
}

/** One VEVENT calendar (METHOD:PUBLISH) as text/calendar content. */
export function buildIcs(ev: IcsEventInput): string {
  const alarm = ev.alarmMinutes ?? 120;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RentWeb//Events//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${icsStamp(ev.now ?? new Date())}`,
    `DTSTART:${icsStamp(ev.start)}`,
    `DTEND:${icsStamp(ev.end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : null,
    ev.location ? `LOCATION:${esc(ev.location)}` : null,
    ev.url ? `URL:${ev.url}` : null,
    `STATUS:${ev.status ?? "CONFIRMED"}`,
    alarm > 0 ? "BEGIN:VALARM" : null,
    alarm > 0 ? `TRIGGER:-PT${alarm}M` : null,
    alarm > 0 ? "ACTION:DISPLAY" : null,
    alarm > 0 ? `DESCRIPTION:${esc(ev.alarmText ?? ev.title)}` : null,
    alarm > 0 ? "END:VALARM" : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => !!l);
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
