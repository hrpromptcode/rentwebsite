"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { mulberry32 } from "../core/random";
import { ensureFont, resolveFontFamily, wrapText } from "../core/canvas-text";
import { rgbaToHex, resolveCssColor } from "../core/theme-colors";
import { damp, dtc, stepPointer, textureSrc, usePointer } from "./shared";
import type { TunnelStep } from "../wormhole-tunnel";
import type { TokenOrColor } from "../core/types";

interface Props {
  steps: TunnelStep[];
  tint: TokenOrColor;
  wireframe: boolean;
  rings: number;
  stars: boolean;
  progress: React.MutableRefObject<number>;
}

const T_END = 0.9;
const RADIUS = 2.6;

const lineVert = /* glsl */ `
attribute float aT;
attribute float aKind;
varying float vT;
varying float vKind;
varying float vDist;
void main(){
  vT = aT; vKind = aKind;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const lineFrag = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uFg;
uniform float uCamT;
uniform float uTime;
uniform float uGain;
varying float vT;
varying float vKind;
varying float vDist;
void main(){
  float fog = 1.0 - smoothstep(6.0, 42.0, vDist);
  float near = smoothstep(0.2, 1.8, vDist);
  float pulse = exp(-pow((vT - fract(uCamT + 0.04 + uTime * 0.035)) * 60.0, 2.0));
  vec3 col = mix(uTint, uFg, vKind * 0.35);
  float a = (vKind > 0.5 ? 0.38 : 0.78) * fog * near * uGain + pulse * 0.9 * fog;
  gl_FragColor = vec4(col + pulse * 0.5, a);
  #include <colorspace_fragment>
}
`;

const tubeFrag = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uBg;
uniform float uTime;
varying vec2 vUv;
varying float vDist;
void main(){
  float bands = smoothstep(0.92, 1.0, fract(vUv.x * 80.0 - uTime * 0.6));
  float seams = smoothstep(0.96, 1.0, fract(vUv.y * 18.0));
  float fog = 1.0 - smoothstep(4.0, 32.0, vDist);
  vec3 col = mix(uBg, uTint, 0.18 + (bands + seams) * 0.6);
  gl_FragColor = vec4(col, (0.25 + (bands + seams) * 0.5) * fog);
  #include <colorspace_fragment>
}
`;
const tubeVert = /* glsl */ `
varying vec2 vUv;
varying float vDist;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }
`;

const starVert = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPx;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 40.0);
  gl_PointSize = (1.2 + aSeed * 2.2) * uPx * (8.0 / max(-mv.z, 0.5));
  vA = tw * (1.0 - smoothstep(6.0, 34.0, -mv.z)) * smoothstep(0.3, 1.5, -mv.z);
}
`;
const starFrag = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vA);
  #include <colorspace_fragment>
}
`;

const glowFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5);
  float a = exp(-d * d * 18.0) * 0.9 + exp(-d * d * 120.0) * 0.6;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), exp(-d * d * 200.0) * 0.6), a * uAlpha);
  #include <colorspace_fragment>
}
`;

const cardFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uLoaded;
uniform float uAlpha;
uniform vec3 uTint;
varying vec2 vUv;
varying float vDist;
float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
void main(){
  vec2 p = (vUv - 0.5) * vec2(1.6, 1.0);
  float d = sdRR(p, vec2(0.8, 0.5), 0.05);
  float aa = fwidth(d);
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask < 0.01) discard;
  vec3 col = mix(uTint * 0.3, texture2D(uMap, vUv).rgb, uLoaded);
  float rim = 1.0 - smoothstep(0.0, aa * 3.0, abs(d + aa * 2.0));
  col = mix(col, uTint, rim * 0.8);
  float fog = 1.0 - smoothstep(10.0, 30.0, vDist);
  float near = smoothstep(0.4, 2.2, vDist);
  gl_FragColor = vec4(col, mask * fog * near * uAlpha);
  #include <colorspace_fragment>
}
`;

function buildPath(n: number) {
  const r = mulberry32(4242 + n);
  const pts: THREE.Vector3[] = [];
  const segs = Math.max(6, n * 3 + 4);
  for (let i = 0; i <= segs; i++) {
    pts.push(new THREE.Vector3(Math.sin(i * 0.55 + r() * 0.6) * 1.35, Math.cos(i * 0.41 + r() * 0.6) * 0.85, -i * 7.5));
  }
  return new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
}

async function drawCard(step: TunnelStep, index: number, total: number, colors: { tint: string; bg: string; fg: string }): Promise<HTMLCanvasElement> {
  const W = 1024;
  const H = 640;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  // background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, colors.tint);
  g.addColorStop(1, colors.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (step.image) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = textureSrc(step.image, 1024);
      await img.decode();
      const ia = img.naturalWidth / img.naturalHeight;
      const ca = W / H;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;
      if (ia > ca) sw = sh * ca;
      else sh = sw / ca;
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, W, H);
    } catch {
      /* gradient only */
    }
  }
  const shade = ctx.createLinearGradient(0, H * 0.35, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  const fam = resolveFontFamily("--font-display");
  const font = `600 64px ${fam}`;
  await ensureFont(font, step.title);
  ctx.fillStyle = "#fff";
  ctx.font = `500 26px ${resolveFontFamily("--font-body")}`;
  ctx.globalAlpha = 0.8;
  ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}${step.kicker ? "  ·  " + step.kicker : ""}`, 48, H - 48 - 64 * 1.3 * Math.min(2, 1) - 16);
  ctx.globalAlpha = 1;
  ctx.font = font;
  const lines = wrapText(ctx, step.title, W - 96).slice(0, 2);
  const lh = 64 * 1.3;
  lines.forEach((l, k) => ctx.fillText(l, 48, H - 48 - (lines.length - 1 - k) * lh));
  if (!step.image) {
    ctx.font = `700 260px ${resolveFontFamily("--font-display")}`;
    ctx.globalAlpha = 0.18;
    ctx.fillText(String(index + 1).padStart(2, "0"), W - 380, 250);
    ctx.globalAlpha = 1;
  }
  return c;
}

export default function WormholeTunnelScene({ steps, tint, wireframe, rings, stars, progress }: Props) {
  const env = useSceneEnv();
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const theme = useThemeColors([tint, "foreground", "background"], env.rootRef);
  const n = steps.length;
  const path = React.useMemo(() => buildPath(n), [n]);
  // `rings` = rings per 40 world units of tunnel (~1 ring per unit at the default 48)
  const ringCount = Math.max(24, Math.min(400, Math.round(((env.quality === "high" ? rings : rings * 0.6) * path.getLength()) / 40)));
  const frames = React.useMemo(() => path.computeFrenetFrames(400, false), [path]);

  // wire tunnel: rings + longitudinal lines
  const lines = React.useMemo(() => {
    const pos: number[] = [];
    const ts: number[] = [];
    const kinds: number[] = [];
    const seg = 72;
    const P = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const frameAt = (t: number) => {
      const i = Math.min(frames.normals.length - 1, Math.round(t * (frames.normals.length - 1)));
      return { N: frames.normals[i]!, B: frames.binormals[i]! };
    };
    const onRing = (t: number, a: number, out: THREE.Vector3) => {
      path.getPointAt(t, P);
      const { N, B } = frameAt(t);
      const rr = RADIUS * (1 + Math.sin(t * 40 + a * 3) * 0.04);
      return out.copy(P).addScaledVector(N, Math.cos(a) * rr).addScaledVector(B, Math.sin(a) * rr);
    };
    for (let k = 0; k <= ringCount; k++) {
      const t = k / ringCount;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2;
        const a1 = ((s + 1) / seg) * Math.PI * 2;
        onRing(t, a0, tmp);
        pos.push(tmp.x, tmp.y, tmp.z);
        onRing(t, a1, tmp);
        pos.push(tmp.x, tmp.y, tmp.z);
        ts.push(t, t);
        kinds.push(0, 0);
      }
    }
    const longs = 20;
    const steps2 = 220;
    for (let j = 0; j < longs; j++) {
      const a = (j / longs) * Math.PI * 2;
      for (let s = 0; s < steps2; s++) {
        const t0 = s / steps2;
        const t1 = (s + 1) / steps2;
        onRing(t0, a, tmp);
        pos.push(tmp.x, tmp.y, tmp.z);
        onRing(t1, a, tmp);
        pos.push(tmp.x, tmp.y, tmp.z);
        ts.push(t0, t1);
        kinds.push(1, 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
    g.setAttribute("aKind", new THREE.Float32BufferAttribute(kinds, 1));
    return g;
  }, [path, frames, ringCount]);
  React.useEffect(() => () => lines.dispose(), [lines]);

  const tube = React.useMemo(() => (wireframe ? null : new THREE.TubeGeometry(path, 400, RADIUS, 48, false)), [path, wireframe]);
  React.useEffect(() => () => tube?.dispose(), [tube]);

  const starGeo = React.useMemo(() => {
    if (!stars) return null;
    const r = mulberry32(99);
    const count = env.quality === "high" ? 2200 : 900;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const P = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const t = r();
      path.getPointAt(t, P);
      const a = r() * Math.PI * 2;
      const rr = RADIUS * (1.3 + r() * 3.5);
      pos[i * 3] = P.x + Math.cos(a) * rr;
      pos[i * 3 + 1] = P.y + Math.sin(a) * rr;
      pos[i * 3 + 2] = P.z + (r() - 0.5) * 6;
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [stars, path, env.quality]);
  React.useEffect(() => () => starGeo?.dispose(), [starGeo]);

  const mats = React.useMemo(() => {
    const line = new THREE.ShaderMaterial({ vertexShader: lineVert, fragmentShader: lineFrag, transparent: true, depthWrite: false, uniforms: { uTint: { value: theme[tint] }, uFg: { value: theme.foreground }, uCamT: { value: 0 }, uTime: { value: 0 }, uGain: { value: 1 } } });
    const tubeM = new THREE.ShaderMaterial({ vertexShader: tubeVert, fragmentShader: tubeFrag, transparent: true, depthWrite: false, side: THREE.BackSide, uniforms: { uTint: { value: theme[tint] }, uBg: { value: theme.background }, uTime: { value: 0 } } });
    const star = new THREE.ShaderMaterial({ vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false, uniforms: { uColor: { value: theme.foreground }, uTime: { value: 0 }, uPx: { value: 1 } } });
    const glow = new THREE.ShaderMaterial({ vertexShader: tubeVert, fragmentShader: glowFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: theme[tint] }, uAlpha: { value: 0.55 } } });
    return { line, tube: tubeM, star, glow };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tint]);
  React.useEffect(
    () => () => {
      mats.line.dispose();
      mats.tube.dispose();
      mats.star.dispose();
      mats.glow.dispose();
    },
    [mats],
  );
  React.useEffect(() => {
    const blend = theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    mats.line.blending = blend;
    mats.star.blending = blend;
    mats.line.uniforms.uGain!.value = theme.dark ? 1 : 1.25;
    mats.glow.blending = blend;
    mats.glow.uniforms.uAlpha!.value = theme.dark ? 0.55 : 0.3;
    mats.glow.needsUpdate = true;
    mats.star.uniforms.uPx!.value = gl.getPixelRatio();
    mats.line.needsUpdate = true;
    mats.star.needsUpdate = true;
    invalidate();
  }, [mats, theme.dark, theme.version, gl, invalidate]);

  // step cards: canvas textures (image + title) along the path, alternating sides
  const cardData = React.useMemo(
    () =>
      steps.map((_, i) => {
        const t = ((i + 0.88) / n) * T_END + 0.012;
        const P = path.getPointAt(Math.min(0.995, t));
        const fi = Math.min(frames.normals.length - 1, Math.round(t * (frames.normals.length - 1)));
        const N = frames.normals[fi]!;
        const B = frames.binormals[fi]!;
        const T = frames.tangents[fi]!;
        const side = i % 2 === 0 ? 1 : -1;
        const pos = P.clone().addScaledVector(N, 1.05 * side).addScaledVector(B, 0.35 * -side);
        const m = new THREE.Matrix4().lookAt(pos, pos.clone().add(T), B);
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06 * side, -0.38 * side, 0.07 * side)));
        return { pos, q, t };
      }),
    [steps, n, path, frames],
  );
  const cardGeo = React.useMemo(() => new THREE.PlaneGeometry(2.24, 1.4), []);
  React.useEffect(() => () => cardGeo.dispose(), [cardGeo]);
  const cardMats = React.useMemo(
    () =>
      steps.map(
        () =>
          new THREE.ShaderMaterial({
            vertexShader: tubeVert,
            fragmentShader: cardFrag,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: { uMap: { value: null as THREE.Texture | null }, uLoaded: { value: 0 }, uAlpha: { value: 1 }, uTint: { value: theme[tint] } },
          }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, tint],
  );
  React.useEffect(() => () => cardMats.forEach((m) => m.dispose()), [cardMats]);
  React.useEffect(() => {
    let alive = true;
    const made: THREE.Texture[] = [];
    const root = env.rootRef.current;
    const colors = { tint: rgbaToHex(resolveCssColor(tint, root)), bg: rgbaToHex(resolveCssColor("background", root)), fg: rgbaToHex(resolveCssColor("foreground", root)) };
    steps.forEach((s, i) => {
      drawCard(s, i, n, colors).then((canvas) => {
        if (!alive) return;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
        made.push(tex);
        const m = cardMats[i];
        if (m) {
          m.uniforms.uMap!.value = tex;
          m.uniforms.uLoaded!.value = 1;
        }
        invalidate();
      });
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, cardMats, theme.version]);

  const ptr = usePointer(env.rootRef);
  const st = React.useRef({ t: 0, time: 0 });
  const look = React.useMemo(() => new THREE.Vector3(), []);
  const pos = React.useMemo(() => new THREE.Vector3(), []);
  const up = React.useMemo(() => new THREE.Vector3(), []);
  const glowRef = React.useRef<THREE.Mesh>(null);
  const ahead = React.useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const s = st.current;
    s.time += dt * env.speed;
    const target = progress.current * T_END;
    s.t = env.reducedMotion ? target : damp(s.t, target, 3.2, dt);
    const t = Math.max(0, Math.min(0.995, s.t));
    path.getPointAt(t, pos);
    path.getPointAt(Math.min(1, t + 0.012), look);
    const fi = Math.min(frames.normals.length - 1, Math.round(t * (frames.normals.length - 1)));
    const N = frames.normals[fi]!;
    const B = frames.binormals[fi]!;
    const p = ptr.current;
    stepPointer(p, dt, 2);
    const px = env.finePointer ? p.sx : 0;
    const py = env.finePointer ? p.sy : 0;
    pos.addScaledVector(N, px * 0.35).addScaledVector(B, py * 0.25);
    camera.position.copy(pos);
    up.copy(B).lerp(new THREE.Vector3(0, 1, 0), 0.65).normalize();
    camera.up.copy(up);
    camera.lookAt(look);
    const g = glowRef.current;
    if (g) {
      path.getPointAt(Math.min(1, t + 0.16), ahead);
      g.position.copy(ahead);
      g.quaternion.copy(camera.quaternion);
    }
    mats.line.uniforms.uCamT!.value = t;
    mats.line.uniforms.uTime!.value = s.time;
    mats.tube.uniforms.uTime!.value = s.time;
    mats.star.uniforms.uTime!.value = s.time;
    // cards fade once the camera passed them
    cardData.forEach((c, i) => {
      const m = cardMats[i];
      if (!m) return;
      const passed = t - c.t;
      m.uniforms.uAlpha!.value = 1 - THREE.MathUtils.smoothstep(passed, -0.004, 0.01);
    });
  });

  return (
    <>
      <mesh ref={glowRef} material={mats.glow} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[14, 14]} />
      </mesh>
      <lineSegments geometry={lines} material={mats.line} frustumCulled={false} />
      {tube ? <mesh geometry={tube} material={mats.tube} frustumCulled={false} /> : null}
      {starGeo ? <points geometry={starGeo} material={mats.star} frustumCulled={false} /> : null}
      {cardData.map((c, i) => (
        <mesh key={i} geometry={cardGeo} material={cardMats[i]} position={c.pos} quaternion={c.q} />
      ))}
    </>
  );
}
