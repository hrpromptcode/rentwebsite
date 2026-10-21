"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { mulberry32 } from "../core/random";
import { GLSL_FBM2, dtc, stepPointer, usePointer } from "./shared";
import type { SteamRiseProps } from "../steam-rise";

const smokeVert = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uOrigin;
uniform vec2 uSpread;
uniform float uHeight;
uniform vec2 uWind;
varying vec2 vUv;
varying float vAge;
varying float vAlpha;
varying vec4 vSeed;
void main(){
  float life = 6.5 + aSeed.x * 3.5;
  float age = fract((uTime + aSeed.y * life) / life);
  vec3 c = uOrigin;
  c.x += (aSeed.z - 0.5) * uSpread.x;
  c.z += (aSeed.w - 0.5) * uSpread.y;
  float rise = age * uHeight;
  c.y += rise;
  c.x += sin(age * 3.4 + aSeed.z * 6.28) * 0.35 * age + uWind.x * age * age * 1.4;
  c.z += cos(age * 2.6 + aSeed.w * 6.28) * 0.25 * age;
  float size = mix(0.45, 2.8, pow(age, 0.8)) * (0.8 + aSeed.x * 0.5);
  float ang = aSeed.y * 6.28 + age * (aSeed.z - 0.5) * 2.0;
  vec2 q = vec2(cos(ang) * position.x - sin(ang) * position.y, sin(ang) * position.x + cos(ang) * position.y);
  vec4 mv = viewMatrix * modelMatrix * vec4(c, 1.0);
  mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vAge = age;
  vAlpha = smoothstep(0.0, 0.14, age) * (1.0 - smoothstep(0.45, 1.0, age));
  vSeed = aSeed;
}
`;
const smokeFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uWarm;
uniform float uDensity;
varying vec2 vUv;
varying float vAge;
varying float vAlpha;
varying vec4 vSeed;
${GLSL_FBM2}
void main(){
  vec2 p = vUv - 0.5;
  float d = length(p);
  float base = smoothstep(0.5, 0.05, d);
  vec2 q = p * vec2(2.4, 1.3) + vSeed.xy * 10.0 + vec2(0.0, -uTime * 0.14);
  float w = fbm(q + vec2(fbm(q * 1.7 + uTime * 0.05), fbm(q * 1.3 - uTime * 0.04)) * 1.3);
  float wisp = smoothstep(0.4, 0.82, w);
  float a = base * mix(wisp, 1.0, 0.18) * vAlpha * 0.78 * uDensity;
  vec3 col = mix(vec3(1.0), uWarm, 0.25 * (1.0 - vAge));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

const emberVert = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uOrigin;
uniform vec2 uSpread;
uniform float uHeight;
uniform float uPx;
varying float vA;
void main(){
  float life = 2.2 + aSeed.x * 2.4;
  float age = fract((uTime + aSeed.y * life) / life);
  vec3 c = uOrigin;
  c.x += (aSeed.z - 0.5) * uSpread.x * 0.8 + sin(age * 9.0 + aSeed.w * 30.0) * 0.18 * age;
  c.z += (aSeed.w - 0.5) * uSpread.y;
  c.y += age * uHeight * (0.7 + aSeed.x * 0.6);
  vec4 mv = viewMatrix * modelMatrix * vec4(c, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.5 + aSeed.z * 2.5) * uPx * (6.0 / max(-mv.z, 0.5));
  float flick = 0.55 + 0.45 * sin(uTime * (12.0 + aSeed.x * 10.0) + aSeed.y * 40.0);
  vA = (1.0 - age) * smoothstep(0.0, 0.08, age) * flick;
}
`;
const emberFrag = /* glsl */ `
uniform vec3 uWarm;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(uWarm, vec3(1.0, 0.95, 0.8), core * 0.6), core * core * vA);
  #include <colorspace_fragment>
}
`;

export default function SteamRiseScene({ origin = "bottom", density = 1, embers = true, warmth = "glow" }: SteamRiseProps) {
  const env = useSceneEnv();
  const viewport = useThree((s) => s.viewport);
  const gl = useThree((s) => s.gl);
  const theme = useThemeColors([warmth, "background"], env.rootRef);
  const high = env.quality === "high";
  const smokeN = Math.max(6, Math.round((high ? 30 : 16) * density));
  const emberN = embers ? Math.max(10, Math.round((high ? 140 : 60) * density)) : 0;

  const smoke = React.useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.getAttribute("position"));
    g.setAttribute("uv", base.getAttribute("uv"));
    const r = mulberry32(31);
    const seed = new Float32Array(smokeN * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = r();
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = smokeN;
    return g;
  }, [smokeN]);
  const emberGeo = React.useMemo(() => {
    if (!emberN) return null;
    const r = mulberry32(77);
    const seed = new Float32Array(emberN * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = r();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(emberN * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    return g;
  }, [emberN]);
  const mats = React.useMemo(() => {
    const common = {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector3() },
      uSpread: { value: new THREE.Vector2(1, 0.6) },
      uHeight: { value: 4 },
    };
    const sm = new THREE.ShaderMaterial({
      vertexShader: smokeVert,
      fragmentShader: smokeFrag,
      transparent: true,
      depthWrite: false,
      uniforms: { ...common, uWind: { value: new THREE.Vector2() }, uWarm: { value: theme[warmth] }, uDensity: { value: 1 } },
    });
    const em = new THREE.ShaderMaterial({
      vertexShader: emberVert,
      fragmentShader: emberFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...common, uPx: { value: 1 }, uWarm: { value: theme[warmth] } },
    });
    return { sm, em };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmth]);
  React.useEffect(
    () => () => {
      smoke.dispose();
      emberGeo?.dispose();
      mats.sm.dispose();
      mats.em.dispose();
    },
    [smoke, emberGeo, mats],
  );

  const hw = viewport.width / 2;
  const hh = viewport.height / 2;
  React.useEffect(() => {
    const o = mats.sm.uniforms.uOrigin!.value as THREE.Vector3;
    const sp = mats.sm.uniforms.uSpread!.value as THREE.Vector2;
    if (origin === "bottom") {
      o.set(0, -hh - 0.4, 0);
      sp.set(hw * 1.6, 0.8);
    } else if (origin === "center") {
      o.set(0, -0.3, 0);
      sp.set(0.9, 0.5);
    } else {
      o.set((origin[0] * 2 - 1) * hw, (1 - origin[1] * 2) * hh, 0);
      sp.set(0.9, 0.5);
    }
    mats.sm.uniforms.uHeight!.value = origin === "bottom" ? hh * 2 + 1 : hh * 1.6;
    mats.sm.uniforms.uDensity!.value = Math.min(1.6, density);
    mats.em.uniforms.uPx!.value = gl.getPixelRatio();
  }, [origin, hw, hh, mats, density, gl]);

  const ptr = usePointer(env.rootRef);
  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const u = mats.sm.uniforms;
    u.uTime!.value += dt * Math.max(env.speed, 0);
    const p = ptr.current;
    stepPointer(p, dt, 1.2);
    (u.uWind!.value as THREE.Vector2).set(env.finePointer ? p.sx * 0.6 : 0, 0);
  });

  return (
    <>
      <mesh geometry={smoke} material={mats.sm} frustumCulled={false} />
      {emberGeo ? <points geometry={emberGeo} material={mats.em} frustumCulled={false} /> : null}
    </>
  );
}
