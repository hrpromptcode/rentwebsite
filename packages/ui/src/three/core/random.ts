/**
 * Deterministic randomness for 3D layouts and anything rendered on both server and client.
 * Never use Math.random() in render: SSR and hydration must agree.
 */

/** 32-bit string hash (FNV-1a) → seed. */
export function seedFromString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: seeded generator from a string id. */
export function seeded(id: string): () => number {
  return mulberry32(seedFromString(id));
}

/** Seeded helpers. */
export const rand = {
  range: (r: () => number, min: number, max: number) => min + (max - min) * r(),
  pick: <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!,
  sign: (r: () => number) => (r() < 0.5 ? -1 : 1),
};
