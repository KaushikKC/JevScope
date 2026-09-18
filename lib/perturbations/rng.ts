/**
 * Seeded pseudo-random number generation.
 *
 * Every perturbation that makes a random choice draws from here with an
 * explicit seed, so "typo noise, seed 42" names exactly one transformed input
 * forever. Without this, a robustness result could not be re-derived, and an
 * experiment you cannot rerun is not evidence.
 */

/** mulberry32: 32-bit state, uniform output, no dependencies. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/** Fisher-Yates over a copy, driven by the supplied rng. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const DEFAULT_SEED = 42;
