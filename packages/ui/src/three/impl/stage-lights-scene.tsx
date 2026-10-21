"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { mulberry32 } from "../core/random";
import { GLSL_FBM2, dtc } from "./shared";
import type { StageLightsProps } from "../stage-lights";
import type { TokenOrColor } from "../core/types";

const MAXB = 8;
const BEAM_LEN = 12;
const BEAM_R = 2.1;

const beamVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
void main(){
  vL = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = mv.xyz;
  vN = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}
`;
const beamFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uMirror;
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
${GLSL_FBM2}
void main(){
  float y = clamp(-vL.y / ${BEAM_LEN.toFixed(1)}, 0.0, 1.0);
  float facing = abs(dot(normalize(vN), normalize(-vV)));
  float core = pow(facing, 2.2);
  float along = pow(1.0 - y, 1.35) * smoothstep(0.0, 0.04, y);
  float n = fbm(vec2(atan(vL.x, vL.z) * 1.5, y * 4.0 - uTime * 0.35)) * 0.8 + 0.45;
  float a = core * along * n * uIntensity * mix(1.0, 0.22, uMirror);
  if (uMirror > 0.5) a *= smoothstep(0.0, 0.5, 1.0 - y);
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

const flareFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5;
  float d = length(p);
  float a = exp(-d * d * 60.0) * 1.2 + exp(-d * d * 8.0) * 0.25;
  a += exp(-abs(p.y) * 90.0) * exp(-abs(p.x) * 6.0) * 0.25;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.6), a * uIntensity);
  #include <colorspace_fragment>
}
`;
const uvVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

const floorFrag = /* glsl */ `
uniform vec3 uHits[${MAXB}];
uniform vec3 uCols[${MAXB}];
uniform float uCount;
uniform float uIntensity;
varying vec3 vW;
void main(){
  vec3 acc = vec3(0.0);
  float a = 0.0;
  for (int i = 0; i < ${MAXB}; i++) {
    if (float(i) >= uCount) break;
    vec2 d = (vW.xz - uHits[i].xz) * vec2(0.55, 1.4);
    float g = exp(-dot(d, d) * 0.9) * uHits[i].y;
    acc += uCols[i] * g;
    a += g;
  }
  float fade = 1.0 - smoothstep(4.0, 14.0, length(vW.xz));
  gl_FragColor = vec4(acc / max(a, 1e-3), clamp(a, 0.0, 1.0) * 0.55 * uIntensity * fade);
  #include <colorspace_fragment>
}
`;

const moteVert = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPx;
uniform vec3 uApex[${MAXB}];
uniform vec3 uDir[${MAXB}];
uniform float uCount;
varying float vA;
void main(){
  vec3 p = position;
  p.x += sin(uTime * 0.2 + aSeed * 30.0) * 0.4;
  p.y += mod(uTime * (0.08 + aSeed * 0.12) + aSeed * 9.0, 9.0) - 4.5;
  p.y = mod(p.y + 4.5, 9.0) - 4.5;
  float lit = 0.0;
  for (int i = 0; i < ${MAXB}; i++) {
    if (float(i) >= uCount) break;
    vec3 v = p - uApex[i];
    float along = dot(v, uDir[i]);
    if (along <= 0.0) continue;
    float perp = length(v - uDir[i] * along);
    float rad = along * ${(BEAM_R / BEAM_LEN).toFixed(4)};
    lit += smoothstep(rad, rad * 0.3, perp) * (1.0 - along / ${BEAM_LEN.toFixed(1)});
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.0 + aSeed * 2.0) * uPx * (10.0 / max(-mv.z, 0.5));
  vA = 0.06 + lit * 0.9;
}
`;
const moteFrag = /* glsl */ `
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.0, d) * vA);
  #include <colorspace_fragment>
}
`;

const crowdFrag = /* glsl */ `
uniform vec3 uDark;
uniform vec3 uRim;
uniform float uTime;
uniform float uBeat;
uniform float uAspect;
uniform float uCount;
varying vec2 vUv;
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdCap(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a; vec2 ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
// one person in cell units (x: cell index space, y: cell widths above the plane bottom)
float person(vec2 p, float id, float t, float beat, float base){
  float r = h1(id);
  float r2 = h1(id + 7.31);
  float cx = id + 0.5 + (r - 0.5) * 0.35;
  float sy = base + r2 * 0.35;
  float hr = 0.25 + r * 0.05;
  float d = sdBox(p - vec2(cx, sy - 1.2), vec2(0.44, 1.2), 0.22);
  d = min(d, length((p - vec2(cx, sy + hr * 1.25)) * vec2(1.0, 0.92)) - hr);
  d = min(d, sdBox(p - vec2(cx, sy + 0.08), vec2(0.1, 0.14), 0.05));
  if (r > 0.72) {
    float side = r2 > 0.5 ? 1.0 : -1.0;
    vec2 sh = vec2(cx + side * 0.3, sy - 0.08);
    vec2 elbow = sh + vec2(side * 0.22, 0.6 + beat * 0.06);
    vec2 hand = elbow + vec2(side * (0.05 + sin(t * 2.2 + r * 9.0) * 0.12), 0.62 + beat * 0.1);
    d = min(d, sdCap(p, sh, elbow, 0.085));
    d = min(d, sdCap(p, elbow, hand, 0.075));
    d = min(d, length(p - hand) - 0.11);
  }
  return d;
}
float row(vec2 uv, float n, float yOff, float seed, float t, float beat){
  vec2 p = vec2(uv.x * n, uv.y * n * uAspect - yOff);
  float id = floor(p.x);
  float d = 9.0;
  for (int k = -1; k <= 1; k++) d = min(d, person(p, id + float(k) + seed, t, beat, 0.0) );
  return d;
}
void main(){
  float back = row(vUv, floor(uCount * 1.55), 1.15, 100.0, uTime, uBeat * 0.6);
  float front = row(vUv, uCount, 0.35, 0.0, uTime, uBeat);
  float aaB = fwidth(back);
  float aaF = fwidth(front);
  float inB = 1.0 - smoothstep(-aaB, aaB, back);
  float inF = 1.0 - smoothstep(-aaF, aaF, front);
  vec3 cB = mix(uDark * 1.6, uRim, 0.06);
  vec3 cF = uDark;
  float rimF = (1.0 - smoothstep(0.0, aaF * 3.0, abs(front))) * (1.0 - inF * 0.5);
  vec3 col = mix(cB, cF, inF);
  col = mix(col, uRim, rimF * 0.35);
  float a = max(inF, inB * 0.96);
  a = max(a, rimF * 0.4);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

export default function StageLightsScene({ beams = 6, colors = ["primary", "accent"], haze = true, sweep = 0.35, bpm = 118, floor = "reflect", crowd = false }: StageLightsProps) {
  const env = useSceneEnv();
  const viewport = useThree((s) => s.viewport);
  const gl = useThree((s) => s.gl);
  const keys = (colors.length ? colors : ["primary", "accent"]) as TokenOrColor[];
  const theme = useThemeColors([...keys, "background"], env.rootRef);
  const count = Math.max(1, Math.min(MAXB, env.quality === "high" ? beams : Math.min(beams, 4)));
  const top = viewport.height / 2 + 0.3;
  const floorY = -viewport.height / 2 + 0.6;

  const beamGeo = React.useMemo(() => {
    const g = new THREE.ConeGeometry(BEAM_R, BEAM_LEN, 48, 12, true);
    g.translate(0, -BEAM_LEN / 2, 0);
    return g;
  }, []);
  React.useEffect(() => () => beamGeo.dispose(), [beamGeo]);

  const beamsData = React.useMemo(() => {
    const r = mulberry32(17 + count);
    const span = Math.min(viewport.width * 0.82, 13);
    return Array.from({ length: count }, (_, i) => {
      const color = theme[keys[i % keys.length]!]!;
      const mat = new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: color }, uTime: { value: 0 }, uIntensity: { value: 0.5 }, uMirror: { value: 0 } } });
      const mirror = mat.clone();
      mirror.uniforms.uColor!.value = color;
      mirror.uniforms.uMirror!.value = 1;
      const flare = new THREE.ShaderMaterial({ vertexShader: uvVert, fragmentShader: flareFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: color }, uIntensity: { value: 1 } } });
      return { x: count === 1 ? 0 : -span / 2 + (span * i) / (count - 1), phase: r() * 6.28, rate: 0.3 + r() * 0.25, color, mat, mirror, flare };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, viewport.width, keys.join("|")]);
  React.useEffect(
    () => () =>
      beamsData.forEach((b) => {
        b.mat.dispose();
        b.mirror.dispose();
        b.flare.dispose();
      }),
    [beamsData],
  );

  const floorMat = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: uvVert,
        fragmentShader: floorFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uHits: { value: Array.from({ length: MAXB }, () => new THREE.Vector3()) }, uCols: { value: Array.from({ length: MAXB }, () => new THREE.Color()) }, uCount: { value: 0 }, uIntensity: { value: 1 } },
      }),
    [],
  );
  const moteGeo = React.useMemo(() => {
    if (!haze) return null;
    const r = mulberry32(5);
    const n = env.quality === "high" ? 1800 : 700;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 16;
      pos[i * 3 + 1] = (r() - 0.5) * 9;
      pos[i * 3 + 2] = (r() - 0.5) * 6;
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [haze, env.quality]);
  const moteMat = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: moteVert,
        fragmentShader: moteFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uApex: { value: Array.from({ length: MAXB }, () => new THREE.Vector3()) }, uDir: { value: Array.from({ length: MAXB }, () => new THREE.Vector3(0, -1, 0)) }, uCount: { value: 0 } },
      }),
    [],
  );
  const crowdMat = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: uvVert,
        fragmentShader: crowdFrag,
        transparent: true,
        depthWrite: false,
        uniforms: { uDark: { value: new THREE.Color() }, uRim: { value: theme[keys[0]!] }, uTime: { value: 0 }, uBeat: { value: 0 }, uAspect: { value: 0.2 }, uCount: { value: 19 } },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  React.useEffect(
    () => () => {
      floorMat.dispose();
      moteGeo?.dispose();
      moteMat.dispose();
      crowdMat.dispose();
    },
    [floorMat, moteGeo, moteMat, crowdMat],
  );
  React.useEffect(() => {
    (crowdMat.uniforms.uDark!.value as THREE.Color).copy(theme.background).multiplyScalar(0.35);
    moteMat.uniforms.uPx!.value = gl.getPixelRatio();
  }, [crowdMat, moteMat, theme.version, theme.background, gl]);

  const pivots = React.useRef<(THREE.Group | null)[]>([]);
  const mirrors = React.useRef<(THREE.Group | null)[]>([]);
  const st = React.useRef({ t: 0 });
  const tmpDir = React.useMemo(() => new THREE.Vector3(), []);
  const tmpQ = React.useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const s = st.current;
    s.t += dt * env.speed;
    const beat = Math.pow(0.5 + 0.5 * Math.cos(s.t * Math.PI * 2 * (bpm / 60)), 6);
    const pulse = env.speed > 0 ? 0.72 + 0.28 * beat : 0.85;
    const hits = floorMat.uniforms.uHits!.value as THREE.Vector3[];
    const cols = floorMat.uniforms.uCols!.value as THREE.Color[];
    const apex = moteMat.uniforms.uApex!.value as THREE.Vector3[];
    const dirs = moteMat.uniforms.uDir!.value as THREE.Vector3[];
    beamsData.forEach((b, i) => {
      const g = pivots.current[i];
      if (!g) return;
      const rz = Math.sin(s.t * b.rate + b.phase) * 0.6 * sweep * 2 + (b.x / 8) * -0.35;
      const rx = Math.sin(s.t * b.rate * 0.8 + b.phase * 1.7) * 0.28 * sweep * 2 + 0.18;
      g.rotation.set(rx, 0, rz);
      g.position.set(b.x, top, -1.5);
      b.mat.uniforms.uTime!.value = s.t;
      b.mat.uniforms.uIntensity!.value = (theme.dark ? 0.55 : 0.4) * pulse;
      b.mirror.uniforms.uTime!.value = s.t;
      b.mirror.uniforms.uIntensity!.value = (theme.dark ? 0.55 : 0.4) * pulse;
      b.flare.uniforms.uIntensity!.value = pulse;
      // axis → floor hit
      g.updateMatrixWorld();
      tmpDir.set(0, -1, 0).applyQuaternion(g.getWorldQuaternion(tmpQ));
      apex[i]!.copy(g.position);
      dirs[i]!.copy(tmpDir);
      const tHit = (floorY - g.position.y) / Math.min(-0.05, tmpDir.y);
      const hx = g.position.x + tmpDir.x * tHit;
      const hz = g.position.z + tmpDir.z * tHit;
      hits[i]!.set(hx, tHit < BEAM_LEN * 1.1 ? pulse : 0, hz);
      cols[i]!.copy(b.color);
      const m = mirrors.current[i];
      if (m) {
        m.position.set(b.x, 2 * floorY - top, -1.5);
        m.rotation.set(-rx, 0, -rz);
      }
    });
    floorMat.uniforms.uCount!.value = count;
    moteMat.uniforms.uCount!.value = count;
    moteMat.uniforms.uTime!.value = s.t;
    crowdMat.uniforms.uTime!.value = s.t;
    crowdMat.uniforms.uBeat!.value = beat;
    crowdMat.uniforms.uAspect!.value = (viewport.height * 0.24) / (viewport.width * 1.05);
    crowdMat.uniforms.uCount!.value = Math.round(THREE.MathUtils.clamp(viewport.width * 1.25, 6, 20));
  });

  return (
    <>
      {beamsData.map((b, i) => (
        <group key={i} ref={(g) => void (pivots.current[i] = g)}>
          <mesh geometry={beamGeo} material={b.mat} renderOrder={2} />
          <mesh material={b.flare} renderOrder={3}>
            <planeGeometry args={[1.6, 1.6]} />
          </mesh>
        </group>
      ))}
      {floor === "reflect"
        ? beamsData.map((b, i) => (
            <group key={`m${i}`} ref={(g) => void (mirrors.current[i] = g)} scale={[1, -1, 1]}>
              <mesh geometry={beamGeo} material={b.mirror} renderOrder={1} />
            </group>
          ))
        : null}
      {floor === "reflect" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} material={floorMat} renderOrder={1}>
          <planeGeometry args={[30, 16]} />
        </mesh>
      ) : null}
      {moteGeo ? <points geometry={moteGeo} material={moteMat} frustumCulled={false} renderOrder={4} /> : null}
      {crowd ? (
        <mesh position={[0, -viewport.height / 2 + viewport.height * 0.11, 0.5]} material={crowdMat} renderOrder={5}>
          <planeGeometry args={[viewport.width * 1.05, viewport.height * 0.24]} />
        </mesh>
      ) : null}
    </>
  );
}
