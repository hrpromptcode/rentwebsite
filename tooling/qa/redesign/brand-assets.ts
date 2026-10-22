import path from "node:path";
import { createRequire } from "node:module";

/**
 * PromptCode brand assets for the platform site (tooling/qa/redesign/platform-light.md):
 *   cd tooling && pnpm exec tsx qa/redesign/brand-assets.ts
 * Reads apps/web/public/brand/promptcode-logo-source.png (opaque light-grey background) and writes, with a TRANSPARENT
 * background (colour-distance alpha against a fitted background model, edge colours decontaminated → no grey halo):
 *   brand/promptcode-mark.png|.webp   the 3-shape mark only, tightly cropped, 512 px tall
 *   brand/promptcode-logo.png|.webp   mark + "PROMPTCODE / AFFORDABLE DEVELOPMENT", 1024 px wide
 *   tooling/screenshots/pf-brand-check.png   both on white and on a dark slate (halo check)
 */
const req = createRequire(path.resolve(process.cwd(), "../apps/web/node_modules/next/package.json"));
const sharp = req("sharp") as typeof import("sharp");
const BRAND = path.resolve(process.cwd(), "../apps/web/public/brand");
const SRC = path.join(BRAND, "promptcode-logo-source.png");

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const px = (x: number, y: number) => (y * W + x) * 3;

// 1. background model: per 32px cell median of low-chroma light pixels, holes filled from neighbours, bilinear upsample
const CELL = 32;
const GW = Math.ceil(W / CELL);
const GH = Math.ceil(H / CELL);
const grid: ([number, number, number] | null)[] = new Array(GW * GH).fill(null);
for (let gy = 0; gy < GH; gy++)
  for (let gx = 0; gx < GW; gx++) {
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (let y = gy * CELL; y < Math.min(H, (gy + 1) * CELL); y++)
      for (let x = gx * CELL; x < Math.min(W, (gx + 1) * CELL); x++) {
        const i = px(x, y);
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        if (Math.max(r, g, b) - Math.min(r, g, b) < 10 && r + g + b > 600) {
          rs.push(r);
          gs.push(g);
          bs.push(b);
        }
      }
    if (rs.length > CELL * CELL * 0.35) {
      const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]!;
      grid[gy * GW + gx] = [med(rs), med(gs), med(bs)];
    }
  }
for (let pass = 0; pass < 40 && grid.some((c) => !c); pass++) {
  const next = grid.slice();
  for (let gy = 0; gy < GH; gy++)
    for (let gx = 0; gx < GW; gx++) {
      if (grid[gy * GW + gx]) continue;
      const nb = [
        [gx - 1, gy],
        [gx + 1, gy],
        [gx, gy - 1],
        [gx, gy + 1],
      ]
        .filter(([x, y]) => x! >= 0 && y! >= 0 && x! < GW && y! < GH)
        .map(([x, y]) => grid[y! * GW + x!])
        .filter((c): c is [number, number, number] => !!c);
      if (nb.length) next[gy * GW + gx] = [0, 1, 2].map((k) => nb.reduce((s, c) => s + c[k]!, 0) / nb.length) as [number, number, number];
    }
  grid.splice(0, grid.length, ...next);
}
const bgAt = (x: number, y: number): [number, number, number] => {
  const fx = Math.min(GW - 1.001, Math.max(0, x / CELL - 0.5));
  const fy = Math.min(GH - 1.001, Math.max(0, y / CELL - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const c = (gx: number, gy: number) => grid[Math.min(GH - 1, gy) * GW + Math.min(GW - 1, gx)] ?? [238, 238, 238];
  return [0, 1, 2].map((k) => c(x0, y0)[k]! * (1 - tx) * (1 - ty) + c(x0 + 1, y0)[k]! * tx * (1 - ty) + c(x0, y0 + 1)[k]! * (1 - tx) * ty + c(x0 + 1, y0 + 1)[k]! * tx * ty) as [number, number, number];
};

// 2. strong foreground + nearest-interior colour (BFS, radius 6) for the anti-aliased band
const bg = new Float32Array(W * H * 3);
const dist = new Float32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const b = bgAt(x, y);
    const i = px(x, y);
    bg[i] = b[0];
    bg[i + 1] = b[1];
    bg[i + 2] = b[2];
    dist[y * W + x] = Math.hypot(data[i]! - b[0], data[i + 1]! - b[1], data[i + 2]! - b[2]);
  }
const src = new Int32Array(W * H).fill(-1); // index of the interior pixel whose colour this pixel takes
const depth = new Uint8Array(W * H);
let queue: number[] = [];
for (let k = 0; k < W * H; k++)
  if (dist[k]! > 120) {
    src[k] = k;
    queue.push(k);
  }
for (let r = 1; r <= 6; r++) {
  const next: number[] = [];
  for (const k of queue) {
    const x = k % W;
    const y = (k / W) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (src[n] !== -1) continue;
      src[n] = src[k]!;
      depth[n] = r;
      next.push(n);
    }
  }
  queue = next;
}

// 3. alpha = projection of (c − bg) on (f − bg); colour = f on the edge band (decontaminated), c inside
const out = Buffer.alloc(W * H * 4);
for (let k = 0; k < W * H; k++) {
  const s = src[k]!;
  if (s < 0) continue;
  const i = k * 3;
  if (s === k) {
    out[k * 4] = data[i]!;
    out[k * 4 + 1] = data[i + 1]!;
    out[k * 4 + 2] = data[i + 2]!;
    out[k * 4 + 3] = 255;
    continue;
  }
  const si = s * 3;
  const fr = data[si]! - bg[i]!;
  const fg = data[si + 1]! - bg[i + 1]!;
  const fb = data[si + 2]! - bg[i + 2]!;
  const cr = data[i]! - bg[i]!;
  const cg = data[i + 1]! - bg[i + 1]!;
  const cb = data[i + 2]! - bg[i + 2]!;
  let a = (cr * fr + cg * fg + cb * fb) / Math.max(1, fr * fr + fg * fg + fb * fb);
  a = Math.min(1, Math.max(0, (a - 0.3) / (0.9 - 0.3))); // drop the soft drop shadow + bevel fringe, keep a crisp AA ramp
  if (a <= 0) continue;
  out[k * 4] = data[si]!;
  out[k * 4 + 1] = data[si + 1]!;
  out[k * 4 + 2] = data[si + 2]!;
  out[k * 4 + 3] = Math.round(a * 255);
}

function bbox(y0: number, y1: number) {
  let minX = W;
  let minY = H;
  let maxX = 0;
  let maxY = 0;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < W; x++)
      if (out[(y * W + x) * 4 + 3]! > 6) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
const full = sharp(out, { raw: { width: W, height: H, channels: 4 } });
const markBox = bbox(0, 580); // the mark sits above the "PROMPTCODE" text
const logoBox = bbox(0, H);
const pad = (b: { left: number; top: number; width: number; height: number }, p: number) => ({
  left: Math.max(0, b.left - p),
  top: Math.max(0, b.top - p),
  width: Math.min(W - Math.max(0, b.left - p), b.width + 2 * p),
  height: Math.min(H - Math.max(0, b.top - p), b.height + 2 * p),
});

const markRaw = await full.clone().extract(pad(markBox, 3)).png().toBuffer();
const mark = sharp(markRaw).resize({ height: 512, kernel: "lanczos3" });
await mark.clone().png({ compressionLevel: 9 }).toFile(path.join(BRAND, "promptcode-mark.png"));
await mark.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(BRAND, "promptcode-mark.webp"));
const logoRaw = await full.clone().extract(pad(logoBox, 6)).png().toBuffer();
const logo = sharp(logoRaw).resize({ width: 1024, kernel: "lanczos3" });
await logo.clone().png({ compressionLevel: 9 }).toFile(path.join(BRAND, "promptcode-logo.png"));
await logo.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(BRAND, "promptcode-logo.webp"));
console.log("mark box", markBox, "logo box", logoBox);

// 4. halo check: on white and on a dark slate
const m = await sharp(path.join(BRAND, "promptcode-mark.png")).metadata();
const l = await sharp(path.join(BRAND, "promptcode-logo.png")).metadata();
const tileW = 1100;
const tileH = Math.max(m.height!, l.height!) + 80;
const tile = async (bgc: string) =>
  sharp({ create: { width: tileW, height: tileH, channels: 4, background: bgc } })
    .composite([
      { input: path.join(BRAND, "promptcode-mark.png"), left: 30, top: 40 },
      { input: await sharp(path.join(BRAND, "promptcode-logo.png")).resize({ width: 480 }).toBuffer(), left: 600, top: 40 },
    ])
    .png()
    .toBuffer();
await sharp({ create: { width: tileW, height: tileH * 2, channels: 4, background: "#ffffff" } })
  .composite([
    { input: await tile("#ffffff"), left: 0, top: 0 },
    { input: await tile("#1b2233"), left: 0, top: tileH },
  ])
  .png()
  .toFile(path.resolve(process.cwd(), "screenshots/pf-brand-check.png"));
console.log("wrote brand assets");
