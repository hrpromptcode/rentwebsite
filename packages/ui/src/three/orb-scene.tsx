"use client";

import * as React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sparkles } from "@react-three/drei";
import * as THREE from "three";

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function Orb({ color, accent }: { color: string; accent: string }) {
  const mesh = React.useRef<THREE.Mesh>(null);
  const reduce = React.useRef(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduce.current = mq.matches;
    const h = (e: MediaQueryListEvent) => (reduce.current = e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  useFrame((state, dt) => {
    if (!mesh.current || reduce.current) return;
    mesh.current.rotation.y += dt * 0.25;
    mesh.current.rotation.x = THREE.MathUtils.lerp(mesh.current.rotation.x, state.pointer.y * 0.4, 0.05);
    mesh.current.rotation.z = THREE.MathUtils.lerp(mesh.current.rotation.z, state.pointer.x * 0.3, 0.05);
  });
  return (
    <Float speed={1.6} rotationIntensity={0.6} floatIntensity={1.4}>
      <mesh ref={mesh} scale={1.7}>
        <icosahedronGeometry args={[1, 48]} />
        <MeshDistortMaterial color={color} emissive={accent} emissiveIntensity={0.25} roughness={0.15} metalness={0.6} distort={0.42} speed={2} />
      </mesh>
    </Float>
  );
}

function Ring({ color }: { color: string }) {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.15;
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2.4, 0, 0]} scale={2.9}>
      <torusGeometry args={[1, 0.012, 16, 160]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} />
    </mesh>
  );
}

/** Floating distorted orb with sparkles. Mount only on capable devices (see HeroBackground). */
export function OrbScene({ className }: { className?: string }) {
  const [colors, setColors] = React.useState({ primary: "#8b5cf6", accent: "#22d3ee", glow: "#7c3aed" });
  React.useEffect(() => {
    setColors({ primary: cssVar("--primary", "#8b5cf6"), accent: cssVar("--accent", "#22d3ee"), glow: cssVar("--glow", "#7c3aed") });
  }, []);
  return (
    <div aria-hidden className={className ?? "pointer-events-none absolute inset-0"}>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 6], fov: 45 }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} style={{ pointerEvents: "none" }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 5, 6]} intensity={1.6} color={colors.accent} />
        <pointLight position={[-5, -3, -4]} intensity={2.2} color={colors.glow} />
        <group position={[1.6, 0.2, 0]}>
          <Orb color={colors.primary} accent={colors.accent} />
          <Ring color={colors.accent} />
          <Sparkles count={60} scale={7} size={2.2} speed={0.4} color={colors.accent} opacity={0.6} />
        </group>
      </Canvas>
    </div>
  );
}
