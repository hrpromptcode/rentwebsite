"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { mulberry32 } from "../core/random";
import { GLSL_COVER, GLSL_ROUNDRECT, damp, dtc, stepPointer, useImageTextures, usePointer } from "./shared";
import type { CardStack3DProps, StackBridge } from "../card-stack-3d";
import type { TokenOrColor } from "../core/types";

const CW = 1.5;
const CH = 2.0;

const cardVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;
const cardFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uLoaded;
uniform float uImgAspect;
uniform vec3 uRim;
uniform vec3 uSurface;
uniform float uHover;
uniform float uTime;
uniform float uSeed;
uniform float uDim;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
${GLSL_ROUNDRECT}
${GLSL_COVER}
vec3 pal(float t){ return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t)); }
void main(){
  float aspect = ${(CW / CH).toFixed(4)};
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float d = sdRoundRect(p, vec2(aspect, 1.0) * 0.5, 0.06);
  float aa = fwidth(d) * 1.2;
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask < 0.004) discard;
  vec3 nn = gl_FrontFacing ? normalize(vN) : -normalize(vN);
  vec2 iuv = coverUv(vUv, aspect, uImgAspect);
  iuv = (iuv - 0.5) / (1.0 + uHover * 0.06) + 0.5;
  vec3 img = texture2D(uMap, iuv).rgb;
  vec3 col = mix(mix(uSurface, uRim, 0.15 + vUv.y * 0.2), img, uLoaded);
  if (!gl_FrontFacing) col = mix(uSurface, uRim, 0.12 + 0.18 * smoothstep(0.3, 0.0, abs(d + 0.08)));
  float view = dot(nn, normalize(vV));
  // foil sheen + holo band that follows the viewing angle
  float band = smoothstep(0.25, 0.0, abs(vUv.x + vUv.y * 0.5 - 0.75 - (1.0 - view) * 1.6 + sin(uTime * 0.4 + uSeed) * 0.15));
  col += (pal(vUv.y * 0.6 + view + uSeed) * 0.35 + 0.15) * band * (0.35 + uHover * 0.5);
  col *= mix(0.92, 1.08, uHover) * uDim;
  // rim light
  float rim = 1.0 - smoothstep(0.0, aa * 3.0, abs(d + aa * 1.6));
  float glow = exp(-abs(d) * 60.0) * 0.6;
  col = mix(col, uRim, clamp(rim * (0.55 + uHover * 0.45) + glow * 0.25, 0.0, 1.0));
  gl_FragColor = vec4(col, mask);
  #include <colorspace_fragment>
}
`;

const gridVert = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const gridFrag = /* glsl */ `
uniform vec3 uLine;
uniform vec3 uHorizon;
uniform float uTime;
varying vec3 vW;
void main(){
  vec2 g = vec2(vW.x, vW.z + uTime * 1.2) / 0.7;
  vec2 gw = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
  float line = 1.0 - min(min(gw.x, gw.y), 1.0);
  float dist = -vW.z;
  float fade = 1.0 - smoothstep(4.0, 22.0, dist);
  float horizon = exp(-pow((dist - 20.0) / 3.0, 2.0));
  vec3 col = mix(uLine, uHorizon, horizon);
  gl_FragColor = vec4(col, clamp(line * fade * 0.85 + horizon * 0.5, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;
const portalFrag = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform float uTime;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float a = atan(p.y, p.x);
  float swirl = sin(a * 6.0 + r * 14.0 - uTime * 2.2) * 0.5 + 0.5;
  float disc = smoothstep(1.0, 0.6, r);
  vec3 col = mix(uA, uB, swirl);
  float alpha = disc * (0.25 + swirl * 0.45) * smoothstep(0.0, 0.25, r) + exp(-r * r * 10.0) * 0.5;
  gl_FragColor = vec4(col + exp(-r * r * 12.0) * 0.4, alpha);
  #include <colorspace_fragment>
}
`;
const uvVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export default function CardStack3DScene({ items, layout = "fan", autoplay = true, floor = "none", rim = "accent", bridge }: CardStack3DProps & { bridge: StackBridge }) {
  const env = useSceneEnv();
  const viewport = useThree((s) => s.viewport);
  const invalidate = useThree((s) => s.invalidate);
  const theme = useThemeColors([rim as TokenOrColor, "primary", "surface", "background", "accent"], env.rootRef);
  const n = items.length;
  const tex = useImageTextures(items.map((i) => i.image), { width: 768 });
  const geo = React.useMemo(() => new THREE.PlaneGeometry(CW, CH, 1, 1), []);
  React.useEffect(() => () => geo.dispose(), [geo]);
  const mats = React.useMemo(
    () =>
      items.map(
        (_, i) =>
          new THREE.ShaderMaterial({
            vertexShader: cardVert,
            fragmentShader: cardFrag,
            transparent: true,
            side: THREE.DoubleSide,
            uniforms: {
              uMap: { value: null as THREE.Texture | null },
              uLoaded: { value: 0 },
              uImgAspect: { value: 0.75 },
              uRim: { value: theme[rim as string] },
              uSurface: { value: theme.surface },
              uHover: { value: 0 },
              uTime: { value: 0 },
              uSeed: { value: i * 0.37 },
              uDim: { value: 1 },
            },
          }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, rim],
  );
  React.useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  React.useEffect(() => {
    tex.forEach((t, i) => {
      const m = mats[i];
      if (!t || !m) return;
      m.uniforms.uMap!.value = t.texture;
      m.uniforms.uImgAspect!.value = t.aspect;
      m.uniforms.uLoaded!.value = 1;
    });
    invalidate();
  }, [tex, mats, invalidate]);

  const gridMat = React.useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: gridVert, fragmentShader: gridFrag, transparent: true, depthWrite: false, uniforms: { uLine: { value: theme[rim as string] }, uHorizon: { value: theme.primary }, uTime: { value: 0 } } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rim],
  );
  const portalMat = React.useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: uvVert, fragmentShader: portalFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: theme.primary }, uB: { value: theme[rim as string] }, uTime: { value: 0 } } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rim],
  );
  React.useEffect(
    () => () => {
      gridMat.dispose();
      portalMat.dispose();
    },
    [gridMat, portalMat],
  );
  React.useEffect(() => {
    portalMat.blending = theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    portalMat.needsUpdate = true;
  }, [portalMat, theme.dark]);

  const cards = React.useRef<(THREE.Mesh | null)[]>([]);
  const st = React.useRef({ t: 0, hover: -1, spread: 0, order: Array.from({ length: n }, (_, i) => i), deal: -1, dealT: 0, nextDeal: 3, hv: new Float32Array(n), orbit: 0 });
  if (st.current.order.length !== n) {
    st.current.order = Array.from({ length: n }, (_, i) => i);
    st.current.hv = new Float32Array(n);
  }
  const jitter = React.useMemo(() => {
    const r = mulberry32(n * 13 + 5);
    return items.map(() => ({ z: (r() - 0.5) * 0.12, x: (r() - 0.5) * 0.1 }));
  }, [items, n]);
  const ptr = usePointer(env.rootRef);
  const group = React.useRef<THREE.Group>(null);
  const fit = layout === "stack" ? Math.min(1.6, viewport.height / 3.1, viewport.width / 3.2) : layout === "fan" ? Math.min(1.5, viewport.height / 4.0, viewport.width / (viewport.width < viewport.height ? 4.6 : 7.5)) : Math.min(1.25, viewport.height / 4.6, viewport.width / (viewport.width < viewport.height ? 5.2 : 7.5));

  const onOver = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    st.current.hover = i;
    bridge.setHovering(true);
  };
  const onOut = (i: number) => () => {
    if (st.current.hover === i) {
      st.current.hover = -1;
      bridge.setHovering(false);
    }
  };
  const onClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return;
    if (items[i]?.href) bridge.open(i);
  };

  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const s = st.current;
    const sp = env.speed;
    s.t += dt * sp;
    const p = ptr.current;
    stepPointer(p, dt, 3);
    const focusIdx = bridge.focus;
    const active = s.hover >= 0 ? s.hover : (focusIdx ?? -1);
    for (let i = 0; i < n; i++) s.hv[i] = damp(s.hv[i]!, i === active ? 1 : 0, 8, dt);
    const g = group.current;
    if (g) {
      g.scale.setScalar(fit);
      const tilt = env.finePointer ? 1 : 0;
      g.rotation.y = damp(g.rotation.y, p.sx * 0.25 * tilt, 3, dt);
      g.rotation.x = damp(g.rotation.x, -p.sy * 0.12 * tilt, 3, dt);
    }
    const anyHover = active >= 0 ? 1 : 0;
    s.spread = damp(s.spread, anyHover, 5, dt);
    gridMat.uniforms.uTime!.value = s.t;
    portalMat.uniforms.uTime!.value = s.t;

    if (layout === "stack" && autoplay && sp > 0 && n > 1) {
      if (s.deal < 0 && s.t > s.nextDeal && active < 0) {
        s.deal = s.order[0]!;
        s.dealT = 0;
      }
      if (s.deal >= 0) {
        s.dealT += dt / 1.1;
        if (s.dealT >= 1) {
          s.order.push(s.order.shift()!);
          s.deal = -1;
          s.nextDeal = s.t + 2.6;
        }
      }
    }
    if (layout === "orbit") s.orbit += dt * 0.25 * (autoplay ? sp : 0) * (1 - s.spread * 0.85);

    for (let i = 0; i < n; i++) {
      const m = cards.current[i];
      const mat = mats[i];
      if (!m || !mat) continue;
      const hv = s.hv[i]!;
      mat.uniforms.uHover!.value = hv;
      mat.uniforms.uTime!.value = s.t;
      mat.uniforms.uDim!.value = 1 - s.spread * (1 - hv) * 0.25;
      if (layout === "fan") {
        const o = i - (n - 1) / 2;
        const ang = o * (0.17 + s.spread * 0.07 + (autoplay && sp > 0 ? Math.sin(s.t * 0.8) * 0.015 : 0));
        const R = 6;
        m.position.set(Math.sin(ang) * R + jitter[i]!.x, Math.cos(ang) * R - R - 0.1 + hv * 0.35, i * 0.02 + hv * 0.5);
        m.rotation.set(0, 0, -ang);
        m.scale.setScalar(1 + hv * 0.06);
      } else if (layout === "orbit") {
        const a = (i / n) * Math.PI * 2 + s.orbit;
        const R = 2.7;
        m.position.set(Math.sin(a) * R, 0.15 + Math.sin(s.t * 0.9 + i) * 0.06 + hv * 0.25, Math.cos(a) * R * 0.75 - 0.4);
        m.rotation.set(-0.06, Math.atan2(Math.sin(a), Math.cos(a)) * 0.38, 0);
        m.scale.setScalar(0.82 + hv * 0.06);
      } else {
        const k = s.order.indexOf(i);
        let x = jitter[i]!.x * 0.6 + k * 0.04;
        let y = -k * 0.05;
        let z = -k * 0.12;
        let rz = jitter[i]!.z;
        let ry = 0;
        if (i === s.deal) {
          const t = s.dealT;
          const e = t * t * (3 - 2 * t);
          x += Math.sin(e * Math.PI) * 2.4;
          y += Math.sin(e * Math.PI) * 0.6;
          z = THREE.MathUtils.lerp(0, -(n - 1) * 0.12, e);
          ry = e * Math.PI * 2 * 0.5 * (e < 0.5 ? 1 : 1);
          rz += Math.sin(e * Math.PI) * 0.4;
        }
        m.position.set(x, y + hv * 0.2, z + hv * 0.3);
        m.rotation.set(0, ry, rz);
        m.scale.setScalar(1 + hv * 0.04);
      }
    }
  });

  return (
    <group ref={group}>
      {layout === "orbit" ? (
        <group position={[0, 0.15, -0.4]}>
          <mesh material={portalMat} renderOrder={-1}>
            <planeGeometry args={[3.4, 3.4]} />
          </mesh>
          <mesh>
            <torusGeometry args={[1.5, 0.025, 12, 160]} />
            <meshBasicMaterial color={theme[rim as string]} toneMapped={false} />
          </mesh>
        </group>
      ) : null}
      {floor === "synthgrid" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.45, -8]} material={gridMat} renderOrder={-2}>
          <planeGeometry args={[40, 24]} />
        </mesh>
      ) : null}
      {items.map((_, i) => (
        <mesh key={i} ref={(m) => void (cards.current[i] = m)} geometry={geo} material={mats[i]} onPointerOver={onOver(i)} onPointerOut={onOut(i)} onClick={onClick(i)} />
      ))}
    </group>
  );
}
