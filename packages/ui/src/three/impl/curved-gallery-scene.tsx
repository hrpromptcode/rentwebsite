"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { GLSL_COVER, GLSL_ROUNDRECT, clamp, damp, dtc, stepPointer, stepScroll, useImageTextures, usePointer, useScrollVelocity } from "./shared";
import type { CurvedGalleryProps, GalleryBridge } from "../curved-gallery";

const TAU = Math.PI * 2;
const wrapAngle = (a: number) => {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
};

const WHITE = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

/** Curved card: a slice of the cylinder (centre at z=0, edges curving toward the camera) + optional vertical bow. */
function makeCardGeometry(W: number, H: number, R: number, bend: number) {
  const g = new THREE.PlaneGeometry(W, H, 24, 10);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const th = x / R;
    const yy = y / (H / 2);
    pos.setXYZ(i, R * Math.sin(th), y, R * (1 - Math.cos(th)) + bend * H * 0.5 * yy * yy);
  }
  pos.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const cardVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const cardFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uLoaded;
uniform float uCardAspect;
uniform float uImgAspect;
uniform vec3 uSurface;
uniform vec3 uBg;
uniform vec3 uRim;
uniform float uHover;
uniform float uFocus;
uniform float uRel;
uniform float uArcHalf;
uniform float uFog;
uniform float uReflect;
uniform float uCorner;
varying vec2 vUv;
${GLSL_ROUNDRECT}
${GLSL_COVER}
void main(){
  vec2 p = (vUv - 0.5) * vec2(uCardAspect, 1.0);
  float d = sdRoundRect(p, vec2(uCardAspect, 1.0) * 0.5, uCorner);
  float aa = fwidth(d) * 1.2;
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask < 0.004) discard;
  vec2 iuv = coverUv(vUv, uCardAspect, uImgAspect);
  iuv = (iuv - 0.5) / (1.08 + uHover * 0.05) + 0.5;
  iuv.x += clamp(uRel, -1.0, 1.0) * 0.035;
  vec3 img = texture2D(uMap, iuv).rgb;
  vec3 ph = mix(uSurface, uRim, 0.06 + 0.12 * vUv.y);
  vec3 col = mix(ph, img, uLoaded);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, mix(0.82, 1.1, uHover));
  col *= mix(0.9, 1.06, uHover);
  float side = smoothstep(0.2, 1.0, abs(uRel) / max(uArcHalf * 0.75, 0.01));
  col = mix(col, uBg, side * 0.5 * uFog);
  // glossy sheen sweeping with the ring
  float s = vUv.x * 0.85 + vUv.y * 0.55 - 0.7 + uRel * 1.6;
  col += (smoothstep(0.2, 0.0, abs(s)) * 0.07 + smoothstep(0.04, 0.0, abs(s)) * 0.05) * (0.7 + uHover);
  col += smoothstep(0.9, 1.0, vUv.y) * 0.04;
  // rim
  float rim = 1.0 - smoothstep(0.0, aa * 2.5, abs(d + aa * 1.5));
  col = mix(col, uRim, rim * (0.22 + 0.65 * max(uHover, uFocus)));
  float alpha = mask * (1.0 - smoothstep(uArcHalf * 0.8, uArcHalf, abs(uRel)));
  if (uReflect > 0.5) {
    alpha *= 0.42 * smoothstep(0.2, 1.0, vUv.y);
    col = mix(uBg, col, 0.7);
  }
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

const floorVert = /* glsl */ `
varying vec3 vWorld;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

const floorFrag = /* glsl */ `
uniform vec3 uLine;
uniform vec3 uBg;
uniform vec3 uGlow;
uniform float uAngle;
uniform float uCell;
uniform float uFar;
uniform float uLineAlpha;
uniform float uReflectMode;
uniform float uR;
varying vec3 vWorld;
void main(){
  vec2 p = vWorld.xz;
  float c = cos(uAngle); float s = sin(uAngle);
  vec2 q = mat2(c, -s, s, c) * p;
  vec2 g = q / uCell;
  vec2 gw = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
  float line = 1.0 - min(min(gw.x, gw.y), 1.0);
  float r = length(p);
  float ringLine = 1.0 - min(abs(fract(r / (uCell * 2.0) - 0.5) - 0.5) / max(fwidth(r / (uCell * 2.0)), 1e-4), 1.0);
  float dist = length(vWorld.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(uFar * 0.2, uFar, dist);
  float lineA = max(line, ringLine * 0.5) * uLineAlpha * fade;
  float pool = exp(-pow(length(p - vec2(0.0, -uR * 0.85)) / (uR * 0.75), 2.0));
  float poolA = pool * (0.14 - uReflectMode * 0.06);
  float baseA = uReflectMode * 0.42 * (1.0 - smoothstep(uFar * 0.4, uFar * 1.1, dist));
  float a = clamp(lineA + poolA + baseA, 0.0, 1.0);
  vec3 col = (uLine * lineA + uGlow * poolA + uBg * baseA) / max(lineA + poolA + baseA, 1e-4);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

const glowFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main(){
  float d = length((vUv - 0.5) * vec2(1.0, 1.6));
  float a = exp(-d * d * 9.0) * uAlpha;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

interface Layout {
  W: number;
  H: number;
  M: number;
  step: number;
  arcHalf: number;
  phiMax: number;
  rowsY: number[];
  floorY: number;
  camY: number;
  camZ: number;
  lookY: number;
  fov: number;
  R: number;
}

function computeLayout(n: number, width: number, height: number, R: number, rows: number, cardAspect: number, arc: number, mobile: boolean): Layout {
  const aspect = width / Math.max(1, height);
  const fov = aspect < 0.85 ? 66 : aspect < 1.3 ? 58 : 52;
  const vf = THREE.MathUtils.degToRad(fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
  const camZ = R * (mobile ? 0.42 : 0.55);
  // solve the ring angle that projects onto the screen edge
  let lo = 0;
  let hi = Math.PI * 0.95;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const a = Math.atan2(R * Math.sin(mid), R * Math.cos(mid) + camZ);
    if (a < hf / 2) lo = mid;
    else hi = mid;
  }
  const phiMax = lo;
  const visibleCards = clamp(aspect * 2.6, 1.35, rows === 2 ? 6 : 4.8);
  const angWant = (2 * phiMax) / (visibleCards * 1.12);
  const stepMin = angWant * 1.12;
  const Mmin = Math.max(1, Math.floor(TAU / stepMin));
  // the ring repeats the items k times; cards fill their slot (12% gap) so spacing stays tight for any count
  const k = Math.max(1, Math.round(Mmin / Math.max(1, n)));
  const M = Math.max(1, n) * k;
  const step = TAU / M;
  let ang = step / 1.12;
  let W = ang * R;
  let H = W / cardAspect;
  const D = R + camZ;
  const visH = 2 * D * Math.tan(vf / 2);
  const maxH = visH * (rows === 2 ? 0.3 : mobile ? 0.5 : 0.52);
  if (H > maxH) {
    H = maxH;
    W = H * cardAspect;
    ang = W / R;
  }
  const rowsY = rows === 2 ? [H * 0.56, -H * 0.56] : [0];
  const floorY = rows === 2 ? -H * 1.06 - H * 0.28 : -H / 2 - H * 0.34;
  return { W, H, M, step, arcHalf: (arc * Math.PI) / 2, phiMax, rowsY, floorY, camY: H * (rows === 2 ? 0.08 : 0.12), camZ, lookY: -H * (rows === 2 ? 0.06 : 0.22), fov, R };
}

interface Slot {
  row: number;
  index: number;
  item: number;
  base: number;
  hover: number;
  loaded: number;
}

export default function CurvedGalleryScene(props: CurvedGalleryProps & { bridge: GalleryBridge }) {
  const { items, bridge, arc = 1.25, cardAspect = 0.8, bend = 0.12, autoplay = 0.05, drag = true, scrollLinked = true, fog = true } = props;
  const env = useSceneEnv();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const theme = useThemeColors(["background", "foreground", "surface", "primary", "accent", "glow"], env.rootRef);
  const mobile = env.mobile || size.width < 768;
  const rows = mobile ? 1 : (props.rows ?? 1);
  const R = mobile ? Math.min(props.radius ?? 7, 5) : (props.radius ?? 7);
  const floor = mobile && props.floor === "reflect" ? "grid" : (props.floor ?? "grid");
  const n = items.length;

  const L = React.useMemo(() => computeLayout(n, size.width, size.height, R, rows, cardAspect, arc, mobile), [n, size.width, size.height, R, rows, cardAspect, arc, mobile]);

  const geometry = React.useMemo(() => makeCardGeometry(L.W, L.H, L.R, bend), [L.W, L.H, L.R, bend]);
  React.useEffect(() => () => geometry.dispose(), [geometry]);

  const uniq = React.useMemo(() => Array.from(new Set(items.map((i) => i.image))), [items]);
  const textures = useImageTextures(uniq, { width: 768 });
  const texByImage = React.useMemo(() => {
    const m = new Map<string, { texture: THREE.Texture; aspect: number }>();
    uniq.forEach((src, i) => {
      const t = textures[i];
      if (t) m.set(src, t);
    });
    return m;
  }, [uniq, textures]);

  const slots = React.useMemo<Slot[]>(() => {
    const out: Slot[] = [];
    for (let r = 0; r < rows; r++) {
      const offItem = r === 0 ? 0 : Math.floor(n / 2);
      for (let s = 0; s < L.M; s++) out.push({ row: r, index: s, item: (s + offItem) % Math.max(1, n), base: s * L.step + (r === 1 ? L.step / 2 : 0), hover: 0, loaded: 0 });
    }
    return out;
  }, [rows, L.M, L.step, n]);

  const materials = React.useMemo(() => {
    const corner = 0.045;
    return slots.map(() => {
      const uniforms = {
        uMap: { value: WHITE as THREE.Texture },
        uLoaded: { value: 0 },
        uCardAspect: { value: cardAspect },
        uImgAspect: { value: 1 },
        uSurface: { value: theme.surface },
        uBg: { value: theme.background },
        uRim: { value: theme.accent },
        uHover: { value: 0 },
        uFocus: { value: 0 },
        uRel: { value: 0 },
        uArcHalf: { value: L.arcHalf },
        uFog: { value: fog ? 1 : 0 },
        uReflect: { value: 0 },
        uCorner: { value: corner },
      };
      const front = new THREE.ShaderMaterial({ vertexShader: cardVert, fragmentShader: cardFrag, uniforms, transparent: true, side: THREE.DoubleSide, depthWrite: true });
      const mirror = new THREE.ShaderMaterial({ vertexShader: cardVert, fragmentShader: cardFrag, uniforms: { ...uniforms, uReflect: { value: 1 } }, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      return { front, mirror };
    });
    // theme colour objects are stable; materials only depend on layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, cardAspect, L.arcHalf, fog]);
  React.useEffect(
    () => () =>
      materials.forEach((m) => {
        m.front.dispose();
        m.mirror.dispose();
      }),
    [materials],
  );

  // bind textures as they arrive
  React.useEffect(() => {
    slots.forEach((s, i) => {
      const t = texByImage.get(items[s.item]?.image ?? "");
      const u = materials[i]!.front.uniforms;
      if (t) {
        u.uMap!.value = t.texture;
        u.uImgAspect!.value = t.aspect;
      }
    });
    invalidate();
  }, [texByImage, slots, materials, items, invalidate]);

  const floorMat = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVert,
        fragmentShader: floorFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uLine: { value: theme.foreground },
          uBg: { value: theme.background },
          uGlow: { value: theme.primary },
          uAngle: { value: 0 },
          uCell: { value: 1.2 },
          uFar: { value: 3 },
          uLineAlpha: { value: 0.16 },
          uReflectMode: { value: 0 },
          uR: { value: 7 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const glowMat = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: cardVert,
        fragmentShader: glowFrag,
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: theme.primary }, uAlpha: { value: 0.3 } },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  React.useEffect(
    () => () => {
      floorMat.dispose();
      glowMat.dispose();
    },
    [floorMat, glowMat],
  );
  React.useEffect(() => {
    floorMat.uniforms.uCell!.value = L.H * 0.42;
    floorMat.uniforms.uFar!.value = L.R * (fog ? 2.4 : 3.4);
    floorMat.uniforms.uR!.value = L.R;
    floorMat.uniforms.uReflectMode!.value = floor === "reflect" ? 1 : 0;
    floorMat.uniforms.uLineAlpha!.value = theme.dark ? 0.17 : 0.14;
    glowMat.blending = theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    glowMat.uniforms.uAlpha!.value = theme.dark ? 0.2 : 0.12;
    glowMat.needsUpdate = true;
    invalidate();
  }, [floorMat, glowMat, L.H, L.R, fog, floor, theme.dark, theme.version, invalidate]);

  // camera fov follows the layout
  React.useEffect(() => {
    camera.fov = L.fov;
    camera.near = 0.1;
    camera.far = 120;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, L.fov, invalidate]);

  // interaction state (refs only)
  const st = React.useRef({ angle: 0, vel: 0, down: false, dragging: false, lastX: 0, lastT: 0, moved: 0, hoverSlot: -1, labelSlot: -1, labelFocus: false, wheel: 0 });
  const ptr = usePointer(env.rootRef);
  const scroll = useScrollVelocity();

  React.useEffect(() => {
    const el = env.rootRef.current?.parentElement ?? env.rootRef.current;
    if (!el || !drag) return;
    const s = st.current;
    const sens = () => (2 * L.phiMax * 0.95) / Math.max(1, el.clientWidth);
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      s.down = true;
      s.moved = 0;
      s.lastX = e.clientX;
      s.lastT = performance.now();
      s.vel = 0;
    };
    const move = (e: PointerEvent) => {
      if (!s.down) return;
      const now = performance.now();
      const dx = e.clientX - s.lastX;
      const dt = Math.max(1, now - s.lastT) / 1000;
      s.lastX = e.clientX;
      s.lastT = now;
      s.moved += Math.abs(dx);
      if (s.moved > 5 && !s.dragging) {
        s.dragging = true;
        bridge.setDragging(true);
      }
      const dA = -dx * sens();
      s.angle += dA;
      s.vel = s.vel * 0.6 + (dA / dt) * 0.4;
      invalidate();
    };
    const up = () => {
      if (!s.down) return;
      s.down = false;
      s.vel = clamp(s.vel, -4, 4);
      if (performance.now() - s.lastT > 90) s.vel = 0;
      // keep `dragging` true until after the click event of this gesture
      setTimeout(() => {
        s.dragging = false;
        bridge.setDragging(false);
      }, 0);
    };
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) s.wheel += e.deltaX;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [env.rootRef, drag, L.phiMax, bridge, invalidate]);

  const pivots = React.useRef<(THREE.Group | null)[]>([]);
  const cards = React.useRef<(THREE.Mesh | null)[]>([]);
  const mirrors = React.useRef<(THREE.Mesh | null)[]>([]);
  const tmp = React.useMemo(() => new THREE.Vector3(), []);

  // hidden pivots still raycast in three.js: ignore cards that are not on screen
  const shown = (e: { object: THREE.Object3D }) => !!e.object.parent?.visible;
  const onOver = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    if (!shown(e)) return;
    e.stopPropagation();
    if (st.current.dragging) return;
    st.current.hoverSlot = i;
    bridge.setHovering(true);
    invalidate();
  };
  const onOut = (i: number) => () => {
    if (st.current.hoverSlot === i) {
      st.current.hoverSlot = -1;
      bridge.setHovering(false);
    }
    invalidate();
  };
  const onClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!shown(e)) return;
    e.stopPropagation();
    if (st.current.moved > 6 || e.delta > 6) return;
    const it = items[slots[i]!.item];
    if (it?.href) bridge.open(slots[i]!.item);
  };

  useFrame((state, rawDt) => {
    const dt = dtc(rawDt);
    const s = st.current;
    stepScroll(scroll.current, dt);
    stepPointer(ptr.current, dt, 2.5);
    const auto = autoplay * env.speed;
    const focusItem = bridge.focus;

    if (!s.down) {
      if (focusItem !== null && focusItem < n) {
        // rotate to the nearest slot (row 0) showing the focused item
        let best = 0;
        let bestD = Infinity;
        for (const sl of slots) {
          if (sl.row !== 0 || sl.item !== focusItem) continue;
          const d = wrapAngle(sl.base - s.angle);
          if (Math.abs(d) < Math.abs(bestD)) {
            bestD = d;
            best = s.angle + d;
          }
        }
        s.angle = damp(s.angle, best, 5, dt);
        s.vel = 0;
      } else {
        s.angle += s.vel * dt;
        const hovering = s.hoverSlot >= 0;
        s.vel = damp(s.vel, hovering ? 0 : auto, hovering ? 4 : 1.4, dt);
        if (scrollLinked) s.angle += scroll.current.sv * 0.00042 * dt * Math.max(env.speed, 0.5);
        if (s.wheel) {
          s.angle += s.wheel * 0.0016;
          s.wheel = 0;
        }
        if (auto === 0 && Math.abs(s.vel) < 0.06 && Math.abs(scroll.current.sv) < 30) {
          const target = Math.round(s.angle / L.step) * L.step;
          s.angle = damp(s.angle, target, 4, dt);
        }
      }
    }

    // camera parallax
    const p = ptr.current;
    const px = env.finePointer ? p.sx : 0;
    const py = env.finePointer ? p.sy : 0;
    camera.position.set(px * L.H * 0.12, L.camY + py * L.H * 0.06, L.camZ);
    camera.lookAt(px * L.H * 0.05, L.lookY, -L.R);

    floorMat.uniforms.uAngle!.value = s.angle;

    let labelSlot = s.hoverSlot;
    let labelFocus = false;
    if (labelSlot < 0 && focusItem !== null) {
      let bestD = Infinity;
      slots.forEach((sl, i) => {
        if (sl.row !== 0 || sl.item !== focusItem) return;
        const d = Math.abs(wrapAngle(sl.base - s.angle));
        if (d < bestD) {
          bestD = d;
          labelSlot = i;
        }
      });
      labelFocus = true;
    }

    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i]!;
      const pivot = pivots.current[i];
      const card = cards.current[i];
      if (!pivot || !card) continue;
      const rowAngle = sl.row === 1 ? s.angle * 0.92 : s.angle;
      const rel = wrapAngle(sl.base - rowAngle);
      const visible = Math.abs(rel) < L.arcHalf + L.step && Math.abs(rel) < Math.PI * 0.62;
      pivot.visible = visible;
      if (!visible) continue;
      pivot.rotation.y = -rel;
      const target = i === labelSlot ? 1 : 0;
      sl.hover = damp(sl.hover, target, 7, dt);
      const lift = sl.hover * 0.25 * (L.H / 3.2);
      card.position.set(0, L.rowsY[sl.row] ?? 0, -L.R + lift);
      card.scale.setScalar(1 + sl.hover * 0.04);
      const m = materials[i]!;
      const u = m.front.uniforms;
      u.uRel!.value = rel;
      u.uHover!.value = sl.hover;
      u.uFocus!.value = labelFocus && i === labelSlot ? 1 : 0;
      const hasTex = u.uMap!.value !== WHITE;
      sl.loaded = damp(sl.loaded, hasTex ? 1 : 0, 5, dt);
      u.uLoaded!.value = sl.loaded;
      const mirror = mirrors.current[i];
      if (mirror) {
        mirror.position.set(0, 2 * L.floorY - (L.rowsY[sl.row] ?? 0), -L.R + lift);
        mirror.scale.set(1 + sl.hover * 0.04, -(1 + sl.hover * 0.04), 1);
      }
    }

    // DOM label under the active card
    if (labelSlot !== s.labelSlot || labelFocus !== s.labelFocus) {
      s.labelSlot = labelSlot;
      s.labelFocus = labelFocus;
      bridge.setLabel(labelSlot >= 0 ? slots[labelSlot]!.item : null, labelFocus);
    }
    const el = bridge.labelEl;
    const card = labelSlot >= 0 ? cards.current[labelSlot] : null;
    if (el && card) {
      tmp.set(0, -L.H / 2 - L.H * 0.06, 0);
      card.localToWorld(tmp);
      tmp.project(state.camera);
      const x = (tmp.x * 0.5 + 0.5) * size.width;
      const y = (-tmp.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${Math.min(y + 8, size.height - 70).toFixed(1)}px, 0) translateX(-50%)`;
    }

    if (env.reducedMotion) return;
    if (Math.abs(s.vel) > 1e-4 || s.down || Math.abs(scroll.current.sv) > 1) state.invalidate();
  });

  return (
    <group>
      <mesh position={[0, L.rowsY[0]! * 0.2, -L.R * 1.25]} material={glowMat} raycast={() => null} renderOrder={-1}>
        <planeGeometry args={[L.R * 2.6, L.H * 2.2]} />
      </mesh>
      {floor !== "none" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, L.floorY, 0]} material={floorMat} raycast={() => null} renderOrder={1}>
          <planeGeometry args={[L.R * 7, L.R * 7, 1, 1]} />
        </mesh>
      ) : null}
      {slots.map((sl, i) => (
        <group key={`${sl.row}-${sl.index}`} ref={(g) => void (pivots.current[i] = g)}>
          <mesh
            ref={(m) => void (cards.current[i] = m)}
            geometry={geometry}
            material={materials[i]!.front}
            renderOrder={2}
            onPointerOver={onOver(i)}
            onPointerOut={onOut(i)}
            onClick={onClick(i)}
          />
          {floor === "reflect" ? <mesh ref={(m) => void (mirrors.current[i] = m)} geometry={geometry} material={materials[i]!.mirror} renderOrder={0} raycast={() => null} /> : null}
        </group>
      ))}
    </group>
  );
}
