"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { GLSL_SIMPLEX, damp, dtc, stepPointer, usePointer } from "./shared";
import { breathAt, type BreathClock, type BreathingOrbProps } from "../breathing-orb";
import type { TokenOrColor } from "../core/types";

const vert = /* glsl */ `
uniform float uTime;
uniform float uBreath;
uniform float uNoise;
varying vec3 vN;
varying vec3 vV;
varying float vDisp;
varying vec3 vObj;
${GLSL_SIMPLEX}
float disp(vec3 p){
  float n = snoise(p * 0.85 + vec3(0.0, uTime * 0.16, uTime * 0.1)) * 0.75 + snoise(p * 1.7 - uTime * 0.1) * 0.25;
  return n * uNoise * 0.42 * (0.6 + uBreath * 0.5);
}
void main(){
  vec3 p = normalize(position);
  float d = disp(p);
  vec3 pos = p * (1.0 + d);
  // normal by finite differences on the sphere
  vec3 t = normalize(cross(p, abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(p, t);
  float e = 0.01;
  vec3 p1 = normalize(p + t * e);
  vec3 p2 = normalize(p + b * e);
  vec3 q1 = p1 * (1.0 + disp(p1));
  vec3 q2 = p2 * (1.0 + disp(p2));
  vec3 n = normalize(cross(q1 - pos, q2 - pos));
  if (dot(n, p) < 0.0) n = -n;
  vN = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vV = -mv.xyz;
  vDisp = d;
  vObj = pos;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uBreath;
uniform float uDark;
varying vec3 vN;
varying vec3 vV;
varying float vDisp;
varying vec3 vObj;
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.4);
  vec3 l = normalize(vec3(-0.4, 0.7, 0.6));
  float diff = max(dot(n, l), 0.0);
  float spec = pow(max(dot(reflect(-l, n), v), 0.0), 40.0);
  // inner gradient: primary core → glow toward the top-left, accent in the crevices
  float g = clamp(vObj.y * 0.4 + 0.5, 0.0, 1.0);
  vec3 base = mix(uC0, uC1, g * 0.65);
  base = mix(base, uC2, smoothstep(0.02, -0.12, vDisp) * 0.55);
  vec3 col = base * (0.35 + diff * 0.6);
  col = mix(col, uC1, smoothstep(0.35, 1.0, fres) * 0.85);
  col += uC1 * fres * (0.5 + uBreath * 0.5);
  col += vec3(1.0) * spec * 0.45;
  float alpha = 1.0;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

const haloFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.35, d) * smoothstep(0.2, 0.62, d) * uAlpha;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;
const uvVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export default function BreathingOrbScene({ colors, noise = 0.18, clock }: BreathingOrbProps & { clock: React.MutableRefObject<BreathClock> }) {
  const env = useSceneEnv();
  const viewport = useThree((s) => s.viewport);
  const keys = (colors && colors.length >= 3 ? colors.slice(0, 3) : ["primary", "glow", "accent"]) as TokenOrColor[];
  const theme = useThemeColors([...keys, "background"], env.rootRef);
  const geo = React.useMemo(() => new THREE.IcosahedronGeometry(1, env.quality === "high" ? 64 : 32), [env.quality]);
  React.useEffect(() => () => geo.dispose(), [geo]);
  const mat = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { uTime: { value: 0 }, uBreath: { value: 0 }, uNoise: { value: noise }, uC0: { value: theme[keys[0]!] }, uC1: { value: theme[keys[1]!] }, uC2: { value: theme[keys[2]!] }, uDark: { value: 1 } },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keys.join("|")],
  );
  const halo = React.useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: uvVert, fragmentShader: haloFrag, transparent: true, depthWrite: false, uniforms: { uColor: { value: theme[keys[1]!] }, uAlpha: { value: 0.4 } } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keys.join("|")],
  );
  React.useEffect(
    () => () => {
      mat.dispose();
      halo.dispose();
    },
    [mat, halo],
  );
  React.useEffect(() => {
    mat.uniforms.uNoise!.value = noise;
    halo.blending = theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    halo.uniforms.uAlpha!.value = theme.dark ? 0.45 : 0.3;
    halo.needsUpdate = true;
  }, [mat, halo, noise, theme.dark, theme.version]);

  const mesh = React.useRef<THREE.Mesh>(null);
  const haloRef = React.useRef<THREE.Mesh>(null);
  const ring = React.useRef<THREE.Mesh>(null);
  const ptr = usePointer(env.rootRef);
  const st = React.useRef({ t: 0 });
  const fit = Math.min(viewport.height * 0.3, viewport.width * 0.3);

  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    st.current.t += dt * Math.max(env.speed, 0);
    const b = env.speed > 0 ? breathAt(clock.current, performance.now()).value : 0.6;
    const u = mat.uniforms;
    u.uTime!.value = st.current.t;
    u.uBreath!.value = damp(u.uBreath!.value as number, b, 6, dt);
    const s = fit * (0.82 + (u.uBreath!.value as number) * 0.24);
    const p = ptr.current;
    stepPointer(p, dt, 2);
    if (mesh.current) {
      mesh.current.scale.setScalar(s);
      mesh.current.rotation.y += dt * 0.08 * env.speed;
      mesh.current.rotation.x = damp(mesh.current.rotation.x, -p.sy * 0.25, 2, dt);
      mesh.current.position.x = damp(mesh.current.position.x, p.sx * 0.15, 2, dt);
    }
    if (haloRef.current) haloRef.current.scale.setScalar(s * 3.2);
    if (ring.current) {
      ring.current.scale.setScalar(fit * (1.32 + (u.uBreath!.value as number) * 0.18));
      ring.current.rotation.z += dt * 0.05 * env.speed;
    }
  });

  return (
    <>
      <mesh ref={haloRef} material={halo} position={[0, 0, -1.2]} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={ring} position={[0, 0, -0.6]}>
        <torusGeometry args={[1, 0.004, 8, 180]} />
        <meshBasicMaterial color={theme[keys[1]!]} transparent opacity={0.5} />
      </mesh>
      <mesh ref={mesh} geometry={geo} material={mat} />
    </>
  );
}
