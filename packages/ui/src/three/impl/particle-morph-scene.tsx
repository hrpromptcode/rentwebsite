"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { useSectionProgress } from "../core/use-section-progress";
import { mulberry32 } from "../core/random";
import { GLSL_CURL, GLSL_SIMPLEX, damp, dtc, stepPointer, usePointer } from "./shared";
import { buildShapeAsync, buildShapeSync, shapeKey } from "./particle-shapes";
import type { ParticleMorphProps } from "../particle-morph";

const vert = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec4 aRand;
uniform float uMorph;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uViewH;
uniform vec3 uPointer;
uniform float uRepel;
uniform float uSwirl;
varying float vMix;
varying float vAlpha;
${GLSL_SIMPLEX}
${GLSL_CURL}
void main(){
  float m = clamp((uMorph - aRand.x * 0.4) / 0.6, 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);
  vec3 pos = mix(aFrom, aTo, m);
  float sw = sin(m * 3.14159265) * uSwirl;
  if (sw > 0.002) pos += curlNoise(pos * 0.55 + aRand.yzw * 3.0 + uTime * 0.03) * sw * 0.7;
  // idle shimmer
  pos += vec3(snoise(pos * 0.9 + uTime * 0.12), snoise(pos * 0.9 + 17.0 + uTime * 0.12), snoise(pos * 0.9 + 41.0 + uTime * 0.1)) * 0.022;
  // pointer repel (object space)
  vec2 d = pos.xy - uPointer.xy;
  float dl = length(d);
  float f = exp(-dl * dl * 2.6) * uRepel;
  pos.xy += (d / max(dl, 1e-3)) * f * 0.55;
  pos.z += f * 0.35;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizeJ = 0.55 + aRand.y * 0.9;
  gl_PointSize = uSize * 1.5 * uPixelRatio * sizeJ * clamp(uViewH / 760.0, 0.6, 1.6) * (6.4 / max(-mv.z, 0.5));
  vMix = clamp(pos.y * 0.28 + 0.5 + (aRand.z - 0.5) * 0.25, 0.0, 1.0);
  vAlpha = (0.45 + 0.55 * aRand.w) * (1.0 - smoothstep(6.0, 9.5, -mv.z)) * (1.0 + f * 0.8);
}
`;

const frag = /* glsl */ `
uniform vec3 uC0;
uniform vec3 uC1;
uniform float uGain;
varying float vMix;
varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  vec3 col = mix(uC0, uC1, vMix);
  gl_FragColor = vec4(col, a * vAlpha * uGain);
  #include <colorspace_fragment>
}
`;

export default function ParticleMorphScene({ shapes, active, auto, morphOn, count, size = 1.6, colors, pointerRepel = 0.6, rotate = 0.08, depth = 0.35 }: ParticleMorphProps) {
  const env = useSceneEnv();
  const viewport = useThree((s) => s.viewport);
  const sz = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const c0 = (colors?.[0] ?? "primary") as string;
  const c1 = (colors?.[1] ?? "accent") as string;
  const theme = useThemeColors([c0, c1, "background"], env.rootRef);
  const n = Math.max(500, Math.min(80000, count ?? (env.quality === "high" && !env.mobile ? 40000 : 18000)));
  const mode = morphOn ?? (active !== undefined ? "controlled" : "time");
  const list = shapes.length ? shapes : (["sphere"] as const);
  const keySig = list.map(shapeKey).join("|");

  // geometry with base attributes; morph targets are swapped buffers
  const geometry = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    const r = mulberry32(n * 31 + 7);
    const rand = new Float32Array(n * 4);
    for (let i = 0; i < rand.length; i++) rand[i] = r();
    const zero = new Float32Array(n * 3);
    g.setAttribute("position", new THREE.BufferAttribute(zero, 3));
    g.setAttribute("aFrom", new THREE.BufferAttribute(zero, 3));
    g.setAttribute("aTo", new THREE.BufferAttribute(zero, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    return g;
  }, [n]);
  React.useEffect(() => () => geometry.dispose(), [geometry]);

  const buffers = React.useRef<(THREE.BufferAttribute | null)[]>([]);
  const [ready, setReady] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    const arr: (THREE.BufferAttribute | null)[] = list.map((s) => {
      const p = buildShapeSync(s, n);
      return p ? new THREE.BufferAttribute(p, 3) : null;
    });
    buffers.current = arr;
    setReady((v) => v + 1);
    list.forEach((s, i) => {
      if (arr[i]) return;
      buildShapeAsync(s, n, depth).then((p) => {
        if (!alive) return;
        arr[i] = new THREE.BufferAttribute(p, 3);
        setReady((v) => v + 1);
        invalidate();
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig, n, depth]);

  const material = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMorph: { value: 0 },
          uTime: { value: 0 },
          uSize: { value: size },
          uPixelRatio: { value: 1 },
          uViewH: { value: 900 },
          uPointer: { value: new THREE.Vector3(99, 99, 0) },
          uRepel: { value: 0 },
          uSwirl: { value: 1 },
          uC0: { value: theme[c0] },
          uC1: { value: theme[c1] },
          uGain: { value: 1 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c0, c1],
  );
  React.useEffect(() => () => material.dispose(), [material]);
  React.useEffect(() => {
    material.blending = theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.uniforms.uGain!.value = theme.dark ? 0.9 : 1.9;
    material.needsUpdate = true;
    invalidate();
  }, [material, theme.dark, theme.version, invalidate]);
  React.useEffect(() => {
    material.uniforms.uSize!.value = size;
    material.uniforms.uPixelRatio!.value = gl.getPixelRatio();
    material.uniforms.uViewH!.value = sz.height;
    invalidate();
  }, [material, size, gl, sz.height, invalidate]);

  // morph state machine
  const st = React.useRef({ from: -1, to: 0, t: 1, queued: -1, clock: 0, spin: 0, sway: 0 });
  const nullRef = React.useRef<Element | null>(null);
  const progress = useSectionProgress(mode === "scroll" ? env.rootRef : nullRef);
  const desired = mode === "controlled" ? Math.max(0, Math.min(list.length - 1, active ?? 0)) : -1;
  React.useEffect(() => {
    if (desired >= 0) st.current.queued = desired;
    invalidate();
  }, [desired, invalidate]);

  const bind = (from: number, to: number) => {
    const b = buffers.current;
    const fa = b[from] ?? b[to] ?? null;
    const ta = b[to] ?? fa;
    if (fa) geometry.setAttribute("aFrom", fa);
    if (ta) geometry.setAttribute("aTo", ta);
  };

  // initial binding / re-binding when buffers arrive
  React.useEffect(() => {
    const s = st.current;
    if (s.from < 0) {
      const first = desired >= 0 ? desired : 0;
      s.from = first;
      s.to = first;
      s.t = 1;
    }
    bind(s.from, s.to);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, geometry]);

  const ptr = usePointer(env.rootRef);
  const group = React.useRef<THREE.Group>(null);
  const ray = React.useMemo(() => new THREE.Raycaster(), []);
  const plane = React.useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const hit = React.useMemo(() => new THREE.Vector3(), []);
  const ndc = React.useMemo(() => new THREE.Vector2(), []);
  const inv = React.useMemo(() => new THREE.Matrix4(), []);

  // fit radius ~1.85 (primitives) / 2.3 (text) inside the viewport
  const vh = viewport.height;
  const vw = viewport.width;
  const fitScale = Math.min(1.25, (vh * 0.47) / 1.85, (vw * 0.46) / 2.0);

  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const s = st.current;
    const u = material.uniforms;
    const speed = env.speed;
    u.uTime!.value += dt * Math.max(speed, 0.25);
    const total = list.length;

    if (mode === "scroll" && total > 1) {
      const f = progress.current * (total - 1);
      const a = Math.floor(Math.min(f, total - 1.0001));
      const b = Math.min(total - 1, a + 1);
      if (a !== s.from || b !== s.to) {
        s.from = a;
        s.to = b;
        bind(a, b);
      }
      u.uMorph!.value = damp(u.uMorph!.value, f - a, 6, dt);
    } else {
      if (mode === "time" && total > 1 && speed > 0) {
        s.clock += dt;
        const interval = Math.max(1.5, auto?.interval ?? 5);
        if (s.clock >= interval && s.t >= 1) {
          s.clock = 0;
          s.queued = (s.to + 1) % total;
        }
      }
      if (s.t >= 1 && s.queued >= 0 && s.queued !== s.to) {
        s.from = s.to;
        s.to = s.queued;
        s.queued = -1;
        s.t = 0;
        bind(s.from, s.to);
      }
      if (s.t < 1) {
        s.t = speed > 0 ? Math.min(1, s.t + dt / 1.9) : 1;
        u.uMorph!.value = s.t;
        if (s.t >= 1) {
          // settle: from = to, morph 0
          s.from = s.to;
          bind(s.from, s.to);
          u.uMorph!.value = 0;
        }
      }
    }

    // rotation + pointer tilt
    const p = ptr.current;
    stepPointer(p, dt, 3);
    const g = group.current;
    if (g) {
      // volumetric shapes spin; flat ones (text, icons, star, wave, images) settle face-on with a gentle sway
      const cur = list[s.t < 0.5 ? s.from : s.to] ?? list[0]!;
      const flat = typeof cur !== "string" || cur === "star" || cur === "wave";
      s.sway += dt * speed;
      if (flat) {
        const home = Math.round(s.spin / (Math.PI * 2)) * Math.PI * 2;
        s.spin = damp(s.spin, home, 2.2, dt);
        g.rotation.y = s.spin + Math.sin(s.sway * 0.6) * 0.28;
      } else {
        s.spin += rotate * dt * speed;
        g.rotation.y = s.spin;
      }
      g.rotation.x = damp(g.rotation.x, -p.sy * 0.22, 3, dt);
      g.rotation.z = damp(g.rotation.z, p.sx * -0.06, 3, dt);
      g.scale.setScalar(fitScale);
      g.updateMatrixWorld();
      // pointer → object space on z=0
      if (pointerRepel > 0 && p.inside && speed > 0) {
        ndc.set(p.x, p.y);
        ray.setFromCamera(ndc, camera);
        if (ray.ray.intersectPlane(plane, hit)) {
          inv.copy(g.matrixWorld).invert();
          hit.applyMatrix4(inv);
          (u.uPointer!.value as THREE.Vector3).lerp(hit, 1 - Math.exp(-10 * dt));
        }
        u.uRepel!.value = damp(u.uRepel!.value, pointerRepel, 4, dt);
      } else {
        u.uRepel!.value = damp(u.uRepel!.value, 0, 3, dt);
      }
    }
  });

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}
