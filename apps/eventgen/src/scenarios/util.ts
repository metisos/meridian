/**
 * Small helpers for scenarios — deterministic randomness when bulk mode passes a seeded RNG.
 */

export function jitter(rng: () => number, maxMs: number): number {
  return rng() * maxMs;
}

export function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

export function rndInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function rndIp(rng: () => number): string {
  return `${rndInt(rng, 10, 250)}.${rndInt(rng, 0, 255)}.${rndInt(rng, 0, 255)}.${rndInt(rng, 1, 254)}`;
}

export function rndUser(rng: () => number, pool = USER_POOL): string {
  return pick(rng, pool);
}

const USER_POOL = [
  "alice.chen", "bob.singh", "carol.kim", "dan.weiss", "evan.lopez",
  "fiona.park", "greg.osei", "hana.koh", "ian.murphy", "julia.rao",
  "kai.brown", "lena.faisal", "miguel.diaz", "nina.tran", "owen.shaw",
];

/** A simple seeded RNG (mulberry32) so bulk runs are deterministic when given the same seed. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
