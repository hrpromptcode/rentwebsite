/** Procedural object library for FloatingObjects (no GLTF downloads). Everything built from three primitives. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mulberry32 } from "../core/random";
import { makeGlassMaterial } from "./shared";
import type { FloatingSet, FloatingMaterial } from "../floating-objects";

type Rnd = () => number;
export type MatStyle = Exclude<FloatingMaterial, "auto">;

export interface Palette {
  primary: THREE.Color;
  accent: THREE.Color;
  glow: THREE.Color;
  surface: THREE.Color;
  foreground: THREE.Color;
  background: THREE.Color;
}

const WHITE = new THREE.Color(1, 1, 1);

export const AUTO_MATERIAL: Record<FloatingSet, MatStyle> = {
  fashion: "satin",
  gaming: "chrome",
  clinic: "glass",
  food: "clay",
  spa: "satin",
  corporate: "chrome",
  pastry: "clay",
  yoga: "satin",
  resort: "glass",
  events: "chrome",
  abstract: "pearl",
};

export class MatBank {
  private cache = new Map<string, THREE.Material>();
  constructor(
    private style: MatStyle,
    private mobile: boolean,
  ) {}
  get(style: MatStyle | "auto" | "emissive" | "holo", color: THREE.Color, extra = ""): THREE.Material {
    const s = style === "auto" ? this.style : style;
    const k = `${s}:${color.getHexString()}:${extra}`;
    let m = this.cache.get(k);
    if (m) return m;
    switch (s) {
      case "chrome":
        m = new THREE.MeshStandardMaterial({ color: color.clone().lerp(WHITE, 0.3), metalness: 1, roughness: 0.12, envMapIntensity: 1.7 });
        break;
      case "clay":
        m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.58, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35, sheen: 0.6, sheenColor: color.clone().lerp(WHITE, 0.6), sheenRoughness: 0.45 });
        break;
      case "pearl":
        m = new THREE.MeshPhysicalMaterial({ color: color.clone().lerp(WHITE, 0.6), roughness: 0.2, metalness: 0.08, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 620], clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: WHITE.clone() });
        break;
      case "satin":
        m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0.04, sheen: 1, sheenRoughness: 0.32, sheenColor: color.clone().lerp(WHITE, 0.55), clearcoat: 0.2, clearcoatRoughness: 0.4, side: extra === "double" ? THREE.DoubleSide : THREE.FrontSide });
        break;
      case "glass":
        m = makeGlassMaterial(color, { minAlpha: this.mobile ? 0.3 : 0.24 });
        break;
      case "holo":
        m = new THREE.MeshPhysicalMaterial({ color: color.clone().lerp(WHITE, 0.2), metalness: 0.65, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [100, 800], clearcoat: 1 });
        break;
      case "emissive":
      default:
        m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: extra === "soft" ? 0.22 : 1, depthWrite: extra !== "soft", blending: extra === "soft" ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
        break;
    }
    this.cache.set(k, m);
    return m;
  }
  dispose() {
    this.cache.forEach((m) => m.dispose());
    this.cache.clear();
  }
}

export class GeoBank {
  private list: THREE.BufferGeometry[] = [];
  add<T extends THREE.BufferGeometry>(g: T): T {
    this.list.push(g);
    return g;
  }
  dispose() {
    this.list.forEach((g) => g.dispose());
    this.list = [];
  }
}

/* ---------------- geometry helpers ---------------- */

function lathe(points: [number, number][], seg = 48) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

/** smooth seeded 3D "noise" from summed sines (enough for pebbles/stones) */
function sineNoise(r: Rnd) {
  const waves = Array.from({ length: 6 }, () => ({ k: new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(1 + r() * 2.5), p: r() * Math.PI * 2, a: 0.5 + r() }));
  return (v: THREE.Vector3) => waves.reduce((s, w) => s + Math.sin(v.dot(w.k) + w.p) * w.a, 0) / waves.length;
}

function stone(radius: number, squash: [number, number, number], r: Rnd, amp = 0.08, detail = 40) {
  const g = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.66));
  const n = sineNoise(r);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + n(v) * amp;
    p.setXYZ(i, v.x * d * squash[0] * radius, v.y * d * squash[1] * radius, v.z * d * squash[2] * radius);
  }
  g.computeVertexNormals();
  return g;
}

function taperedTube(points: THREE.Vector3[], radius: (t: number) => number, tubular = 64, radial = 16) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, c);
    const rr = radius(t);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(rr).add(c);
      p.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

function starShape(points: number, outer: number, inner: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material) {
  const x = new THREE.Mesh(g, m);
  x.castShadow = false;
  x.receiveShadow = false;
  return x;
}

/* ---------------- object builders ---------------- */

export interface BuiltObject {
  group: THREE.Group;
  /** bounding radius (layout spacing) */
  radius: number;
}

interface Ctx {
  pal: Palette;
  mats: MatBank;
  geos: GeoBank;
  r: Rnd;
  mobile: boolean;
}

type Builder = (c: Ctx, i: number) => BuiltObject;

const B = {
  button(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    const geo = c.geos.add(lathe([[0, 0.05], [0.46, 0.05], [0.56, 0.075], [0.64, 0.04], [0.66, 0], [0.62, -0.05], [0.48, -0.06], [0, -0.06]], 56));
    const color = i % 2 ? c.pal.primary : c.pal.glow;
    const m = mesh(geo, c.mats.get(i % 3 === 0 ? "pearl" : "auto", color));
    m.rotation.x = Math.PI / 2;
    g.add(m);
    const hole = c.geos.add(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 20));
    const hm = c.mats.get("clay", c.pal.foreground.clone().lerp(color, 0.3));
    for (const [x, y] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]] as const) {
      const h = mesh(hole, hm);
      h.rotation.x = Math.PI / 2;
      h.position.set(x, y, 0);
      h.scale.set(1, 1, 0.6);
      g.add(h);
    }
    return { group: g, radius: 0.7 };
  },
  ribbon(c: Ctx, i: number): BuiltObject {
    const geo = c.geos.add(new THREE.PlaneGeometry(2.8, 0.34, 120, 1));
    const p = geo.attributes.position as THREE.BufferAttribute;
    const ph = c.r() * 3;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const y = p.getY(k);
      const tw = x * 1.25 + ph;
      const z = Math.sin(x * 1.9 + ph) * 0.32;
      p.setXYZ(k, x, y * Math.cos(tw) + Math.sin(x * 1.3) * 0.25, z + y * Math.sin(tw));
    }
    geo.computeVertexNormals();
    const m = mesh(geo, c.mats.get("satin", i % 2 ? c.pal.accent : c.pal.primary, "double"));
    const g = new THREE.Group();
    g.add(m);
    return { group: g, radius: 1.4 };
  },
  spool(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    const body = c.geos.add(new THREE.CylinderGeometry(0.34, 0.34, 0.86, 48, 24));
    // thread grooves
    const p = body.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      const s = 1 + Math.sin(y * 95) * 0.012;
      p.setX(k, p.getX(k) * s);
      p.setZ(k, p.getZ(k) * s);
    }
    body.computeVertexNormals();
    g.add(mesh(body, c.mats.get("satin", c.pal.primary)));
    const fl = c.geos.add(lathe([[0, 0.05], [0.5, 0.05], [0.56, 0.02], [0.56, -0.02], [0.5, -0.05], [0, -0.05]], 48));
    const fm = c.mats.get("clay", c.pal.surface.clone().lerp(c.pal.foreground, 0.12));
    for (const y of [0.48, -0.48]) {
      const f = mesh(fl, fm);
      f.position.y = y;
      g.add(f);
    }
    g.rotation.z = 0.5;
    return { group: g, radius: 0.75 };
  },
  pearl(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    const geo = c.geos.add(new THREE.SphereGeometry(0.3, 48, 32));
    g.add(mesh(geo, c.mats.get("pearl", i % 2 ? c.pal.glow : c.pal.surface)));
    return { group: g, radius: 0.34 };
  },
  gem(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    const geo = c.geos.add(new THREE.OctahedronGeometry(0.58, 0));
    const m = mesh(geo, c.mats.get(i % 2 ? "glass" : "chrome", i % 2 ? c.pal.accent : c.pal.primary));
    m.scale.set(1, 1.4, 1);
    g.add(m);
    const core = mesh(c.geos.add(new THREE.OctahedronGeometry(0.22, 0)), c.mats.get("emissive", c.pal.glow));
    core.scale.set(1, 1.4, 1);
    if (i % 2) g.add(core);
    return { group: g, radius: 0.8 };
  },
  coin(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    const geo = c.geos.add(lathe([[0, 0.06], [0.44, 0.06], [0.5, 0.1], [0.6, 0.1], [0.63, 0.05], [0.63, -0.05], [0.6, -0.1], [0.5, -0.1], [0.44, -0.06], [0, -0.06]], 64));
    const m = mesh(geo, c.mats.get("chrome", c.pal.accent));
    m.rotation.x = Math.PI / 2;
    g.add(m);
    const rim = mesh(c.geos.add(new THREE.TorusGeometry(0.635, 0.012, 8, 96)), c.mats.get("emissive", c.pal.glow));
    g.add(rim);
    const star = mesh(c.geos.add(new THREE.ExtrudeGeometry(starShape(5, 0.24, 0.1), { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 })), c.mats.get("chrome", c.pal.glow));
    star.position.z = 0.06;
    g.add(star);
    return { group: g, radius: 0.68 };
  },
  plus(c: Ctx): BuiltObject {
    const s = new THREE.Shape();
    const a = 0.17;
    const L = 0.5;
    s.moveTo(-a, L);
    s.lineTo(a, L);
    s.lineTo(a, a);
    s.lineTo(L, a);
    s.lineTo(L, -a);
    s.lineTo(a, -a);
    s.lineTo(a, -L);
    s.lineTo(-a, -L);
    s.lineTo(-a, -a);
    s.lineTo(-L, -a);
    s.lineTo(-L, a);
    s.lineTo(-a, a);
    s.closePath();
    const geo = c.geos.add(new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 4 }));
    geo.center();
    const g = new THREE.Group();
    g.add(mesh(geo, c.mats.get("clay", c.pal.primary)));
    return { group: g, radius: 0.7 };
  },
  capsule(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    const top = c.geos.add(new THREE.CapsuleGeometry(0.2, 0.5, 8, 32));
    const m = mesh(top, c.mats.get(i % 2 ? "glass" : "auto", i % 2 ? c.pal.primary : c.pal.accent));
    g.add(m);
    if (i % 2) {
      const inner = mesh(c.geos.add(new THREE.CapsuleGeometry(0.11, 0.3, 6, 20)), c.mats.get("pearl", c.pal.glow));
      g.add(inner);
    }
    g.rotation.z = 0.8;
    return { group: g, radius: 0.55 };
  },
  droplet(c: Ctx, i: number): BuiltObject {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 32; k++) {
      const t = (k / 32) * Math.PI;
      pts.push([Math.max(0.0001, Math.sin(t) * Math.sin(t / 2) * 0.5), Math.cos(t) * 0.62]);
    }
    const geo = c.geos.add(lathe(pts.reverse(), 48));
    const g = new THREE.Group();
    g.add(mesh(geo, c.mats.get("glass", i % 2 ? c.pal.primary : c.pal.glow)));
    return { group: g, radius: 0.6 };
  },
  ring(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    g.add(mesh(c.geos.add(new THREE.TorusGeometry(0.5, 0.05, 24, 96)), c.mats.get("chrome", c.pal.glow)));
    return { group: g, radius: 0.55 };
  },
  bowl(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    const geo = c.geos.add(lathe([[0, -0.34], [0.32, -0.34], [0.56, -0.2], [0.74, 0.1], [0.72, 0.13], [0.53, -0.13], [0.3, -0.26], [0.0001, -0.27]], 64));
    g.add(mesh(geo, c.mats.get("clay", c.pal.surface.clone().lerp(c.pal.foreground, 0.08))));
    const soup = mesh(c.geos.add(new THREE.CircleGeometry(0.62, 48)), c.mats.get("clay", c.pal.primary));
    soup.rotation.x = -Math.PI / 2;
    soup.position.y = 0.02;
    g.add(soup);
    g.rotation.x = 0.45;
    return { group: g, radius: 0.8 };
  },
  chili(c: Ctx): BuiltObject {
    const pts = [new THREE.Vector3(-0.6, 0.15, 0), new THREE.Vector3(-0.25, 0.05, 0.05), new THREE.Vector3(0.15, -0.08, 0), new THREE.Vector3(0.5, -0.32, -0.05), new THREE.Vector3(0.65, -0.6, 0)];
    const geo = c.geos.add(taperedTube(pts, (t) => 0.14 * Math.pow(Math.sin(Math.min(1, t * 1.25 + 0.12) * Math.PI * 0.5 + 0.0001), 0.6) * (1 - t * 0.85) + 0.008, 72, 18));
    const g = new THREE.Group();
    const body = new THREE.MeshPhysicalMaterial({ color: c.pal.primary, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
    g.add(mesh(geo, body));
    const stem = mesh(c.geos.add(taperedTube([new THREE.Vector3(-0.6, 0.15, 0), new THREE.Vector3(-0.72, 0.28, 0), new THREE.Vector3(-0.7, 0.42, 0.02)], () => 0.035, 12, 8)), c.mats.get("clay", c.pal.accent));
    g.add(stem);
    (g.userData.extraMaterials ??= [] as THREE.Material[]).push(body);
    return { group: g, radius: 0.8 };
  },
  leaf(c: Ctx): BuiltObject {
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(0.34, -0.3, 0.32, 0.25, 0, 0.55);
    s.bezierCurveTo(-0.32, 0.25, -0.34, -0.3, 0, -0.5);
    const geo = c.geos.add(new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1, curveSegments: 24 }));
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const y = p.getY(k);
      p.setZ(k, p.getZ(k) + x * x * 0.9 - y * 0.12);
    }
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(mesh(geo, c.mats.get("satin", c.pal.accent, "double")));
    return { group: g, radius: 0.55 };
  },
  grain(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    const geo = c.geos.add(new THREE.CapsuleGeometry(0.06, 0.16, 4, 12));
    const m = c.mats.get("pearl", c.pal.surface);
    for (let k = 0; k < 5; k++) {
      const x = mesh(geo, m);
      x.position.set((c.r() - 0.5) * 0.5, (c.r() - 0.5) * 0.5, (c.r() - 0.5) * 0.3);
      x.rotation.set(c.r() * 3, c.r() * 3, c.r() * 3);
      g.add(x);
    }
    return { group: g, radius: 0.35 };
  },
  stone(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    const geo = c.geos.add(stone(0.55, [1, 0.46, 0.84], c.r, 0.06));
    const col = [c.pal.surface.clone().lerp(c.pal.foreground, 0.55), c.pal.surface.clone().lerp(c.pal.foreground, 0.2), c.pal.primary.clone().lerp(c.pal.surface, 0.4)][i % 3]!;
    g.add(mesh(geo, c.mats.get("clay", col)));
    return { group: g, radius: 0.6 };
  },
  bamboo(c: Ctx): BuiltObject {
    const pts: [number, number][] = [];
    const L = 1.7;
    for (let k = 0; k <= 60; k++) {
      const y = (k / 60) * L - L / 2;
      const node = Math.pow(Math.max(0, Math.cos(((y + L / 2) / L) * Math.PI * 2 * 3)), 30) * 0.022;
      pts.push([0.11 + node, y]);
    }
    pts.unshift([0.0001, -L / 2]);
    pts.push([0.0001, L / 2]);
    const geo = c.geos.add(lathe(pts, 32));
    const g = new THREE.Group();
    g.add(mesh(geo, c.mats.get("satin", c.pal.accent)));
    g.rotation.z = 0.35;
    return { group: g, radius: 0.9 };
  },
  lotus(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    const petal = c.geos.add(new THREE.PlaneGeometry(0.42, 0.8, 10, 16));
    const p = petal.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const y = p.getY(k) + 0.4; // 0..0.8
      const t = y / 0.8;
      const w = Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) * (1 - t * 0.35);
      p.setXYZ(k, x * w * 1.6, y, x * x * 2.2 + t * t * 0.25);
    }
    petal.computeVertexNormals();
    const m1 = c.mats.get("pearl", c.pal.primary, "double");
    const m2 = c.mats.get("pearl", c.pal.glow, "double");
    for (const [n, tilt, mat, off] of [[8, 0.95, m1, 0], [6, 0.5, m2, 0.4]] as const) {
      for (let k = 0; k < n; k++) {
        const holder = new THREE.Group();
        const pm = mesh(petal, mat);
        pm.rotation.x = -tilt;
        holder.add(pm);
        holder.rotation.y = off + (k / n) * Math.PI * 2;
        g.add(holder);
      }
    }
    const core = mesh(c.geos.add(new THREE.SphereGeometry(0.12, 24, 16)), c.mats.get("clay", c.pal.accent));
    core.position.y = 0.08;
    g.add(core);
    g.rotation.x = 0.5;
    return { group: g, radius: 0.85 };
  },
  cube(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    g.add(mesh(c.geos.add(new RoundedBoxGeometry(0.85, 0.85, 0.85, 6, 0.16)), c.mats.get("auto", i % 2 ? c.pal.primary : c.pal.glow)));
    return { group: g, radius: 0.75 };
  },
  halfpipe(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    g.add(mesh(c.geos.add(new THREE.TorusGeometry(0.5, 0.16, 32, 64, Math.PI)), c.mats.get("chrome", c.pal.accent)));
    return { group: g, radius: 0.7 };
  },
  tile(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    g.add(mesh(c.geos.add(new RoundedBoxGeometry(1.0, 1.0, 0.1, 4, 0.05)), c.mats.get("glass", c.pal.primary)));
    const grid = new THREE.GridHelper(0.9, 6, c.pal.glow, c.pal.glow);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.051;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.45;
    g.add(grid);
    (g.userData.extraMaterials ??= [] as THREE.Material[]).push(grid.material as THREE.Material);
    (g.userData.extraGeometries ??= [] as THREE.BufferGeometry[]).push(grid.geometry);
    return { group: g, radius: 0.72 };
  },
  donut(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    const dough = c.geos.add(new THREE.TorusGeometry(0.42, 0.21, 40, 80));
    const doughCol = c.pal.surface.clone().lerp(new THREE.Color("#d9a066"), 0.55);
    g.add(mesh(dough, c.mats.get("clay", doughCol)));
    // icing: the top half of a slightly fatter torus with a wavy drip edge
    const icing = c.geos.add(new THREE.TorusGeometry(0.42, 0.225, 40, 80));
    const p = icing.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const ang = Math.atan2(v.y, v.x);
      const edge = Math.sin(ang * 9) * 0.035 + Math.sin(ang * 23) * 0.012;
      if (v.z < -0.02 + edge) {
        // tuck under the dough surface
        const ring = new THREE.Vector3(Math.cos(ang) * 0.42, Math.sin(ang) * 0.42, 0);
        v.sub(ring).multiplyScalar(0.9).add(ring);
        p.setXYZ(k, v.x, v.y, v.z);
      }
    }
    icing.computeVertexNormals();
    const icingCol = i % 2 ? c.pal.primary : c.pal.accent;
    const im = new THREE.MeshPhysicalMaterial({ color: icingCol, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.3 });
    g.add(mesh(icing, im));
    (g.userData.extraMaterials ??= [] as THREE.Material[]).push(im);
    // sprinkles (instanced)
    const sGeo = c.geos.add(new THREE.CapsuleGeometry(0.012, 0.05, 2, 6));
    const sMat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    const N = c.mobile ? 24 : 46;
    const inst = new THREE.InstancedMesh(sGeo, sMat, N);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const cols = [c.pal.glow, c.pal.foreground.clone().lerp(WHITE, 0.4), WHITE, i % 2 ? c.pal.accent : c.pal.primary];
    for (let k = 0; k < N; k++) {
      const a = c.r() * Math.PI * 2;
      const b = (c.r() * 0.9 + 0.05) * Math.PI * 0.5; // top hemisphere of tube
      const tube = 0.228;
      const side = c.r() < 0.5 ? 1 : -1;
      const x = (0.42 + Math.cos(b) * tube * side) * Math.cos(a);
      const y = (0.42 + Math.cos(b) * tube * side) * Math.sin(a);
      const z = Math.sin(b) * tube + 0.004;
      e.set(c.r() * Math.PI, c.r() * Math.PI, c.r() * Math.PI);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(k, m4);
      inst.setColorAt(k, cols[k % cols.length]!);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    g.add(inst);
    (g.userData.extraMaterials ??= [] as THREE.Material[]).push(sMat);
    g.rotation.x = -0.9;
    return { group: g, radius: 0.68 };
  },
  macaron(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    const shell = c.geos.add(stone(0.4, [1, 0.42, 1], c.r, 0.015, 40));
    const col = [c.pal.primary, c.pal.accent, c.pal.glow][i % 3]!;
    const sm = c.mats.get("clay", col.clone().lerp(WHITE, 0.15));
    const top = mesh(shell, sm);
    top.position.y = 0.11;
    const bot = mesh(shell, sm);
    bot.position.y = -0.11;
    // filling
    const fill = mesh(c.geos.add(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 48)), c.mats.get("clay", c.pal.surface.clone().lerp(WHITE, 0.6)));
    // "feet" ruffle
    const foot = c.geos.add(new THREE.TorusGeometry(0.37, 0.035, 8, 64));
    const f1 = mesh(foot, sm);
    f1.rotation.x = Math.PI / 2;
    f1.position.y = 0.06;
    const f2 = mesh(foot, sm);
    f2.rotation.x = Math.PI / 2;
    f2.position.y = -0.06;
    g.add(top, bot, fill, f1, f2);
    g.rotation.x = 0.5;
    return { group: g, radius: 0.5 };
  },
  croissant(c: Ctx): BuiltObject {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * (0.15 + 0.7 * (k / 8));
      pts.push(new THREE.Vector3(Math.cos(a) * 0.62, Math.sin(a) * 0.62 - 0.35, 0));
    }
    const geo = c.geos.add(taperedTube(pts, (t) => (0.07 + 0.2 * Math.pow(Math.sin(Math.PI * t), 1.4)) * (1 + Math.pow(Math.abs(Math.sin(t * Math.PI * 6)), 0.5) * 0.12), 120, 24));
    const g = new THREE.Group();
    g.add(mesh(geo, c.mats.get("clay", c.pal.surface.clone().lerp(new THREE.Color("#c98a3e"), 0.7))));
    return { group: g, radius: 0.75 };
  },
  cherry(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    const geo = c.geos.add(new THREE.SphereGeometry(0.2, 40, 28));
    const m = new THREE.MeshPhysicalMaterial({ color: c.pal.primary.clone().lerp(new THREE.Color("#b0102a"), 0.5), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    (g.userData.extraMaterials ??= [] as THREE.Material[]).push(m);
    const a = mesh(geo, m);
    a.position.set(-0.14, -0.2, 0);
    const b = mesh(geo, m);
    b.position.set(0.16, -0.24, 0.05);
    const stemMat = c.mats.get("clay", c.pal.accent);
    const s1 = mesh(c.geos.add(taperedTube([new THREE.Vector3(-0.14, -0.04, 0), new THREE.Vector3(-0.05, 0.25, 0), new THREE.Vector3(0.08, 0.42, 0)], () => 0.018, 24, 6)), stemMat);
    const s2 = mesh(c.geos.add(taperedTube([new THREE.Vector3(0.16, -0.08, 0.05), new THREE.Vector3(0.14, 0.2, 0.02), new THREE.Vector3(0.08, 0.42, 0)], () => 0.018, 24, 6)), stemMat);
    g.add(a, b, s1, s2);
    return { group: g, radius: 0.5 };
  },
  softSphere(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    g.add(mesh(c.geos.add(new THREE.SphereGeometry(0.36, 48, 32)), c.mats.get(i % 2 ? "pearl" : "clay", i % 2 ? c.pal.glow : c.pal.primary)));
    return { group: g, radius: 0.4 };
  },
  torusRing(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    g.add(mesh(c.geos.add(new THREE.TorusGeometry(0.5, 0.075, 24, 96)), c.mats.get("satin", i % 2 ? c.pal.accent : c.pal.primary)));
    return { group: g, radius: 0.6 };
  },
  pebble(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    g.add(mesh(c.geos.add(stone(0.36, [1, 0.5, 0.8], c.r, 0.05)), c.mats.get("pearl", i % 2 ? c.pal.surface : c.pal.glow)));
    return { group: g, radius: 0.4 };
  },
  sun(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    g.add(mesh(c.geos.add(new THREE.CircleGeometry(0.55, 64)), c.mats.get("emissive", c.pal.glow)));
    const halo = mesh(c.geos.add(new THREE.CircleGeometry(1.1, 64)), c.mats.get("emissive", c.pal.glow, "soft"));
    halo.position.z = -0.01;
    g.add(halo);
    return { group: g, radius: 0.9 };
  },
  glassWave(c: Ctx): BuiltObject {
    const s = new THREE.Shape();
    const W = 1.4;
    s.moveTo(-W / 2, -0.12);
    for (let k = 0; k <= 24; k++) {
      const x = -W / 2 + (k / 24) * W;
      s.lineTo(x, Math.sin((k / 24) * Math.PI * 2) * 0.14 + 0.12);
    }
    for (let k = 24; k >= 0; k--) {
      const x = -W / 2 + (k / 24) * W;
      s.lineTo(x, Math.sin((k / 24) * Math.PI * 2) * 0.14 - 0.12);
    }
    s.closePath();
    const geo = c.geos.add(new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 4, curveSegments: 4 }));
    geo.center();
    const g = new THREE.Group();
    g.add(mesh(geo, c.mats.get("glass", c.pal.accent)));
    return { group: g, radius: 0.8 };
  },
  ticket(c: Ctx, i: number): BuiltObject {
    const s = roundedRectShape(1.15, 0.56, 0.08);
    // perforation notches
    const notch = new THREE.Path();
    notch.absarc(0.28, 0.28, 0.06, 0, Math.PI * 2, true);
    s.holes.push(notch);
    const notch2 = new THREE.Path();
    notch2.absarc(0.28, -0.28, 0.06, 0, Math.PI * 2, true);
    s.holes.push(notch2);
    const geo = c.geos.add(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 12 }));
    geo.center();
    const g = new THREE.Group();
    g.add(mesh(geo, c.mats.get("holo", i % 2 ? c.pal.accent : c.pal.primary)));
    return { group: g, radius: 0.7 };
  },
  burst(c: Ctx, i: number): BuiltObject {
    const geo = c.geos.add(new THREE.ExtrudeGeometry(starShape(8, 0.5, 0.24), { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }));
    geo.center();
    const g = new THREE.Group();
    g.add(mesh(geo, c.mats.get("chrome", i % 2 ? c.pal.primary : c.pal.accent)));
    return { group: g, radius: 0.6 };
  },
  spot(c: Ctx): BuiltObject {
    const g = new THREE.Group();
    const cone = mesh(c.geos.add(new THREE.ConeGeometry(0.5, 1.4, 48, 1, true)), c.mats.get("emissive", c.pal.accent, "soft"));
    cone.position.y = -0.6;
    const can = mesh(c.geos.add(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 32)), c.mats.get("chrome", c.pal.foreground.clone().lerp(c.pal.surface, 0.5)));
    can.position.y = 0.15;
    g.add(cone, can);
    return { group: g, radius: 0.8 };
  },
  knot(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    g.add(mesh(c.geos.add(new THREE.TorusKnotGeometry(0.38, 0.12, 160, 24)), c.mats.get("auto", i % 2 ? c.pal.accent : c.pal.primary)));
    return { group: g, radius: 0.6 };
  },
  ico(c: Ctx, i: number): BuiltObject {
    const g = new THREE.Group();
    const geo = c.geos.add(new THREE.IcosahedronGeometry(0.5, 0));
    g.add(mesh(geo, c.mats.get(i % 2 ? "glass" : "chrome", i % 2 ? c.pal.glow : c.pal.accent)));
    return { group: g, radius: 0.55 };
  },
} satisfies Record<string, Builder>;

type Kind = keyof typeof B;

export const SET_KINDS: Record<FloatingSet, Kind[]> = {
  fashion: ["ribbon", "button", "spool", "pearl", "button", "ribbon", "pearl", "button"],
  gaming: ["gem", "coin", "plus", "capsule", "coin", "gem", "plus", "coin"],
  clinic: ["droplet", "pearl", "capsule", "ring", "droplet", "pearl", "droplet", "pearl"],
  food: ["bowl", "chili", "leaf", "grain", "chili", "leaf", "leaf", "grain"],
  spa: ["stone", "bamboo", "lotus", "stone", "stone", "bamboo", "stone"],
  corporate: ["cube", "halfpipe", "tile", "cube", "halfpipe", "tile", "cube"],
  pastry: ["donut", "macaron", "croissant", "cherry", "donut", "macaron", "donut", "macaron"],
  yoga: ["stone", "stone", "stone", "stone", "torusRing", "softSphere", "softSphere"],
  resort: ["sun", "glassWave", "pebble", "pebble", "glassWave", "pebble"],
  events: ["ticket", "burst", "spot", "ticket", "burst", "ticket", "burst"],
  abstract: ["knot", "ico", "cube", "softSphere", "torusRing", "ico", "knot"],
};

export const DEFAULT_LAYOUT: Record<FloatingSet, "orbit" | "scatter" | "stack" | "rain"> = {
  fashion: "scatter",
  gaming: "orbit",
  clinic: "scatter",
  food: "scatter",
  spa: "scatter",
  corporate: "scatter",
  pastry: "scatter",
  yoga: "stack",
  resort: "scatter",
  events: "orbit",
  abstract: "scatter",
};

export function buildSet(set: FloatingSet, count: number, ctx: Omit<Ctx, "r">, seed: number): (BuiltObject & { kind: Kind })[] {
  const r = mulberry32(seed);
  const kinds = SET_KINDS[set] ?? SET_KINDS.abstract;
  const out: (BuiltObject & { kind: Kind })[] = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length]!;
    const built = (B[kind] as Builder)({ ...ctx, r }, i);
    out.push({ ...built, kind });
  }
  return out;
}
