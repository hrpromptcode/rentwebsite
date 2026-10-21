"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { ensureFont, resolveFontFamily, wrapText } from "../core/canvas-text";
import { readThemeHex } from "../core/theme-colors";
import { mulberry32, seedFromString } from "../core/random";
import { damp, dtc, stepPointer, usePointer, useStudioEnvironment } from "./shared";
import type { Ticket3DProps } from "../ticket-3d";

const W = 3.6;
const H = 1.6;
const D = 0.05;
const STUB_X = W / 2 - 0.95;
const STUB_U = (STUB_X + W / 2) / W;

function ticketShape() {
  const w = W / 2;
  const h = H / 2;
  const r = 0.14;
  const nr = 0.13;
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(STUB_X - nr, -h);
  s.absarc(STUB_X, -h, nr, Math.PI, 0, true);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(STUB_X + nr, h);
  s.absarc(STUB_X, h, nr, 0, Math.PI, true);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

function faceGeometry(shape: THREE.Shape, flip: boolean) {
  const g = new THREE.ShapeGeometry(shape, 32);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + W / 2) / W;
    const v = (pos.getY(i) + H / 2) / H;
    uv.setXY(i, flip ? 1 - u : u, v);
  }
  uv.needsUpdate = true;
  return g;
}

async function drawFace(side: "front" | "back", p: Ticket3DProps, c: Record<"primary" | "accent" | "glow" | "foreground" | "background" | "primaryForeground", string>): Promise<HTMLCanvasElement> {
  const CW = 2048;
  const CH = Math.round((CW * H) / W);
  const cv = document.createElement("canvas");
  cv.width = CW;
  cv.height = CH;
  const ctx = cv.getContext("2d")!;
  // the back is drawn as seen from behind: its stub (and perforation) sit on the LEFT
  const stubPx = side === "front" ? STUB_U * CW : (1 - STUB_U) * CW;
  const disp = resolveFontFamily("--font-display");
  const body = resolveFontFamily("--font-body");
  const ink = c.primaryForeground;
  await ensureFont(`700 120px ${disp}`, p.title);
  const g = ctx.createLinearGradient(0, 0, CW, CH);
  g.addColorStop(0, side === "front" ? c.primary : c.foreground);
  g.addColorStop(1, side === "front" ? c.accent : c.primary);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
  // guilloche pattern
  const r = mulberry32(seedFromString(p.title + side));
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  for (let k = 0; k < 26; k++) {
    ctx.beginPath();
    const amp = 30 + r() * 60;
    const ph = r() * 6.28;
    for (let x = side === "front" ? 0 : stubPx; x <= (side === "front" ? stubPx : CW); x += 12) {
      const y = CH * (k / 26) + Math.sin(x / 140 + ph) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // perforation
  ctx.setLineDash([18, 16]);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(stubPx, 40);
  ctx.lineTo(stubPx, CH - 40);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  if (side === "front") {
    ctx.font = `500 44px ${body}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(p.date, 90, 130);
    ctx.globalAlpha = 1;
    ctx.font = `700 120px ${disp}`;
    const lines = wrapText(ctx, p.title, stubPx - 200).slice(0, 2);
    lines.forEach((l, i) => ctx.fillText(l, 90, 300 + i * 150));
    ctx.font = `500 46px ${body}`;
    ctx.globalAlpha = 0.9;
    const meta = [p.venue, p.price].filter(Boolean).join("   ·   ");
    if (meta) ctx.fillText(meta, 90, CH - 100);
    ctx.globalAlpha = 1;
    // stub: code + barcode
    ctx.save();
    ctx.translate(stubPx + 120, CH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `600 52px ${body}`;
    ctx.textAlign = "center";
    ctx.fillText(p.code || "ADMIT ONE", 0, 0);
    ctx.restore();
    const bx = stubPx + 210;
    for (let x = bx; x < CW - 90; ) {
      const w = 4 + Math.floor(r() * 4) * 4;
      if (r() > 0.35) ctx.fillRect(x, 120, w, CH - 240);
      x += w + 6;
    }
  } else {
    ctx.font = `800 150px ${disp}`;
    ctx.globalAlpha = 0.14;
    for (let k = 0; k < 4; k++) ctx.fillText("ADMIT ONE  ADMIT ONE", -60 + k * 40, 200 + k * 190);
    ctx.globalAlpha = 1;
    ctx.font = `600 60px ${body}`;
    ctx.textAlign = "right";
    ctx.fillText(p.code || "ADMIT ONE", CW - 90, CH - 110);
    ctx.textAlign = "left";
    // qr-ish block on the stub
    const q = 300;
    const qx = (stubPx - q) / 2;
    const qy = (CH - q) / 2;
    ctx.fillStyle = c.background;
    ctx.fillRect(qx - 20, qy - 20, q + 40, q + 40);
    ctx.fillStyle = c.foreground;
    const cell = q / 15;
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) if (r() > 0.5 || (x < 4 && y < 4) || (x > 10 && y < 4) || (x < 4 && y > 10)) ctx.fillRect(qx + x * cell, qy + y * cell, cell, cell);
  }
  return cv;
}

const faceVert = /* glsl */ `
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
const faceFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uLoaded;
uniform float uHolo;
uniform vec2 uTilt;
uniform float uTime;
uniform vec3 uBase;
uniform float uStubU;
uniform float uFlip;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
vec3 pal(float t){ return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t)); }
void main(){
  vec3 base = mix(uBase, texture2D(uMap, vUv).rgb, uLoaded);
  vec3 nn = gl_FrontFacing ? normalize(vN) : -normalize(vN);
  float view = dot(nn, normalize(vV));
  float t = vUv.x * 0.9 + vUv.y * 0.45 + uTilt.x * 0.7 + uTilt.y * 0.5 + view * 0.6 + uTime * 0.02;
  vec3 foil = pal(t);
  float u = mix(vUv.x, 1.0 - vUv.x, uFlip);
  float lines = 0.5 + 0.5 * sin((vUv.x + vUv.y * 0.55) * 260.0);
  float stub = smoothstep(uStubU - 0.01, uStubU + 0.02, u);
  float mask = uHolo * (0.1 + 0.22 * lines + stub * 0.32);
  vec3 col = mix(base, base * 0.55 + foil * 0.75, mask);
  float band = smoothstep(0.22, 0.0, abs(vUv.x - (0.5 + uTilt.x * 0.9) + (vUv.y - 0.5) * 0.45));
  col += (vec3(0.22) + foil * 0.12) * band * (0.4 + uHolo * 0.6);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default function Ticket3DScene(props: Ticket3DProps) {
  const { holo = true, interactive = "drag" } = props;
  const env = useSceneEnv();
  const viewport = useThree((s) => s.viewport);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const theme = useThemeColors(["primary", "accent", "glow", "foreground", "background"], env.rootRef);
  useStudioEnvironment({ a: theme.primary, b: theme.accent, base: theme.background }, theme.version, 1);

  const shape = React.useMemo(() => ticketShape(), []);
  const geos = React.useMemo(() => {
    const body = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 32 });
    body.translate(0, 0, -D / 2);
    return { body, front: faceGeometry(shape, false), back: faceGeometry(shape, true) };
  }, [shape]);
  React.useEffect(
    () => () => {
      geos.body.dispose();
      geos.front.dispose();
      geos.back.dispose();
    },
    [geos],
  );
  const mats = React.useMemo(() => {
    const mk = (flip: number) =>
      new THREE.ShaderMaterial({
        vertexShader: faceVert,
        fragmentShader: faceFrag,
        side: flip ? THREE.BackSide : THREE.FrontSide,
        uniforms: { uMap: { value: null as THREE.Texture | null }, uLoaded: { value: 0 }, uHolo: { value: 1 }, uTilt: { value: new THREE.Vector2() }, uTime: { value: 0 }, uBase: { value: theme.primary }, uStubU: { value: STUB_U }, uFlip: { value: flip } },
      });
    const front = mk(0);
    const back = mk(1);
    back.uniforms.uTilt = front.uniforms.uTilt!;
    back.uniforms.uTime = front.uniforms.uTime!;
    const edge = new THREE.MeshPhysicalMaterial({ color: theme.accent.clone().lerp(new THREE.Color(1, 1, 1), 0.3), metalness: 0.85, roughness: 0.22, iridescence: 1, iridescenceIOR: 1.5, clearcoat: 1 });
    return { front, back, edge };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(
    () => () => {
      mats.front.dispose();
      mats.back.dispose();
      mats.edge.dispose();
    },
    [mats],
  );
  React.useEffect(() => {
    mats.front.uniforms.uHolo!.value = holo ? 1 : 0;
    mats.back.uniforms.uHolo!.value = holo ? 1 : 0;
    mats.edge.color.copy(theme.accent).lerp(new THREE.Color(1, 1, 1), 0.3);
  }, [mats, holo, theme.version, theme.accent]);

  // canvas textures (re-drawn on theme change)
  React.useEffect(() => {
    let alive = true;
    const made: THREE.Texture[] = [];
    const root = env.rootRef.current;
    const hex = readThemeHex(["primary", "accent", "glow", "foreground", "background"] as const, root);
    const pf = readThemeHex(["var(--primary-foreground, #ffffff)"] as const, root)["var(--primary-foreground, #ffffff)"];
    const colors = { ...hex, primaryForeground: pf };
    (["front", "back"] as const).forEach((side) => {
      drawFace(side, props, colors).then((cv) => {
        if (!alive) return;
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        made.push(t);
        const m = side === "front" ? mats.front : mats.back;
        m.uniforms.uMap!.value = t;
        m.uniforms.uLoaded!.value = 1;
        invalidate();
      });
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.title, props.date, props.venue, props.price, props.code, theme.version, mats, gl]);

  // drag-to-spin with inertia, snapping to the front
  const st = React.useRef({ rotY: 0, vel: 0, down: false, lastX: 0, lastT: 0, t: 0 });
  React.useEffect(() => {
    const el = env.rootRef.current;
    if (!el || interactive !== "drag") return;
    const s = st.current;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      s.down = true;
      s.lastX = e.clientX;
      s.lastT = performance.now();
      s.vel = 0;
    };
    const move = (e: PointerEvent) => {
      if (!s.down) return;
      const now = performance.now();
      const dx = e.clientX - s.lastX;
      const dA = dx * 0.012;
      s.rotY += dA;
      s.vel = s.vel * 0.5 + (dA / Math.max(0.001, (now - s.lastT) / 1000)) * 0.5;
      s.lastX = e.clientX;
      s.lastT = now;
      invalidate();
    };
    const up = () => {
      if (!s.down) return;
      s.down = false;
      if (performance.now() - s.lastT > 90) s.vel = 0;
      s.vel = THREE.MathUtils.clamp(s.vel, -14, 14);
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [env.rootRef, interactive, invalidate]);

  const group = React.useRef<THREE.Group>(null);
  const ptr = usePointer(env.rootRef);
  const fit = Math.min(1.25, (viewport.width * 0.82) / W, (viewport.height * 0.7) / H);

  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const s = st.current;
    const sp = env.speed;
    s.t += dt * sp;
    const p = ptr.current;
    stepPointer(p, dt, 3);
    if (!s.down) {
      s.rotY += s.vel * dt;
      s.vel *= Math.exp(-2.4 * dt);
      if (Math.abs(s.vel) < 0.6) {
        const target = Math.round(s.rotY / (Math.PI * 2)) * Math.PI * 2;
        s.rotY = damp(s.rotY, target, 3, dt);
      }
    }
    const g = group.current;
    if (!g) return;
    const tiltOn = interactive !== "none" && env.finePointer;
    const tx = tiltOn ? -p.sy * 0.32 : 0;
    const ty = tiltOn ? p.sx * 0.45 : 0;
    g.rotation.x = damp(g.rotation.x, tx + Math.sin(s.t * 0.7) * 0.06, 4, dt);
    g.rotation.y = s.rotY + ty + Math.sin(s.t * 0.5) * 0.12;
    g.rotation.z = Math.sin(s.t * 0.4) * 0.04 - 0.08;
    g.position.y = Math.sin(s.t * 0.9) * 0.07;
    g.scale.setScalar(fit);
    const tilt = mats.front.uniforms.uTilt!.value as THREE.Vector2;
    tilt.set(Math.sin(g.rotation.y), g.rotation.x);
    mats.front.uniforms.uTime!.value = s.t;
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <group ref={group}>
        <mesh geometry={geos.body} material={mats.edge} />
        <mesh geometry={geos.front} material={mats.front} position={[0, 0, D / 2 + 0.021]} />
        <mesh geometry={geos.back} material={mats.back} position={[0, 0, -D / 2 - 0.021]} />
      </group>
    </>
  );
}
