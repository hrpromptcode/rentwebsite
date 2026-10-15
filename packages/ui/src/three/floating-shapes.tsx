"use client";

import * as React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

function Shape({ position, color, kind, scale = 1 }: { position: [number, number, number]; color: string; kind: "torus" | "ico" | "box" | "knot"; scale?: number }) {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.x += dt * 0.2;
    ref.current.rotation.y += dt * 0.3;
  });
  return (
    <Float speed={1.2} rotationIntensity={0.8} floatIntensity={1.2}>
      <mesh ref={ref} position={position} scale={scale}>
        {kind === "torus" && <torusGeometry args={[0.6, 0.22, 24, 64]} />}
        {kind === "ico" && <icosahedronGeometry args={[0.7, 0]} />}
        {kind === "box" && <boxGeometry args={[0.9, 0.9, 0.9]} />}
        {kind === "knot" && <torusKnotGeometry args={[0.5, 0.16, 120, 16]} />}
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
    </Float>
  );
}

/** A few floating geometric shapes — generic tech/corporate hero accent. */
export function FloatingShapes({ className, colors = ["#2563eb", "#f59e0b", "#60a5fa"] }: { className?: string; colors?: string[] }) {
  return (
    <div aria-hidden className={className ?? "pointer-events-none absolute inset-0"}>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 7], fov: 45 }} gl={{ alpha: true, antialias: true }} style={{ pointerEvents: "none" }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 4, 5]} intensity={1.4} />
        <Shape position={[-2.6, 1.2, 0]} color={colors[0]!} kind="torus" />
        <Shape position={[2.4, -0.6, -1]} color={colors[1]!} kind="ico" scale={0.9} />
        <Shape position={[0.6, 1.8, -2]} color={colors[2]!} kind="knot" scale={0.8} />
        <Shape position={[-1.2, -1.8, -1]} color={colors[0]!} kind="box" scale={0.7} />
      </Canvas>
    </div>
  );
}
