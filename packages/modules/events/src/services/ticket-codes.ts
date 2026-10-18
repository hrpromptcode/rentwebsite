/** Ticket-code string helpers. Pure and client-safe (the gate UI uses them to detect a complete code / scanned payload). */

/** 32 symbols, no 0/O/1/I: safe to read out loud and type at the door. 12 symbols = 60 bits. */
export const TICKET_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TICKET_CODE_LEN = 12;
export const TICKET_QR_PREFIX = "RWT1";

/** "ABCD-EFGH-JKLM" */
export function formatTicketCode(raw: string): string {
  const s = raw.replace(/[^A-Z0-9]/g, "").toUpperCase();
  return s.match(/.{1,4}/g)?.join("-") ?? s;
}

/** Normalises what a human typed ("abcd efgh jklm", "ABCDEFGHJKLM") to the stored form; null when it cannot be a code. */
export function normalizeTicketCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== TICKET_CODE_LEN) return null;
  return formatTicketCode(s);
}

export function isSignedTicketPayload(s: string | null | undefined): boolean {
  return !!s && s.trim().startsWith(`${TICKET_QR_PREFIX}.`);
}
