import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getStorage, localUploadsDir, objectKey, repoRoot, SLIP_IMAGE_KINDS, sniffImage } from "../src/storage";

/** AC-01 (one shared uploads dir), SEC-008 (magic-byte sniffing, safe extensions), SEC-006 (crypto object keys). */

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001", "hex");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

const envBackup = { UPLOADS_DIR: process.env.UPLOADS_DIR, LOCAL_UPLOAD_DIR: process.env.LOCAL_UPLOAD_DIR };
afterEach(() => {
  for (const [k, v] of Object.entries(envBackup)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("sniffImage (SEC-008)", () => {
  it("recognises raster images by magic bytes only", () => {
    expect(sniffImage(PNG)).toMatchObject({ mime: "image/png", ext: "png" });
    expect(sniffImage(JPEG)).toMatchObject({ mime: "image/jpeg", ext: "jpg" });
    expect(sniffImage(WEBP)).toMatchObject({ mime: "image/webp", ext: "webp" });
    expect(sniffImage(GIF)).toMatchObject({ mime: "image/gif" });
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(HTML)).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });

  it("slips accept only jpg / png / webp", () => {
    expect(sniffImage(PNG, SLIP_IMAGE_KINDS)?.ext).toBe("png");
    expect(sniffImage(GIF, SLIP_IMAGE_KINDS)).toBeNull();
  });
});

describe("objectKey (SEC-006 / SEC-008)", () => {
  it("uses 96-bit crypto randomness and a whitelisted extension", () => {
    const keys = new Set(Array.from({ length: 200 }, () => objectKey("t1", "slips", "slip.png")));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(k).toMatch(/^tenants\/t1\/slips\/\d{13}-[A-Za-z0-9_-]{16}\.png$/);
    expect(objectKey("t1", "media", "x.HTML")).toMatch(/\.bin$/);
    expect(objectKey("t1", "media", "x.svg")).toMatch(/\.svg$/);
    expect(objectKey("t1", "media", "noext")).toMatch(/\.bin$/);
  });
});

describe("local uploads dir (AC-01)", () => {
  it("defaults to <repo>/apps/web/public/uploads regardless of the app's cwd", () => {
    delete process.env.UPLOADS_DIR;
    delete process.env.LOCAL_UPLOAD_DIR;
    expect(existsSync(path.join(repoRoot(), "pnpm-workspace.yaml"))).toBe(true);
    expect(localUploadsDir()).toBe(path.resolve(repoRoot(), "apps/web/public/uploads"));
  });

  it("honours UPLOADS_DIR (relative to the repo root) and refuses keys that escape it", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "rw-uploads-"));
    try {
      process.env.UPLOADS_DIR = dir;
      const stored = await getStorage().put("tenants/t1/slips/a.png", PNG, "image/png");
      expect(stored.url).toBe("/uploads/tenants/t1/slips/a.png");
      expect(readFileSync(path.join(dir, "tenants/t1/slips/a.png")).equals(PNG)).toBe(true);
      await expect(getStorage().put("../escape.png", PNG, "image/png")).rejects.toThrow(/invalid storage key/);
      process.env.UPLOADS_DIR = "tmp/uploads";
      expect(localUploadsDir()).toBe(path.resolve(repoRoot(), "tmp/uploads"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
