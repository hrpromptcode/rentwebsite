/** Small formatting helpers shared by server and client components (pure). */

export function timeAgoTh(input: Date | string | number, now = Date.now()): string {
  const t = typeof input === "number" ? input : new Date(input).getTime();
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 45) return "เมื่อสักครู่";
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(diff / 86400)} วันที่แล้ว`;
}

export function dateTimeTh(input: Date | string | null | undefined): string {
  if (!input) return "-";
  const d = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** "STEAM-ABCD-EFGH-IJKL" → "STEAM-••••-••••-IJKL" */
export function maskCode(code: string): string {
  const parts = code.split("-");
  if (parts.length >= 3) return parts.map((p, i) => (i === 0 || i === parts.length - 1 ? p : "•".repeat(p.length))).join("-");
  if (code.length <= 4) return "•".repeat(code.length);
  return `${code.slice(0, 2)}${"•".repeat(Math.max(2, code.length - 4))}${code.slice(-2)}`;
}
