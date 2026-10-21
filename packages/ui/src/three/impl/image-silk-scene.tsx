"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { GLSL_SIMPLEX, damp, dtc, stepPointer, useImageTextures, usePointer } from "./shared";
import type { ImageSilkProps } from "../image-silk";

const HITS = 6;

const vert = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform float uFree;
uniform vec3 uPointer;
uniform vec4 uHits[${HITS}];
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying float vFold;
${GLSL_SIMPLEX}
float pinAt(vec2 uv){
  float p = pow(1.0 - uv.y, 1.15);
  if (uFree > 0.5) p = max(p, sin(uv.x * 3.14159) * 0.4 * smoothstep(0.6, 1.0, uv.y));
  return p;
}
float dispZ(vec2 p, vec2 uv){
  float pin = pinAt(uv);
  float w = snoise(vec3(p.x * 0.32 + uTime * 0.22, p.y * 0.22 - uTime * 0.12, uTime * 0.08)) * 0.55
          + snoise(vec3(p.x * 0.85 - uTime * 0.35, p.y * 0.6, uTime * 0.17)) * 0.2;
  float z = w * uWind * pin * 1.25;
  z += sin(p.x * 1.6 - uTime * 1.05 + p.y * 0.35) * 0.16 * uWind * pin;
  z += sin(p.x * 4.2 + p.y * 0.8 - uTime * 0.7) * 0.035 * uWind * pin;
  vec2 d = p - uPointer.xy;
  z -= exp(-dot(d, d) * 1.3) * uPointer.z * 0.42 * pin;
  for (int i = 0; i < ${HITS}; i++) {
    vec4 h = uHits[i];
    float age = uTime - h.z;
    if (h.w <= 0.0 || age < 0.0 || age > 3.5) continue;
    float dist = length(p - h.xy);
    float x = dist - age * 1.8;
    z += sin(x * 5.0) * exp(-age * 1.4) * exp(-abs(x) * 1.6) * 0.14 * h.w * pin;
  }
  return z;
}
void main(){
  vec2 p = position.xy;
  float z = dispZ(p, uv);
  float e = 0.02;
  float zx = dispZ(p + vec2(e, 0.0), uv + vec2(e * 0.05, 0.0));
  float zy = dispZ(p + vec2(0.0, e), uv + vec2(0.0, e * 0.05));
  vec3 n = normalize(vec3(-(zx - z) / e, -(zy - z) / e, 1.0));
  float pin = pinAt(uv);
  vec3 pos = vec3(p.x + sin(uTime * 0.6 + p.y * 0.3) * 0.05 * pin * uWind, p.y, z);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vV = -mv.xyz;
  vN = normalize(normalMatrix * n);
  vUv = uv;
  vFold = z;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
uniform sampler2D uMap;
uniform float uLoaded;
uniform vec3 uSheenColor;
uniform vec3 uSurface;
uniform float uSheen;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying float vFold;
void main(){
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vV);
  vec3 l = normalize(vec3(-0.45, 0.6, 0.7));
  float diff = clamp(dot(n, l) * 0.55 + 0.45, 0.0, 1.0);
  vec3 r = reflect(-l, n);
  float spec = pow(max(dot(r, v), 0.0), 26.0);
  float broad = pow(max(dot(r, v), 0.0), 4.0);
  vec3 tex = mix(uSurface, texture2D(uMap, vUv).rgb, uLoaded);
  vec3 col = tex * mix(0.5, 1.15, diff * diff);
  col += uSheenColor * (spec * 0.55 + broad * 0.12) * uSheen;
  col *= gl_FrontFacing ? 1.0 : 0.55;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default function ImageSilkScene({ image, wind = 0.6, pointer = true, hang = "rod", sheen = 0.4 }: ImageSilkProps) {
  const env = useSceneEnv();
  const viewport = useThree((s) => s.viewport);
  const invalidate = useThree((s) => s.invalidate);
  const theme = useThemeColors(["glow", "surface", "foreground"], env.rootRef);
  const tex = useImageTextures([image], { width: 1400 });
  const aspect = tex[0]?.aspect ?? 0.75;
  const W = Math.min(viewport.width * 0.8, viewport.height * 0.8 * aspect);
  const H = W / aspect;
  const segX = env.quality === "high" ? 48 : 32;
  const segY = env.quality === "high" ? 64 : 40;
  const geo = React.useMemo(() => new THREE.PlaneGeometry(W, H, segX, segY), [W, H, segX, segY]);
  React.useEffect(() => () => geo.dispose(), [geo]);
  const mat = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: wind },
          uFree: { value: hang === "free" ? 1 : 0 },
          uPointer: { value: new THREE.Vector3(0, 0, 0) },
          uHits: { value: Array.from({ length: HITS }, () => new THREE.Vector4(0, 0, -10, 0)) },
          uMap: { value: null as THREE.Texture | null },
          uLoaded: { value: 0 },
          uSheenColor: { value: theme.glow },
          uSurface: { value: theme.surface },
          uSheen: { value: sheen },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  React.useEffect(() => () => mat.dispose(), [mat]);
  React.useEffect(() => {
    mat.uniforms.uWind!.value = wind;
    mat.uniforms.uFree!.value = hang === "free" ? 1 : 0;
    mat.uniforms.uSheen!.value = sheen;
    const t = tex[0];
    if (t) {
      mat.uniforms.uMap!.value = t.texture;
      mat.uniforms.uLoaded!.value = 1;
    }
    invalidate();
  }, [mat, wind, hang, sheen, tex, invalidate]);

  const ptr = usePointer(env.rootRef);
  const st = React.useRef({ t: 0, slot: 0, last: new THREE.Vector2(99, 99), str: 0 });
  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const s = st.current;
    s.t += dt * Math.max(env.speed, 0);
    const u = mat.uniforms;
    u.uTime!.value = s.t;
    const p = ptr.current;
    stepPointer(p, dt, 8);
    const lx = (p.x * viewport.width) / 2;
    const ly = (p.y * viewport.height) / 2 - (H > 0 ? 0 : 0);
    const want = pointer && env.finePointer && p.inside && env.speed > 0 ? 1 : 0;
    s.str = damp(s.str, want, 4, dt);
    (u.uPointer!.value as THREE.Vector3).set(lx, ly - 0.0, s.str);
    if (want && Math.hypot(lx - s.last.x, ly - s.last.y) > 0.5) {
      const h = (u.uHits!.value as THREE.Vector4[])[s.slot % HITS]!;
      h.set(lx, ly, s.t, 0.8);
      s.slot++;
      s.last.set(lx, ly);
    }
  });

  return (
    <group position={[0, -0.05, 0]}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[-3, 4, 5]} intensity={1.4} />
      <mesh geometry={geo} material={mat} />
      {hang === "rod" ? (
        <group position={[0, H / 2 + 0.02, 0.02]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.035, 0.035, W * 1.1, 24]} />
            <meshStandardMaterial color={theme.foreground} metalness={0.7} roughness={0.28} />
          </mesh>
          {[-1, 1].map((k) => (
            <mesh key={k} position={[(k * W * 1.1) / 2, 0, 0]}>
              <sphereGeometry args={[0.06, 20, 14]} />
              <meshStandardMaterial color={theme.foreground} metalness={0.7} roughness={0.28} />
            </mesh>
          ))}
        </group>
      ) : null}
    </group>
  );
}
