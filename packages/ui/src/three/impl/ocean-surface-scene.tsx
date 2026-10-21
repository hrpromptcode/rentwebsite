"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { GLSL_COVER, GLSL_FBM2, damp, dtc, useImageTextures } from "./shared";
import type { OceanSurfaceProps } from "../ocean-surface";

const MAX_RIPPLES = 8;

const vert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform float uHorizon;
uniform vec3 uSun;
uniform vec3 uWater;
uniform vec3 uSky;
uniform vec2 uPointer;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform sampler2D uMap;
uniform float uImgAspect;
uniform float uHasMap;
varying vec2 vUv;
${GLSL_FBM2}
${GLSL_COVER}

float aspect(){ return uRes.x / max(uRes.y, 1.0); }

vec2 ripples(vec2 uv){
  vec2 acc = vec2(0.0);
  float a = aspect();
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 4.5) continue;
    vec2 d = (uv - r.xy) * vec2(a, 1.0);
    float dist = length(d);
    float x = dist - age * 0.32;
    float env = exp(-x * x * 60.0) * exp(-age * 0.8) * r.w;
    acc += (d / max(dist, 1e-4)) * sin(x * 80.0) * env;
  }
  return acc;
}

vec3 skyCol(vec3 dir, vec3 sunDir){
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 horizon = mix(uSky, uSun, 0.55);
  vec3 col = mix(horizon, uSky, pow(h, 0.45));
  float s = max(dot(dir, sunDir), 0.0);
  col += uSun * (pow(s, 900.0) * 6.0 + pow(s, 60.0) * 0.5 + pow(s, 6.0) * 0.22);
  return col;
}

vec3 gerstnerNormal(vec2 p, float t, float detail){
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec2 dirs[4];
  dirs[0] = normalize(vec2(1.0, 0.25)); dirs[1] = normalize(vec2(-0.6, 1.0)); dirs[2] = normalize(vec2(0.3, -1.0)); dirs[3] = normalize(vec2(-1.0, -0.4));
  float lens[4]; lens[0] = 9.0; lens[1] = 5.5; lens[2] = 3.1; lens[3] = 1.7;
  float amps[4]; amps[0] = 0.22; amps[1] = 0.12; amps[2] = 0.06; amps[3] = 0.03;
  for (int i = 0; i < 4; i++) {
    float k = 6.2831853 / lens[i];
    float w = sqrt(9.8 * k);
    float ph = k * dot(dirs[i], p) - w * t * 0.55;
    float c = cos(ph);
    float s = sin(ph);
    n.x -= dirs[i].x * k * amps[i] * c;
    n.z -= dirs[i].y * k * amps[i] * c;
    n.y -= 0.6 * k * amps[i] * s;
  }
  // fine detail
  vec2 q = p * 1.7 + vec2(t * 0.35, t * 0.22);
  float e = 0.05;
  float h0 = fbm(q);
  n.x += (fbm(q + vec2(e, 0.0)) - h0) / e * 0.08 * detail;
  n.z += (fbm(q + vec2(0.0, e)) - h0) / e * 0.08 * detail;
  return normalize(n);
}

vec3 ocean(vec2 uv){
  float a = aspect();
  vec2 sp = (uv - vec2(0.5, uHorizon)) * vec2(a, 1.0);
  vec3 dir = normalize(vec3(sp.x, sp.y, -1.25));
  vec3 sunDir = normalize(vec3(0.26 * min(a, 1.3) + uPointer.x * 0.08, 0.055 + uPointer.y * 0.02, -1.0));
  if (dir.y >= 0.0) return skyCol(dir, sunDir);
  float camH = 1.1;
  float t = camH / -dir.y;
  vec3 pos = vec3(0.0, camH, 0.0) + dir * t;
  float far = smoothstep(8.0, 140.0, t);
  vec3 n = gerstnerNormal(pos.xz, uTime, 1.0 - far);
  vec2 rp = ripples(uv);
  n = normalize(n + vec3(rp.x, 0.0, -rp.y) * 0.9);
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), far * 0.85));
  vec3 refl = reflect(dir, n);
  refl.y = abs(refl.y);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, -dir), 0.0), 5.0);
  vec3 deep = uWater * 0.22;
  vec3 shallow = uWater * 0.75 + uSun * 0.05;
  vec3 water = mix(deep, shallow, clamp(n.y * 0.5 + (1.0 - n.y) * 6.0, 0.0, 1.0) * 0.6);
  vec3 col = mix(water, skyCol(refl, sunDir), fres);
  float spec = pow(max(dot(refl, sunDir), 0.0), 520.0);
  col += uSun * spec * 9.0;
  // glitter path toward the sun
  float path = exp(-pow((sp.x - (sunDir.x / -sunDir.z) * 1.25) * 3.0, 2.0)) * (1.0 - far) * pow(max(dot(refl, sunDir), 0.0), 18.0);
  col += uSun * path * 0.8;
  vec3 horizon = mix(uSky, uSun, 0.55);
  col = mix(col, horizon, smoothstep(30.0, 260.0, t));
  return col;
}

vec2 hash22(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float voronoiEdge(vec2 x, float t){
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * hash22(n + g));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return sqrt(f2) - sqrt(f1);
}

vec3 pool(vec2 uv){
  float a = aspect();
  vec2 p = (uv - 0.5) * vec2(a, 1.0) * 3.0;
  float t = uTime * 0.6;
  float e = 0.02;
  vec2 q = p * 1.1 + vec2(t * 0.12, -t * 0.09);
  float h0 = fbm(q);
  vec2 nrm = vec2(fbm(q + vec2(e, 0.0)) - h0, fbm(q + vec2(0.0, e)) - h0) / e * 0.16;
  nrm += ripples(uv) * 0.6;
  vec2 rp = p + nrm * 0.35;
  // pool tiles seen through the water
  vec2 g = abs(fract(rp * 1.6) - 0.5);
  float tile = smoothstep(0.46, 0.5, max(g.x, g.y));
  // caustic network (two drifting voronoi layers)
  float var = 0.35 + 0.65 * fbm(rp * 0.9 - t * 0.05);
  float c1 = exp(-voronoiEdge(rp * 1.8 + nrm * 2.0, t) * 20.0) * var;
  float c2 = exp(-voronoiEdge(rp * 3.1 + 2.0, t * 1.3 + 1.0) * 24.0) * (1.0 - var * 0.5);
  float caus = clamp(c1 * 0.8 + c2 * 0.45 + c1 * c2, 0.0, 1.3);
  vec3 deep = mix(uWater * 0.45, uWater * 0.8, 0.5 + 0.5 * sin(rp.x * 0.35 + rp.y * 0.25));
  vec3 col = mix(deep, deep * 0.8, tile * 0.6);
  col += mix(uSun, vec3(1.0), 0.6) * caus * 0.45;
  float spec = pow(clamp(1.0 - length(nrm - vec2(0.1, 0.12)) * 3.0, 0.0, 1.0), 8.0);
  col += vec3(1.0) * spec * 0.18;
  return min(col, vec3(1.0));
}

vec3 ripplePhoto(vec2 uv){
  float a = aspect();
  vec2 off = ripples(uv) * 0.03;
  off += vec2(sin(uv.y * 40.0 + uTime * 1.2), cos(uv.x * 36.0 + uTime) ) * 0.0012;
  vec2 iuv = coverUv(uv + off, a, uImgAspect);
  vec3 col;
  if (uHasMap > 0.5) {
    col.r = texture2D(uMap, iuv + off * 0.35).r;
    col.g = texture2D(uMap, iuv).g;
    col.b = texture2D(uMap, iuv - off * 0.35).b;
  } else col = mix(uWater, uSky, uv.y);
  float hi = clamp(dot(ripples(uv), vec2(0.6, 0.8)), 0.0, 1.0);
  col += mix(uSun, vec3(1.0), 0.5) * hi * 0.5;
  return col;
}

void main(){
#if MODE == 0
  vec3 col = ocean(vUv);
#elif MODE == 1
  vec3 col = pool(vUv);
#else
  vec3 col = ripplePhoto(vUv);
#endif
  gl_FragColor = vec4(max(col, 0.0), 1.0);
#if MODE == 2
  // photo texels are already decoded to linear; keep the same output path
#endif
  #include <colorspace_fragment>
}
`;

const MODE_ID = { ocean: 0, pool: 1, ripple: 2 } as const;

export default function OceanSurfaceScene({ mode, image, sun = "glow", water = "accent", sky = "background", horizon = 0.62, pointerRipples = true }: OceanSurfaceProps) {
  const env = useSceneEnv();
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const theme = useThemeColors([sun, water, sky], env.rootRef);
  const tex = useImageTextures(mode === "ripple" && image ? [image] : [], { width: 1600 });

  const material = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        defines: { MODE: MODE_ID[mode] ?? 0 },
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 3 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uHorizon: { value: horizon },
          uSun: { value: theme[sun] },
          uWater: { value: theme[water] },
          uSky: { value: theme[sky] },
          uPointer: { value: new THREE.Vector2() },
          uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -10, 0)) },
          uMap: { value: null as THREE.Texture | null },
          uImgAspect: { value: 1.5 },
          uHasMap: { value: 0 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, sun, water, sky],
  );
  React.useEffect(() => () => material.dispose(), [material]);
  React.useEffect(() => {
    material.uniforms.uRes!.value.set(size.width, size.height);
    material.uniforms.uHorizon!.value = horizon;
    invalidate();
  }, [material, size.width, size.height, horizon, invalidate]);
  React.useEffect(() => {
    const t = tex[0];
    if (t) {
      material.uniforms.uMap!.value = t.texture;
      material.uniforms.uImgAspect!.value = t.aspect;
      material.uniforms.uHasMap!.value = 1;
      invalidate();
    }
  }, [tex, material, invalidate]);
  React.useEffect(() => invalidate(), [theme.version, invalidate]);

  // pointer ripples (window listeners; uv relative to the scene box)
  const st = React.useRef({ time: 3, last: new THREE.Vector2(-9, -9), slot: 0, px: 0, py: 0 });
  React.useEffect(() => {
    if (!pointerRipples) return;
    const spawn = (x: number, y: number, strength: number) => {
      const s = st.current;
      const r = (material.uniforms.uRipples!.value as THREE.Vector4[])[s.slot % MAX_RIPPLES]!;
      r.set(x, y, s.time, strength);
      s.slot++;
      s.last.set(x, y);
      idle.current.next = s.time + 4.5;
      invalidate();
    };
    const toUv = (e: PointerEvent) => {
      const el = env.rootRef.current;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width;
      const y = 1 - (e.clientY - b.top) / b.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return null;
      return [x, y] as const;
    };
    const move = (e: PointerEvent) => {
      const uv = toUv(e);
      const s = st.current;
      if (uv) {
        s.px = uv[0] * 2 - 1;
        s.py = uv[1] * 2 - 1;
      }
      if (!uv || env.reducedMotion) return;
      if (e.pointerType !== "mouse" && e.buttons === 0) return;
      if (Math.hypot(uv[0] - s.last.x, uv[1] - s.last.y) > 0.06) spawn(uv[0], uv[1], 0.75);
    };
    const down = (e: PointerEvent) => {
      const uv = toUv(e);
      if (uv && !env.reducedMotion) spawn(uv[0], uv[1], 1.3);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
    };
  }, [pointerRipples, material, env.rootRef, env.reducedMotion, invalidate]);

  const idle = React.useRef({ next: 1.2, lastUser: -10, k: 0 });
  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const s = st.current;
    s.time += dt * Math.max(env.speed, 0);
    // ambient drops while nobody interacts (shows the effect; seeded positions)
    const id = idle.current;
    if (pointerRipples && env.speed > 0 && mode !== "ocean" && s.time > id.next) {
      id.k++;
      const x = 0.18 + ((id.k * 0.618034) % 1) * 0.64;
      const y = 0.22 + ((id.k * 0.414214 + 0.3) % 1) * 0.56;
      const r = (material.uniforms.uRipples!.value as THREE.Vector4[])[s.slot % MAX_RIPPLES]!;
      r.set(x, y, s.time, 0.95);
      s.slot++;
      id.next = s.time + 2.6;
    }
    material.uniforms.uTime!.value = s.time;
    const p = material.uniforms.uPointer!.value as THREE.Vector2;
    p.set(damp(p.x, env.finePointer ? s.px : 0, 2, dt), damp(p.y, env.finePointer ? s.py : 0, 2, dt));
  });

  return (
    <mesh frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
