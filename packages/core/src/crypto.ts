import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("SECRETS_ENCRYPTION_KEY is required in production");
    // deterministic dev key so local data survives restarts
    return createHash("sha256").update("rentweb-dev-only-key").digest();
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("SECRETS_ENCRYPTION_KEY must be 32 bytes (base64)");
  return buf;
}

export interface Encrypted {
  ciphertext: string; // base64(authTag + data)
  iv: string; // base64
  keyVersion: number;
}

export function encrypt(plain: string, keyVersion = 1): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([tag, data]).toString("base64"), iv: iv.toString("base64"), keyVersion };
}

export function decrypt(enc: { ciphertext: string; iv: string }): string {
  const buf = Buffer.from(enc.ciphertext, "base64");
  const tag = buf.subarray(0, 16);
  const data = buf.subarray(16);
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Compact single-string form used for columns like code_encrypted. */
export function encryptToString(plain: string): string {
  const e = encrypt(plain);
  return `v${e.keyVersion}.${e.iv}.${e.ciphertext}`;
}

export function decryptFromString(value: string): string {
  const [, iv, ciphertext] = value.split(".");
  if (!iv || !ciphertext) throw new Error("malformed encrypted value");
  return decrypt({ iv, ciphertext });
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** 6-digit numeric OTP from the CSPRNG (never Math.random – login codes must be unpredictable). */
export function randomOtp(): string {
  return String(randomInt(100000, 1000000));
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
