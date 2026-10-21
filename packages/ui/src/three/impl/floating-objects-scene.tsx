"use client";

import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useSceneEnv } from "../core/scene-3d";
import { useThemeColors } from "../core/use-theme-colors";
import { useSectionProgress } from "../core/use-section-progress";
import { mulberry32, seedFromString } from "../core/random";
import { damp, dtc, stepPointer, usePointer, useStudioEnvironment } from "./shared";
import { AUTO_MATERIAL, DEFAULT_LAYOUT, GeoBank, MatBank, buildSet, type Palette } from "./floating-objects-kit";
import type { FloatingObjectsProps } from "../floating-objects";

interface Body {
  holder: THREE.Group;
  obj: THREE.Group;
  base: THREE.Vector3;
  depth: number;
  radius: number;
  phase: number;
  freq: number;
  spin: THREE.Vector3;
  off: THREE.Vector3;
  vel: THREE.Vector3;
  ang: THREE.Vector3;
  angVel: THREE.Vector3;
  rainSpeed: number;
  delay: number;
}

export default function FloatingObjectsScene({ set, material = "auto", count, layout, pointerParallax = true, scrollParallax = 0.3, interactive = "none", clearCenter = 0 }: FloatingObjectsProps) {
  const env = useSceneEnv();
  const viewport = useThree((s) => s.viewport);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const theme = useThemeColors(["primary", "accent", "glow", "surface", "foreground", "background"], env.rootRef);
  const style = material === "auto" ? AUTO_MATERIAL[set] : material;
  const lay = layout ?? DEFAULT_LAYOUT[set];
  const n = Math.max(1, Math.min(14, count ?? (env.quality === "high" && !env.mobile ? 7 : 5)));
  const mobile = env.mobile;

  useStudioEnvironment({ a: theme.primary, b: theme.accent, base: theme.background }, `${theme.version}`, 1);

  // build objects (rebuilt on theme change so materials take the new colours)
  const built = React.useMemo(() => {
    const pal: Palette = {
      primary: theme.primary.clone(),
      accent: theme.accent.clone(),
      glow: theme.glow.clone(),
      surface: theme.surface.clone(),
      foreground: theme.foreground.clone(),
      background: theme.background.clone(),
    };
    const mats = new MatBank(style, mobile);
    const geos = new GeoBank();
    const objs = buildSet(set, n, { pal, mats, geos, mobile }, seedFromString(set + n));
    return { objs, mats, geos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, n, style, mobile, theme.version]);
  React.useEffect(
    () => () => {
      built.mats.dispose();
      built.geos.dispose();
      built.objs.forEach((o) =>
        o.group.traverse((x) => {
          const ud = x.userData as { extraMaterials?: THREE.Material[]; extraGeometries?: THREE.BufferGeometry[] };
          ud.extraMaterials?.forEach((m) => m.dispose());
          ud.extraGeometries?.forEach((g) => g.dispose());
          if ((x as THREE.InstancedMesh).isInstancedMesh) (x as THREE.InstancedMesh).dispose();
        }),
      );
    },
    [built],
  );

  // layout (seeded)
  const hw = viewport.width / 2;
  const hh = viewport.height / 2;
  const bodies = React.useMemo<Body[]>(() => {
    const r = mulberry32(seedFromString(`${set}:${lay}:${n}`));
    const out: Body[] = [];
    const placed: { p: THREE.Vector3; r: number }[] = [];
    const scale = THREE.MathUtils.clamp(Math.min(hw, hh * 1.4) / 2.2, 0.7, 1.8);
    built.objs.forEach((o, i) => {
      const holder = new THREE.Group();
      // parenting happens in the attach effect (useMemo must stay pure: StrictMode runs it twice)
      holder.scale.setScalar(scale);
      const radius = o.radius * scale;
      const base = new THREE.Vector3();
      if (lay === "orbit") {
        const a = (i / n) * Math.PI * 2;
        const rx = Math.min(hw * 0.78, 2.9);
        base.set(Math.cos(a) * rx, Math.sin(a) * rx * 0.34, Math.sin(a) * 1.4);
      } else if (lay === "stack" && (o.kind === "stone" || i < 4)) {
        const prev = placed[placed.length - 1];
        const y = prev ? prev.p.y + prev.r * 0.5 + radius * 0.5 : -hh * 0.55;
        base.set((r() - 0.5) * 0.12, y, 0);
      } else if (lay === "rain") {
        base.set((r() * 2 - 1) * hw * 0.9, (r() * 2 - 1) * hh, (r() - 0.5) * 2.5);
      } else {
        let best = new THREE.Vector3();
        for (let tries = 0; tries < 80; tries++) {
          const x = (r() * 2 - 1) * hw * 0.88;
          if (clearCenter > 0 && Math.abs(x) < clearCenter * hw) continue;
          const cand = new THREE.Vector3(x, (r() * 2 - 1) * hh * 0.82, (r() - 0.55) * 2.6);
          best = cand;
          if (placed.every((pp) => pp.p.distanceTo(cand) > (pp.r + radius) * 1.05)) break;
        }
        base.copy(best);
      }
      placed.push({ p: base.clone(), r: radius });
      out.push({
        holder,
        obj: o.group,
        base,
        depth: THREE.MathUtils.clamp((base.z + 2) / 3.5, 0.2, 1.2),
        radius,
        phase: r() * Math.PI * 2,
        freq: 0.6 + r() * 0.7,
        spin: new THREE.Vector3((r() - 0.5) * 0.35, (r() - 0.5) * 0.55, (r() - 0.5) * 0.25),
        off: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        ang: new THREE.Vector3(r() * 0.6, r() * 6.28, r() * 0.4),
        angVel: new THREE.Vector3(),
        rainSpeed: 0.35 + r() * 0.5,
        delay: i * 0.09,
      });
    });
    return out;
  }, [built, lay, n, hw, hh, set, clearCenter]);

  const root = React.useRef<THREE.Group>(null);
  React.useEffect(() => {
    const g = root.current;
    if (!g) return;
    bodies.forEach((b) => {
      b.holder.add(b.obj);
      g.add(b.holder);
    });
    invalidate();
    return () => {
      bodies.forEach((b) => g.remove(b.holder));
    };
  }, [bodies, invalidate]);

  const ptr = usePointer(env.rootRef);
  const progress = useSectionProgress(env.rootRef);
  const clock = React.useRef({ t: 0, started: -1 });
  const dragState = React.useRef<{ body: Body | null; plane: THREE.Plane; hit: THREE.Vector3; last: THREE.Vector3 }>({ body: null, plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit: new THREE.Vector3(), last: new THREE.Vector3() });
  const ray = React.useMemo(() => new THREE.Raycaster(), []);
  const ndc = React.useMemo(() => new THREE.Vector2(), []);
  const bouncy = set === "pastry" || set === "gaming";

  const findBody = (obj: THREE.Object3D | null) => {
    let o: THREE.Object3D | null = obj;
    while (o) {
      const b = bodies.find((x) => x.holder === o);
      if (b) return b;
      o = o.parent;
    }
    return null;
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (interactive === "none") return;
    const b = findBody(e.object);
    if (!b) return;
    e.stopPropagation();
    if (interactive === "poke") {
      const dir = new THREE.Vector3().subVectors(b.holder.position, e.point).normalize();
      b.vel.addScaledVector(dir, 3.2).add(new THREE.Vector3(0, 0, -2.2));
      b.angVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 8);
      invalidate();
    } else {
      dragState.current.body = b;
      dragState.current.plane.set(new THREE.Vector3(0, 0, 1), -b.holder.position.z);
      dragState.current.last.copy(b.holder.position);
      (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
      env.rootRef.current?.setAttribute("data-dragging", "true");
    }
  };
  React.useEffect(() => {
    if (interactive !== "drag") return;
    const up = () => {
      dragState.current.body = null;
      env.rootRef.current?.removeAttribute("data-dragging");
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [interactive, env.rootRef]);

  useFrame((_, rawDt) => {
    const dt = dtc(rawDt);
    const c = clock.current;
    const speed = env.speed;
    if (c.started < 0 && env.activeRef.current) c.started = c.t;
    c.t += dt * Math.max(speed, 0);
    const p = ptr.current;
    stepPointer(p, dt, 2.2);
    const prog = progress.current;
    const ds = dragState.current;

    if (ds.body && interactive === "drag") {
      ndc.set(p.x, p.y);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(ds.plane, ds.hit)) {
        const b = ds.body;
        const target = ds.hit.clone().sub(b.base);
        b.vel.copy(target).sub(b.off).divideScalar(Math.max(dt, 1 / 120));
        b.off.copy(target);
      }
    }

    const t = c.t;
    bodies.forEach((b, i) => {
      // spring offset (poke / drag release)
      if (b !== ds.body) {
        const k = bouncy ? 16 : 22;
        const cd = bouncy ? 3.2 : 5;
        b.vel.addScaledVector(b.off, -k * dt).multiplyScalar(Math.exp(-cd * dt));
        b.off.addScaledVector(b.vel, dt);
      }
      b.angVel.multiplyScalar(Math.exp(-2.2 * dt));
      b.ang.addScaledVector(b.spin, dt * speed).addScaledVector(b.angVel, dt);

      // entrance
      let enter = 1;
      if (speed > 0) {
        const e = c.started < 0 ? 0 : THREE.MathUtils.clamp((t - c.started - b.delay) / 1.4, 0, 1);
        enter = bouncy ? 1 - Math.exp(-6 * e) * Math.cos(e * 11) : 1 - Math.pow(1 - e, 4);
      }

      let x = b.base.x;
      let y = b.base.y;
      let z = b.base.z;
      if (lay === "orbit") {
        const a = (i / n) * Math.PI * 2 + t * 0.12;
        const rx = Math.min(hw * 0.78, 2.9);
        x = Math.cos(a) * rx;
        y = Math.sin(a) * rx * 0.34;
        z = Math.sin(a) * 1.4;
      } else if (lay === "rain") {
        const span = hh * 2 + 2.4;
        y = hh + 1.2 - ((((b.base.y + hh) / (2 * hh)) * span + t * b.rainSpeed) % span);
      }
      const bob = speed > 0 ? Math.sin(t * b.freq + b.phase) : 0;
      y += bob * 0.14 * (lay === "stack" ? 0.25 : 1);
      x += (speed > 0 ? Math.cos(t * b.freq * 0.7 + b.phase) : 0) * 0.06;
      if (pointerParallax && env.finePointer) {
        x += p.sx * 0.32 * b.depth;
        y += p.sy * 0.22 * b.depth;
      }
      y += (prog - 0.5) * -scrollParallax * 2.2 * b.depth;
      // entrance: fall in from above (pastry/gaming bounce), others rise + fade-scale
      const fromY = bouncy ? hh * 2.2 : -0.9;
      const ey = THREE.MathUtils.lerp(fromY, 0, enter);
      b.holder.position.set(x + b.off.x, y + b.off.y + ey, z + b.off.z);
      const s0 = bouncy ? 1 : THREE.MathUtils.lerp(0.6, 1, Math.min(1, enter));
      b.holder.scale.setScalar((b.holder.userData.s0 ??= b.holder.scale.x) * s0);
      b.holder.rotation.set(b.ang.x + (lay === "stack" ? 0 : 0), b.ang.y, b.ang.z * (lay === "stack" ? 0.1 : 1));
      b.holder.visible = enter > 0.001 || speed === 0;
    });
    if (root.current) {
      root.current.rotation.y = damp(root.current.rotation.y, pointerParallax && env.finePointer ? p.sx * 0.12 : 0, 3, dt);
      root.current.rotation.x = damp(root.current.rotation.x, pointerParallax && env.finePointer ? -p.sy * 0.06 : 0, 3, dt);
    }
  });

  return (
    <>
      <ambientLight intensity={0.25} />
      <hemisphereLight args={[theme.glow, theme.background, 0.6]} />
      <directionalLight position={[3, 5, 6]} intensity={2.6} />
      <directionalLight position={[-5, 1, -4]} intensity={2.2} color={theme.accent} />
      <directionalLight position={[0, -4, 3]} intensity={0.6} color={theme.primary} />
      <pointLight position={[-3, 2, 4]} intensity={20} distance={16} color={theme.primary} />
      <group ref={root} onPointerDown={onDown} />
    </>
  );
}
