/** Point-cloud generators for ParticleMorph (all seeded, ~1.6 world-unit radius). */
import { mulberry32, seedFromString } from "../core/random";
import { sampleImagePoints, sampleSvgPathPoints, sampleTextPoints } from "../core/canvas-text";
import type { ParticleShape } from "../particle-morph";

type Rnd = () => number;

function gauss(r: Rnd) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-6, r()))) * Math.cos(2 * Math.PI * r());
}

function sphere(n: number, r: Rnd) {
  const out = new Float32Array(n * 3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = ga * i;
    const k = 1.55 * (1 - Math.abs(gauss(r)) * 0.025);
    out[i * 3] = Math.cos(th) * rad * k;
    out[i * 3 + 1] = y * k;
    out[i * 3 + 2] = Math.sin(th) * rad * k;
  }
  return out;
}

function torus(n: number, r: Rnd) {
  const out = new Float32Array(n * 3);
  const R = 1.15;
  const t = 0.46;
  let i = 0;
  while (i < n) {
    const u = r() * Math.PI * 2;
    const v = r() * Math.PI * 2;
    // area weighting: accept by (R + t cos v) / (R + t)
    if (r() > (R + t * Math.cos(v)) / (R + t)) continue;
    const k = t * (1 - Math.abs(gauss(r)) * 0.04);
    out[i * 3] = (R + k * Math.cos(v)) * Math.cos(u);
    out[i * 3 + 1] = (R + k * Math.cos(v)) * Math.sin(u);
    out[i * 3 + 2] = k * Math.sin(v);
    i++;
  }
  return out;
}

function knot(n: number, r: Rnd) {
  const out = new Float32Array(n * 3);
  const p = 2;
  const q = 3;
  const curve = (t: number) => {
    const rr = 0.9 + 0.38 * Math.cos(q * t);
    return [rr * Math.cos(p * t), rr * Math.sin(p * t), 0.38 * Math.sin(q * t)] as const;
  };
  for (let i = 0; i < n; i++) {
    const t = r() * Math.PI * 2;
    const c = curve(t);
    const c2 = curve(t + 0.001);
    const T = [c2[0] - c[0], c2[1] - c[1], c2[2] - c[2]];
    const tl = Math.hypot(T[0]!, T[1]!, T[2]!) || 1;
    T[0]! /= tl;
    T[1]! /= tl;
    T[2]! /= tl;
    // normal-ish via cross with z, binormal via cross
    let N = [T[1]! * 1 - T[2]! * 0, T[2]! * 0 - T[0]! * 1, 0];
    const nl = Math.hypot(N[0]!, N[1]!, N[2]!) || 1;
    N = [N[0]! / nl, N[1]! / nl, N[2]! / nl];
    const B = [T[1]! * N[2]! - T[2]! * N[1]!, T[2]! * N[0]! - T[0]! * N[2]!, T[0]! * N[1]! - T[1]! * N[0]!];
    const a = r() * Math.PI * 2;
    const rad = 0.2 * (1 - Math.abs(gauss(r)) * 0.05);
    const s = 1.45;
    out[i * 3] = (c[0] + (N[0]! * Math.cos(a) + B[0]! * Math.sin(a)) * rad) * s;
    out[i * 3 + 1] = (c[1] + (N[1]! * Math.cos(a) + B[1]! * Math.sin(a)) * rad) * s;
    out[i * 3 + 2] = (c[2] + (N[2]! * Math.cos(a) + B[2]! * Math.sin(a)) * rad) * s;
  }
  return out;
}

/** Layered crystal flower: two rings of faceted petals + stamen core. */
function tiltX(out: Float32Array, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let i = 0; i < out.length; i += 3) {
    const y = out[i + 1]!;
    const z = out[i + 2]!;
    out[i + 1] = y * c - z * s;
    out[i + 2] = y * s + z * c;
  }
  return out;
}

function crystalFlower(n: number, r: Rnd) {
  const out = new Float32Array(n * 3);
  const layers = [
    { petals: 6, len: 1.75, tilt: 1.05, width: 0.82, off: 0, share: 0.42 },
    { petals: 6, len: 1.35, tilt: 0.62, width: 0.7, off: Math.PI / 6, share: 0.34 },
    { petals: 5, len: 0.85, tilt: 0.25, width: 0.52, off: 0.3, share: 0.14 },
  ];
  let i = 0;
  const yShift = -0.45;
  for (const L of layers) {
    const cnt = Math.floor(n * L.share);
    for (let k = 0; k < cnt && i < n; k++, i++) {
      const pIdx = Math.floor(r() * L.petals);
      const ang = L.off + (pIdx / L.petals) * Math.PI * 2;
      const u = Math.pow(r(), 0.8); // along petal
      // across; 35% on the petal outline so the crystal facets read
      const v = r() < 0.35 ? (r() < 0.5 ? -1 : 1) * (0.94 + r() * 0.06) : r() * 2 - 1;
      const w = Math.pow(Math.sin(Math.PI * Math.min(u * 1.08, 1)), 0.75) * L.width;
      // faceted: fold the petal along its spine
      const across = v * w;
      const fold = Math.abs(across) * 0.35;
      // local petal space: y along length (bent outward by tilt), x across, z fold
      const bendA = L.tilt * u;
      const ly = Math.cos(bendA) * u * L.len;
      const lz = Math.sin(bendA) * u * L.len - fold;
      const lx = across;
      // rotate around y by petal angle
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const jitter = gauss(r) * 0.01;
      out[i * 3] = lx * ca + lz * sa + jitter;
      out[i * 3 + 1] = ly + yShift + jitter;
      out[i * 3 + 2] = -lx * sa + lz * ca + jitter;
    }
  }
  // stamen core: a tight glowing cluster with filaments
  for (; i < n; i++) {
    if (r() < 0.6) {
      const a = r() * Math.PI * 2;
      const h = r();
      const rad = 0.12 * h + 0.03;
      out[i * 3] = Math.cos(a) * rad + gauss(r) * 0.02;
      out[i * 3 + 1] = yShift + h * 0.9;
      out[i * 3 + 2] = Math.sin(a) * rad + gauss(r) * 0.02;
    } else {
      const g = gauss(r) * 0.16;
      out[i * 3] = gauss(r) * 0.16;
      out[i * 3 + 1] = yShift + 0.9 + g * 0.5;
      out[i * 3 + 2] = gauss(r) * 0.16;
    }
  }
  return tiltX(out, 0.72);
}

function star(n: number, r: Rnd) {
  const out = new Float32Array(n * 3);
  const pts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 === 0 ? 1.7 : 0.72;
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  const inside = (x: number, y: number) => {
    let c = false;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const [xi, yi] = pts[a]!;
      const [xj, yj] = pts[b]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  let i = 0;
  while (i < n) {
    const x = (r() * 2 - 1) * 1.7;
    const y = (r() * 2 - 1) * 1.7;
    if (!inside(x, y)) continue;
    const d = Math.hypot(x, y);
    const thick = 0.32 * (1 - d / 1.8);
    out[i * 3] = x;
    out[i * 3 + 1] = y - 0.1;
    out[i * 3 + 2] = (r() < 0.5 ? -1 : 1) * thick * Math.pow(r(), 0.3);
    i++;
  }
  return out;
}

function wave(n: number, r: Rnd) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = (r() * 2 - 1) * 2.4;
    const z = (r() * 2 - 1) * 1.6;
    const y = Math.sin(x * 1.6) * 0.32 + Math.cos(z * 2.1 + x * 0.6) * 0.22;
    // tilt the sheet toward the camera
    out[i * 3] = x;
    out[i * 3 + 1] = y * 0.9 + z * 0.42 - 0.1;
    out[i * 3 + 2] = z * 0.9 - y * 0.3;
  }
  return out;
}

function globe(n: number, r: Rnd) {
  const out = new Float32Array(n * 3);
  const R = 1.55;
  for (let i = 0; i < n; i++) {
    const k = r();
    let lat: number;
    let lon: number;
    if (k < 0.36) {
      // meridians
      lon = (Math.floor(r() * 14) / 14) * Math.PI * 2;
      lat = (r() - 0.5) * Math.PI;
    } else if (k < 0.7) {
      // parallels
      lat = ((Math.floor(r() * 9) + 0.5) / 9 - 0.5) * Math.PI;
      lon = r() * Math.PI * 2;
    } else {
      // continents-ish blobs: noise-free clustered patches
      const c = Math.floor(r() * 7);
      const cr = mulberry32(c * 977 + 13);
      const clat = (cr() - 0.5) * 2.2;
      const clon = cr() * Math.PI * 2;
      lat = clat + gauss(r) * 0.22;
      lon = clon + gauss(r) * 0.32;
    }
    const rr = R * (1 + gauss(r) * 0.004);
    out[i * 3] = Math.cos(lat) * Math.cos(lon) * rr;
    out[i * 3 + 1] = Math.sin(lat) * rr;
    out[i * 3 + 2] = Math.cos(lat) * Math.sin(lon) * rr;
  }
  return out;
}

function fit(points: Float32Array, scale: number) {
  let max = 0;
  for (let i = 0; i < points.length; i += 3) max = Math.max(max, Math.abs(points[i]!), Math.abs(points[i + 1]!) * 1.15);
  const k = max > 0 ? scale / max : 1;
  for (let i = 0; i < points.length; i++) points[i]! *= k;
  return points;
}

export function shapeKey(s: ParticleShape): string {
  return typeof s === "string" ? s : JSON.stringify(s);
}

/** Synchronous shapes (primitives). Async shapes (text, svg, image) return null here; use `buildShapeAsync`. */
export function buildShapeSync(s: ParticleShape, n: number): Float32Array | null {
  const r = mulberry32(seedFromString(shapeKey(s) + ":" + n));
  if (typeof s === "string") {
    switch (s) {
      case "sphere":
        return sphere(n, r);
      case "torus":
        return torus(n, r);
      case "knot":
        return knot(n, r);
      case "crystal-flower":
        return crystalFlower(n, r);
      case "star":
        return star(n, r);
      case "wave":
        return wave(n, r);
      case "globe":
        return globe(n, r);
      default:
        return sphere(n, r);
    }
  }
  if ("svgPath" in s) return fit(sampleSvgPathPoints(s.svgPath, n, { viewBox: s.viewBox, depth: 0.12, seed: shapeKey(s) }), 1.75);
  return null;
}

export async function buildShapeAsync(s: ParticleShape, n: number, depth: number): Promise<Float32Array> {
  const sync = buildShapeSync(s, n);
  if (sync) return sync;
  if (typeof s !== "string" && "text" in s) {
    const pts = await sampleTextPoints(s.text, n, { font: s.font, weight: s.weight, depth: depth * 0.6, seed: shapeKey(s) });
    return fit(pts, 2.3);
  }
  if (typeof s !== "string" && "image" in s) {
    try {
      const pts = await sampleImagePoints(s.image, n, { threshold: s.threshold, depth: depth * 1.5, seed: shapeKey(s) });
      return fit(pts, 1.9);
    } catch {
      return sphere(n, mulberry32(7));
    }
  }
  return sphere(n, mulberry32(7));
}
