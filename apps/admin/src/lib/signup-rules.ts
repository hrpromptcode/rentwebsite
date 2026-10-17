/**
 * Account name / password rules (ADMIN_B2-08). Pure: used by the sign-up form (instant feedback) and by the
 * Better Auth before-hook in auth-config.ts, which is what actually enforces them for every API caller.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 120;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const PASSWORD_HINT = `อย่างน้อย ${PASSWORD_MIN} ตัวอักษร มีทั้งตัวอักษรและตัวเลข (หรือสัญลักษณ์)`;

/** A few of the most common leaked passwords (lower-cased) that satisfy the length rule. */
const COMMON = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "87654321",
  "11111111",
  "00000000",
  "password",
  "password1",
  "password123",
  "passw0rd",
  "qwerty123",
  "qwertyui",
  "qwertyuiop",
  "1q2w3e4r",
  "1qaz2wsx",
  "abc12345",
  "abcd1234",
  "a1234567",
  "aa123456",
  "iloveyou",
  "admin123",
  "admin1234",
  "welcome1",
  "letmein1",
  "rentweb1",
  "rentweb123",
]);

/** Normalises a display name: trims, collapses inner whitespace; returns an error message when invalid. */
export function checkName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "กรุณากรอกชื่อของคุณ" };
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN) return { ok: false, error: "กรุณากรอกชื่อของคุณ (อย่างน้อย 2 ตัวอักษร)" };
  if (name.length > NAME_MAX) return { ok: false, error: `ชื่อยาวเกินไป (ไม่เกิน ${NAME_MAX} ตัวอักษร)` };
  return { ok: true, name };
}

/** Returns a Thai error message, or null when the password is acceptable. */
export function checkPassword(raw: unknown, ctx: { email?: string; name?: string } = {}): string | null {
  if (typeof raw !== "string" || raw.length === 0) return "กรุณาตั้งรหัสผ่าน";
  if (raw.trim().length === 0) return "รหัสผ่านต้องไม่เป็นช่องว่างล้วน";
  if (raw.length < PASSWORD_MIN) return `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`;
  if (raw.length > PASSWORD_MAX) return `รหัสผ่านยาวเกินไป (ไม่เกิน ${PASSWORD_MAX} ตัวอักษร)`;
  const pw = raw.trim().toLowerCase();
  if (new Set(pw).size <= 2) return "รหัสผ่านเดาง่ายเกินไป (ใช้ตัวอักษรซ้ำ ๆ)";
  if (COMMON.has(pw)) return "รหัสผ่านนี้ถูกใช้บ่อยและเดาง่าย กรุณาตั้งใหม่";
  const hasLetter = /\p{L}/u.test(raw);
  const hasDigit = /\p{N}/u.test(raw);
  const hasOther = /[^\p{L}\p{N}\s]/u.test(raw);
  if ([hasLetter, hasDigit, hasOther].filter(Boolean).length < 2) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข (หรือสัญลักษณ์)";
  const local = (ctx.email ?? "").split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && pw.includes(local)) return "รหัสผ่านต้องไม่มีชื่ออีเมลของคุณ";
  const name = (ctx.name ?? "").replace(/\s+/g, "").toLowerCase();
  if (name.length >= 4 && pw.replace(/\s+/g, "") === name) return "รหัสผ่านต้องไม่ตรงกับชื่อของคุณ";
  return null;
}
