"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { GLSL_FBM2, damp, dtc, usePointer } from "./shared";
import type { ShaderBackdropProps, ShaderBackdropVariant } from "../shader-backdrop";
import type { TokenOrColor } from "../core/types";

const VARIANT_ID: Record<ShaderBackdropVariant, number> = { aurora: 0, silk: 1, mesh: 2, "grain-gradient": 3, ember: 4, caustics: 5 };

const vert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uPointer;
uniform float uPointerAmt;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
uniform float uIntensity;
uniform float uGrain;
uniform float uDark;
varying vec2 vUv;
${GLSL_FBM2}

vec2 hash22(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }

vec2 bend(vec2 p, vec2 ptr){
  vec2 d = p - ptr;
  float f = exp(-dot(d, d) * 2.5) * uPointerAmt;
  return p + vec2(-d.y, d.x) * f * 0.28 - d * f * 0.1;
}

// light on dark: add; ink on paper: tint toward the colour
vec3 lay(vec3 base, vec3 c, float a){
  return uDark > 0.5 ? base + c * a : mix(base, c, clamp(a * 0.75, 0.0, 1.0));
}

vec3 aurora(vec2 uv, vec2 p, float t){
  vec3 col = uC3;
  col = lay(col, uC2, 0.06 * smoothstep(1.2, -1.0, p.y));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = p.x * (0.5 + fi * 0.13) + fi * 1.7;
    float base = -0.1 + fi * 0.22 + 0.16 * sin(x * 1.05 + t * 0.11 + fi) + 0.1 * sin(x * 2.4 - t * 0.16 + fi * 2.0) + (fbm(vec2(x * 0.7, t * 0.04 + fi * 3.0)) - 0.5) * 0.45;
    float d = p.y - base;
    float edge = smoothstep(-0.04, 0.02, d) + exp(min(d, 0.0) * 14.0) * 0.25;
    float fade = exp(-max(d, 0.0) * (3.4 + fi * 1.3));
    float rays = 0.45 + 0.55 * fbm(vec2(x * 11.0 + t * 0.22, d * 0.5 + fi * 7.0));
    float I = edge * fade * rays * (1.0 - fi * 0.22) * 0.9;
    vec3 lo = i == 1 ? uC1 : uC0;
    vec3 cc = mix(lo, uC2, clamp(d * 1.1, 0.0, 1.0));
    col = lay(col, cc, I * uIntensity);
  }
  if (uDark > 0.5) {
    vec2 g = uv * uRes / 3.0;
    float s = step(0.997, hash12(floor(g))) * (0.5 + 0.5 * sin(t * 2.0 + hash12(floor(g) + 3.0) * 30.0));
    col += vec3(s) * 0.35 * smoothstep(-0.1, 0.8, p.y);
  }
  return col;
}

float silkH(vec2 q, float t){
  float u = q.x;
  float v = q.y;
  return 0.55 * sin(u * 2.1 + 0.9 * sin(v * 0.62 + t * 0.15) + t * 0.08)
       + 0.3 * sin(u * 3.9 + 1.5 * sin(v * 0.43 - t * 0.11) + 1.3)
       + 0.14 * sin(u * 7.3 + sin(v * 1.2 + t * 0.19) * 2.0 + 2.1);
}
vec3 silk(vec2 p, float t){
  float c = cos(-0.45); float s = sin(-0.45);
  vec2 q = mat2(c, -s, s, c) * p * 1.15;
  float e = 0.003;
  float h = silkH(q, t);
  float hx = (silkH(q + vec2(e, 0.0), t) - h) / e;
  float hy = (silkH(q + vec2(0.0, e), t) - h) / e;
  vec3 n = normalize(vec3(-hx * 0.22, -hy * 0.22, 1.0));
  vec3 l = normalize(vec3(-0.5, 0.65, 0.6));
  vec3 v = vec3(0.0, 0.0, 1.0);
  float diff = clamp(dot(n, l) * 0.6 + 0.4, 0.0, 1.0);
  vec3 hv = normalize(l + v);
  float spec = pow(clamp(dot(n, hv), 0.0, 1.0), 90.0);
  float sheen = pow(clamp(dot(n, hv), 0.0, 1.0), 9.0);
  float ao = smoothstep(-1.0, 0.9, h);
  vec3 base = uDark > 0.5 ? mix(uC3, uC0, 0.55) : mix(uC3, uC0, 0.42);
  vec3 col = base * mix(0.22, 1.1, diff * ao);
  col = mix(col, mix(base, uC1, 0.6), smoothstep(0.4, 1.0, h) * 0.18);
  col += mix(uC2, vec3(1.0), 0.25) * (spec * 0.55 + sheen * 0.16) * uIntensity;
  return col;
}

vec3 meshGrad(vec2 p, float t){
  vec2 w = vec2(fbm(p * 0.7 + t * 0.05), fbm(p * 0.7 - t * 0.04 + 3.1)) - 0.5;
  vec2 q = p + w * 0.7;
  vec3 col = uC3;
  vec2 a = vec2(-0.9 + 0.3 * sin(t * 0.19), 0.45 + 0.25 * cos(t * 0.15));
  vec2 b = vec2(0.85 + 0.25 * cos(t * 0.17), 0.2 + 0.3 * sin(t * 0.21));
  vec2 c = vec2(0.1 + 0.45 * sin(t * 0.12), -0.65 + 0.2 * cos(t * 0.23));
  col = lay(col, uC0, exp(-dot(q - a, q - a) * 1.3) * 0.95 * uIntensity);
  col = lay(col, uC1, exp(-dot(q - b, q - b) * 1.5) * 0.85 * uIntensity);
  col = lay(col, uC2, exp(-dot(q - c, q - c) * 1.8) * 0.7 * uIntensity);
  return col;
}

vec3 grainGrad(vec2 uv, vec2 p, float t){
  float g = clamp(uv.x * 0.7 + (1.0 - uv.y) * 0.5 + (fbm(p * 0.6 + t * 0.04) - 0.5) * 0.5, 0.0, 1.0);
  vec3 col = mix(uC0, uC1, smoothstep(0.05, 0.95, g));
  vec2 hot = vec2(0.7 + 0.25 * sin(t * 0.13), 0.35 + 0.2 * cos(t * 0.11));
  col = mix(col, uC2, exp(-dot(p - hot, p - hot) * 1.4) * 0.8);
  float shade = smoothstep(-0.2, 1.6, length(p - vec2(-1.3, -0.9)));
  col = mix(uC3, col, clamp(uIntensity, 0.0, 1.0) * mix(0.35, 1.0, shade));
  return col;
}

vec3 ember(vec2 uv, vec2 p, float t){
  float h = 1.0 - uv.y;
  vec2 q = vec2(p.x * 1.3, p.y * 1.1 - t * 0.65);
  float n = fbm(q + vec2(fbm(q * 1.6 + vec2(0.0, t * 0.3)), fbm(q * 1.4 - t * 0.2)) * 1.3);
  float flame = clamp(pow(h, 1.7) * 1.05 + (n - 0.5) * 0.85, 0.0, 1.0);
  float heat = smoothstep(0.12, 1.0, flame);
  vec3 col = uC3;
  vec3 deep = mix(uC3, uC0, 0.55);
  col = mix(col, deep, smoothstep(0.0, 0.35, heat));
  col = mix(col, uC0, smoothstep(0.3, 0.6, heat));
  col = mix(col, uC1, smoothstep(0.55, 0.85, heat));
  col = mix(col, mix(uC1, uC2, 0.5), smoothstep(0.85, 1.0, heat) * 0.7);
  col = mix(uC3, col, uIntensity);
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 g = vec2(uv.x * (18.0 + fk * 9.0) * (uRes.x / uRes.y) * 0.6, uv.y * (9.0 + fk * 5.0) - t * (1.1 + fk * 0.6));
    vec2 id = floor(g);
    vec2 fr = fract(g) - 0.5;
    float rnd = hash12(id + fk * 17.0);
    vec2 off = (hash22(id + fk * 5.0) - 0.5) * 0.7;
    off.x += sin(t * 2.0 + rnd * 20.0) * 0.12;
    vec2 d = fr - off;
    float spark = exp(-dot(d * vec2(1.0, 0.5), d * vec2(1.0, 0.5)) * 420.0) * step(0.955, rnd) * (0.55 + 0.45 * sin(t * 9.0 + rnd * 50.0));
    col = lay(col, mix(uC1, uC2, 0.5), spark * h * h * 1.6 * uIntensity);
  }
  return col;
}

float voronoiEdge(vec2 x, float t){
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return sqrt(f2) - sqrt(f1);
}
vec3 caustics(vec2 uv, vec2 p, float t){
  vec2 w = vec2(fbm(p * 0.9 + t * 0.06), fbm(p * 0.9 - t * 0.05 + 4.0)) - 0.5;
  vec2 q = p * 1.7 + w * 1.3;
  float e1 = voronoiEdge(q, t * 0.7);
  float e2 = voronoiEdge(q * 1.7 + 3.0, t * 0.9 + 1.0);
  float var = 0.35 + 0.65 * fbm(p * 1.3 - t * 0.05);
  float c1 = exp(-e1 * 22.0) * var;
  float c2 = exp(-e2 * 26.0) * (1.0 - var * 0.5);
  float caus = clamp(c1 * 0.8 + c2 * 0.4 + c1 * c2 * 1.2, 0.0, 1.4);
  vec3 col = uDark > 0.5 ? mix(uC3, uC0, 0.14 + 0.12 * uv.y) : mix(uC3, uC0, 0.16 + 0.1 * uv.y);
  col = lay(col, uC1, caus * 0.45 * uIntensity);
  col = lay(col, mix(uC2, vec3(1.0), 0.3), pow(caus, 3.0) * 0.5 * uIntensity);
  return col;
}

void main(){
  vec2 uv = vUv;
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;
  vec2 ptr = uPointer * vec2(aspect, 1.0);
  p = bend(p, ptr);
  float t = uTime;
  vec3 col;
#if VARIANT == 0
  col = aurora(uv, p, t);
#elif VARIANT == 1
  col = silk(p, t);
#elif VARIANT == 2
  col = meshGrad(p, t);
#elif VARIANT == 3
  col = grainGrad(uv, p, t);
#elif VARIANT == 4
  col = ember(uv, p, t);
#else
  col = caustics(uv, p, t);
#endif
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
  float gr = hash12(uv * uRes + fract(uTime * 7.0) * 100.0) - 0.5;
#if VARIANT == 3
  gl_FragColor.rgb += gr * uGrain * 2.4;
#else
  gl_FragColor.rgb += gr * uGrain;
#endif
}
`;

export default function ShaderBackdropScene({ variant, colors, speed = 1, intensity = 1, pointer = true, grain = 0.05 }: ShaderBackdropProps) {
  const env = useSceneEnv();
  const keys = (colors && colors.length ? [...colors, "primary", "accent", "glow", "background"].slice(0, 4) : ["primary", "accent", "glow", "background"]) as TokenOrColor[];
  const theme = useThemeColors(keys, env.rootRef);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const ptr = usePointer(env.rootRef);
  const id = VARIANT_ID[variant] ?? 0;

  const material = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        defines: { VARIANT: id },
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 8.0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uPointer: { value: new THREE.Vector2(0, 0) },
          uPointerAmt: { value: 0 },
          uC0: { value: new THREE.Color() },
          uC1: { value: new THREE.Color() },
          uC2: { value: new THREE.Color() },
          uC3: { value: new THREE.Color() },
          uIntensity: { value: 1 },
          uGrain: { value: 0.05 },
          uDark: { value: 1 },
        },
      }),
    [id],
  );
  React.useEffect(() => () => material.dispose(), [material]);

  // colours (stable THREE.Color objects, re-read on theme change)
  React.useEffect(() => {
    const u = material.uniforms;
    (u.uC0!.value as THREE.Color).copy(theme[keys[0]!]!);
    (u.uC1!.value as THREE.Color).copy(theme[keys[1]!]!);
    (u.uC2!.value as THREE.Color).copy(theme[keys[2]!]!);
    (u.uC3!.value as THREE.Color).copy(theme[keys[3]!]!);
    const bg = (u.uC3!.value as THREE.Color).clone().convertLinearToSRGB();
    u.uDark!.value = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b < 0.45 ? 1 : 0;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.version, material, invalidate]);

  React.useEffect(() => {
    material.uniforms.uRes!.value.set(size.width, size.height);
    material.uniforms.uIntensity!.value = intensity;
    material.uniforms.uGrain!.value = grain;
    invalidate();
  }, [material, size.width, size.height, intensity, grain, invalidate]);

  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const u = material.uniforms;
    u.uTime!.value += dt * speed * env.speed;
    const p = ptr.current;
    const want = pointer && env.finePointer && p.inside && !env.reducedMotion ? 1 : 0;
    u.uPointerAmt!.value = damp(u.uPointerAmt!.value, want, 2.5, dt);
    const v = u.uPointer!.value as THREE.Vector2;
    v.set(damp(v.x, p.x, 3, dt), damp(v.y, p.y, 3, dt));
  });

  return (
    <mesh frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
