import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage abstraction.
 * Development: files land in ONE shared directory — UPLOADS_DIR (or the legacy LOCAL_UPLOAD_DIR; relative
 * paths resolve from the monorepo root), default <repo>/apps/web/public/uploads — no matter which app
 * (storefront, admin, worker, tests) writes them. The storefront serves that folder at /uploads/<key> on
 * every host; the admin shows the same relative URLs through assetUrl() (WEB_URL + url). Both apps send
 * /uploads with X-Content-Type-Options: nosniff and a sandbox CSP (next.config.ts headers).
 * Note: `next start` only serves public/ files that existed at build time — production must use R2.
 * Production: Cloudflare R2 / S3 via the AWS SDK (configured through R2_* env vars).
 */
export interface StoredObject {
  key: string;
  url: string;
  size: number;
  mime: string;
}

export interface Storage {
  put(key: string, body: Buffer | Uint8Array, mime: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

let rootCache: string | null = null;

/** Monorepo root: the nearest ancestor of the working directory that holds pnpm-workspace.yaml. */
export function repoRoot(): string {
  if (rootCache) return rootCache;
  let dir = path.resolve(process.cwd());
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return (rootCache = dir);
    const parent = path.dirname(dir);
    if (parent === dir) return (rootCache = path.resolve(process.cwd()));
    dir = parent;
  }
}

/** The single local uploads directory shared by every app (see module comment). */
export function localUploadsDir(): string {
  const configured = process.env.UPLOADS_DIR || process.env.LOCAL_UPLOAD_DIR;
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(repoRoot(), configured);
  return path.resolve(repoRoot(), "apps/web/public/uploads");
}

function localFile(key: string): string {
  const root = localUploadsDir();
  const file = path.resolve(root, key);
  if (!file.startsWith(root + path.sep)) throw new Error(`invalid storage key "${key}"`);
  return file;
}

class LocalStorage implements Storage {
  async put(key: string, body: Buffer | Uint8Array, mime: string): Promise<StoredObject> {
    const file = localFile(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return { key, url: this.publicUrl(key), size: body.byteLength, mime };
  }
  async delete(key: string) {
    await unlink(localFile(key)).catch(() => {});
  }
  publicUrl(key: string) {
    return `/uploads/${key}`;
  }
}

class R2Storage implements Storage {
  private client: import("@aws-sdk/client-s3").S3Client | null = null;
  private async s3() {
    if (this.client) return this.client;
    const mod = await import("@aws-sdk/client-s3");
    this.client = new mod.S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    });
    return this.client;
  }
  async put(key: string, body: Buffer | Uint8Array, mime: string): Promise<StoredObject> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.s3()).send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, Body: body, ContentType: mime, CacheControl: "public, max-age=31536000, immutable" }));
    return { key, url: this.publicUrl(key), size: body.byteLength, mime };
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.s3()).send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
  }
  publicUrl(key: string) {
    return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
  }
}

let instance: Storage | null = null;
export function getStorage(): Storage {
  if (instance) return instance;
  instance = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL ? new R2Storage() : new LocalStorage();
  return instance;
}

/** Extensions an object key may carry; anything else is stored as .bin (served as a download, never rendered). */
const SAFE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "svg", "pdf", "mp4", "webm", "ico"]);

/**
 * tenants/{tenantId}/{folder}/{timestamp}-{random}.{ext}
 * The random part is 96 bits from crypto.randomBytes, so object URLs are unguessable. Pass the extension
 * derived from sniffed content (e.g. `slip.${sniffImage(buf).ext}`) rather than the client file name.
 */
export function objectKey(tenantId: string, folder: string, filename: string): string {
  const raw = (filename.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const ext = SAFE_EXTENSIONS.has(raw) ? raw : "bin";
  const rand = randomBytes(12).toString("base64url");
  return `tenants/${tenantId}/${folder}/${Date.now()}-${rand}.${ext}`;
}

export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"]);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Payment slips: a phone screenshot or photo of a transfer slip. */
export const MAX_SLIP_BYTES = 8 * 1024 * 1024;

export type SniffedImageKind = "jpeg" | "png" | "webp" | "gif" | "avif";
export interface SniffedImage {
  kind: SniffedImageKind;
  mime: string;
  ext: string;
}

const SNIFFED: Record<SniffedImageKind, SniffedImage> = {
  jpeg: { kind: "jpeg", mime: "image/jpeg", ext: "jpg" },
  png: { kind: "png", mime: "image/png", ext: "png" },
  webp: { kind: "webp", mime: "image/webp", ext: "webp" },
  gif: { kind: "gif", mime: "image/gif", ext: "gif" },
  avif: { kind: "avif", mime: "image/avif", ext: "avif" },
};

const ascii = (buf: Uint8Array, from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));

/**
 * Identifies a raster image by its magic bytes (never by the client-declared MIME type or file name).
 * SVG / HTML / anything else → null. `allow` restricts the accepted kinds (default: all raster kinds).
 */
export function sniffImage(buf: Uint8Array, allow: readonly SniffedImageKind[] = ["jpeg", "png", "webp", "gif", "avif"]): SniffedImage | null {
  let kind: SniffedImageKind | null = null;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) kind = "jpeg";
  else if (buf.length >= 8 && buf[0] === 0x89 && ascii(buf, 1, 4) === "PNG" && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) kind = "png";
  else if (buf.length >= 12 && ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") kind = "webp";
  else if (buf.length >= 6 && (ascii(buf, 0, 6) === "GIF87a" || ascii(buf, 0, 6) === "GIF89a")) kind = "gif";
  else if (buf.length >= 12 && ascii(buf, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(buf, 8, 12))) kind = "avif";
  return kind && allow.includes(kind) ? SNIFFED[kind] : null;
}

/** Slip uploads: JPG, PNG or WebP only. */
export const SLIP_IMAGE_KINDS: readonly SniffedImageKind[] = ["jpeg", "png", "webp"];
