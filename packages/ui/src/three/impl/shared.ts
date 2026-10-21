"use client";

import * as React from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

export const damp = THREE.MathUtils.damp;
export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
/** frame delta clamp: resuming from frameloop "never" must not jump */
export const dtc = (dt: number) => Math.min(dt, 1 / 20);

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Rewrite an Unsplash (or imgix-style) URL to a texture-sized width; other URLs pass through. */
export function textureSrc(url: string, w = 1024): string {
  if (!/images\.unsplash\.com/.test(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("w", String(w));
    u.searchParams.set("q", "75");
    if (!u.searchParams.has("auto")) u.searchParams.set("auto", "format");
    return u.toString();
  } catch {
    return url;
  }
}

export interface PointerState {
  /** -1..1 relative to the root box (x right, y up) */
  x: number;
  y: number;
  /** smoothed (call `stepPointer` per frame or damp yourself) */
  sx: number;
  sy: number;
  inside: boolean;
  /** last client coords */
  cx: number;
  cy: number;
  /** pointer moved at least once */
  moved: boolean;
}

/**
 * Global pointer relative to an element (window listener, works under overlays and pointer-events:none canvases).
 * Touch: only while a finger is down. No React state.
 */
export function usePointer(rootRef: React.RefObject<HTMLElement | null>): React.MutableRefObject<PointerState> {
  const ref = React.useRef<PointerState>({ x: 0, y: 0, sx: 0, sy: 0, inside: false, cx: -1, cy: -1, moved: false });
  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = ref.current;
      p.cx = e.clientX;
      p.cy = e.clientY;
      p.x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      p.y = -(((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1);
      p.inside = p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1;
      p.moved = true;
    };
    const onLeave = () => {
      ref.current.inside = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [rootRef]);
  return ref;
}

export function stepPointer(p: PointerState, dt: number, lambda = 4) {
  const tx = p.inside || p.moved ? clamp(p.x, -1.5, 1.5) : 0;
  const ty = p.inside || p.moved ? clamp(p.y, -1.5, 1.5) : 0;
  p.sx = damp(p.sx, tx, lambda, dt);
  p.sy = damp(p.sy, ty, lambda, dt);
}

/** Window scroll velocity in px/s (smoothed), as a ref. Updated by `stepScroll` from useFrame. */
export function useScrollVelocity() {
  const ref = React.useRef({ y: 0, last: Number.NaN, v: 0, sv: 0 });
  return ref;
}

export function stepScroll(s: { y: number; last: number; v: number; sv: number }, dt: number) {
  const y = window.scrollY;
  if (Number.isNaN(s.last)) s.last = y;
  s.v = dt > 0 ? (y - s.last) / dt : 0;
  s.last = y;
  s.y = y;
  s.sv = damp(s.sv, clamp(s.v, -6000, 6000), 6, dt);
}

export interface LoadedTexture {
  texture: THREE.Texture;
  aspect: number;
}

/**
 * Load image textures (SRGB, anisotropy ≤ 4, mipmaps) with disposal on unmount / url change.
 * Returns an array aligned with `urls` (null until each loads). Calls invalidate() on every load (demand mode).
 */
export function useImageTextures(urls: readonly string[], opts: { width?: number; anisotropy?: number } = {}): (LoadedTexture | null)[] {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const key = urls.join("\n");
  const [list, setList] = React.useState<(LoadedTexture | null)[]>(() => urls.map(() => null));
  React.useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const maxAniso = Math.min(opts.anisotropy ?? 4, gl.capabilities.getMaxAnisotropy());
    const made: THREE.Texture[] = [];
    let alive = true;
    const srcs = key ? key.split("\n") : [];
    setList(srcs.map(() => null));
    // de-duplicate identical URLs (galleries repeat items around the ring)
    const cache = new Map<string, Promise<LoadedTexture | null>>();
    srcs.forEach((src, i) => {
      if (!src) return;
      let p = cache.get(src);
      if (!p) {
        p = new Promise<LoadedTexture | null>((resolve) => {
          loader.load(
            textureSrc(src, opts.width ?? 1024),
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = maxAniso;
              tex.generateMipmaps = true;
              tex.minFilter = THREE.LinearMipmapLinearFilter;
              tex.magFilter = THREE.LinearFilter;
              tex.needsUpdate = true;
              made.push(tex);
              const img = tex.image as { width?: number; height?: number } | undefined;
              resolve({ texture: tex, aspect: img?.width && img?.height ? img.width / img.height : 1 });
            },
            undefined,
            () => resolve(null),
          );
        });
        cache.set(src, p);
      }
      p.then((lt) => {
        if (!alive || !lt) return;
        setList((prev) => {
          const next = prev.slice();
          next[i] = lt;
          return next;
        });
        invalidate();
      });
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gl]);
  return list;
}

/** Dispose a texture/material/geometry when the component unmounts or the value changes. */
export function useDisposable<T extends { dispose: () => void } | null | undefined>(value: T): T {
  React.useEffect(() => () => value?.dispose(), [value]);
  return value;
}

/** CanvasTexture from a 2D canvas (SRGB) with disposal. */
export function useCanvasTexture(canvas: HTMLCanvasElement | null, anisotropy = 4): THREE.CanvasTexture | null {
  const gl = useThree((s) => s.gl);
  const tex = React.useMemo(() => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
    return t;
  }, [canvas, gl, anisotropy]);
  useDisposable(tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/* GLSL chunks                                                          */
/* ------------------------------------------------------------------ */

/** Ashima 3D simplex noise: snoise(vec3) → -1..1 */
export const GLSL_SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

/** curl noise built on snoise (needs GLSL_SIMPLEX) */
export const GLSL_CURL = /* glsl */ `
vec3 snoiseVec3(vec3 x){
  return vec3(snoise(x), snoise(vec3(x.y-19.1, x.z+33.4, x.x+47.2)), snoise(vec3(x.z+74.2, x.x-124.5, x.y+99.4)));
}
vec3 curlNoise(vec3 p){
  const float e=0.1;
  vec3 dx=vec3(e,0.0,0.0); vec3 dy=vec3(0.0,e,0.0); vec3 dz=vec3(0.0,0.0,e);
  vec3 px0=snoiseVec3(p-dx); vec3 px1=snoiseVec3(p+dx);
  vec3 py0=snoiseVec3(p-dy); vec3 py1=snoiseVec3(p+dy);
  vec3 pz0=snoiseVec3(p-dz); vec3 pz1=snoiseVec3(p+dz);
  float x=py1.z-py0.z-pz1.y+pz0.y;
  float y=pz1.x-pz0.x-px1.z+px0.z;
  float z=px1.y-px0.y-py1.x+py0.x;
  return normalize(vec3(x,y,z)/(2.0*e));
}
`;

/** 2D value-noise fbm, cheap (for backdrops) */
export const GLSL_FBM2 = /* glsl */ `
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1.0,0.0)),u.x),mix(hash12(i+vec2(0.0,1.0)),hash12(i+vec2(1.0,1.0)),u.x),u.y);}
float fbm(vec2 p){float v=0.0;float a=0.5;mat2 r=mat2(0.8,0.6,-0.6,0.8);for(int i=0;i<5;i++){v+=a*vnoise(p);p=r*p*2.02;a*=0.5;}return v;}
`;

/** rounded-rect SDF in uv space: p in [-0.5,0.5]*size */
export const GLSL_ROUNDRECT = /* glsl */ `
float sdRoundRect(vec2 p, vec2 b, float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;}
`;

/** cover-fit uv for an image of aspect `ia` into a plane of aspect `pa` */
export const GLSL_COVER = /* glsl */ `
vec2 coverUv(vec2 uv, float pa, float ia){
  vec2 s = pa > ia ? vec2(1.0, ia/pa) : vec2(pa/ia, 1.0);
  return (uv-0.5)*s+0.5;
}
`;

/**
 * Procedural studio environment (no HDR downloads, §2.4): a soft gradient dome + softboxes tinted with theme colours,
 * prefiltered through PMREM and assigned to `scene.environment`. Re-generated when `key` changes (theme version).
 */
export function useStudioEnvironment(colors: { key?: THREE.Color; a: THREE.Color; b: THREE.Color; base: THREE.Color }, key: string | number, intensity = 1) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  React.useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new THREE.Scene();
    const disposables: { dispose: () => void }[] = [];
    const add = (geo: THREE.BufferGeometry, color: THREE.Color, strength: number, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
      const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(strength), side: THREE.DoubleSide, toneMapped: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.rotation.set(...rot);
      env.add(m);
      disposables.push(geo, mat);
      m.lookAt(0, 0, 0);
    };
    // dome
    const dome = new THREE.SphereGeometry(20, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uTop: { value: colors.base.clone().lerp(new THREE.Color(1, 1, 1), 0.25) }, uBot: { value: colors.base.clone().multiplyScalar(0.35) } },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 uTop; uniform vec3 uBot; varying vec3 vP; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(uBot, uTop, smoothstep(0.0, 1.0, h)), 1.0); }",
    });
    env.add(new THREE.Mesh(dome, domeMat));
    disposables.push(dome, domeMat);
    const white = colors.key ?? new THREE.Color(1, 1, 1);
    add(new THREE.PlaneGeometry(10, 6), white, 3.2 * intensity, [0, 9, 4]);
    add(new THREE.PlaneGeometry(3, 12), colors.a, 2.4 * intensity, [-10, 1, 2]);
    add(new THREE.PlaneGeometry(3, 12), colors.b, 2.4 * intensity, [10, 0, -2]);
    add(new THREE.PlaneGeometry(14, 1.2), white, 1.6 * intensity, [0, -2, -10]);
    add(new THREE.CircleGeometry(1.6, 24), white, 4 * intensity, [5, 5, 8]);
    const rt = pmrem.fromScene(env, 0.035);
    const prev = scene.environment;
    scene.environment = rt.texture;
    invalidate();
    return () => {
      if (scene.environment === rt.texture) scene.environment = prev ?? null;
      rt.dispose();
      pmrem.dispose();
      disposables.forEach((d) => d.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, key, intensity]);
}

/** Fresnel-alpha glass for transparent canvases (DOM shows through; real transmission would see only black). */
export function makeGlassMaterial(color: THREE.Color, opts: { minAlpha?: number; tint?: number; iridescence?: number } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.7),
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 2.4,
    iridescence: opts.iridescence ?? 0.5,
    iridescenceIOR: 1.25,
    transparent: true,
    depthWrite: false,
  });
  const minA = opts.minAlpha ?? 0.16;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float rwFres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.2);
      float rwLum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
      diffuseColor.a = clamp(max(mix(${minA.toFixed(3)}, 1.0, rwFres), rwLum * 1.5 - 0.3), 0.0, 1.0);
      #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => `rw-glass-${minA}`;
  return m;
}
