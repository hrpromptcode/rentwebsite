import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage abstraction. Development: files land in apps/web/public/uploads (served by Next).
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

function localRoot(): string {
  return process.env.LOCAL_UPLOAD_DIR ?? path.resolve(process.cwd(), "public/uploads");
}

class LocalStorage implements Storage {
  async put(key: string, body: Buffer | Uint8Array, mime: string): Promise<StoredObject> {
    const file = path.join(localRoot(), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return { key, url: this.publicUrl(key), size: body.byteLength, mime };
  }
  async delete(key: string) {
    await unlink(path.join(localRoot(), key)).catch(() => {});
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

/** tenants/{tenantId}/{folder}/{timestamp}-{random}.{ext} */
export function objectKey(tenantId: string, folder: string, filename: string): string {
  const ext = (filename.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const rand = Math.random().toString(36).slice(2, 10);
  return `tenants/${tenantId}/${folder}/${Date.now()}-${rand}.${ext}`;
}

export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"]);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
