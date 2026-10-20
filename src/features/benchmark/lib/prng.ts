/**
 * Deterministic PRNG for the synthetic benchmark data (#126): sfc32 (Small Fast Counter, 128-bit
 * state, passes PractRand) seeded through splitmix32. The same seed always yields the same
 * networks and belief rounds, so the seed recorded with a result reproduces its input exactly.
 */

export type Random = () => number;

/** splitmix32 step: a well-mixed 32-bit value from a 32-bit state. */
export function splitmix32(state: number): { value: number; next: number } {
  const next = (state + 0x9e3779b9) | 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  return { value: z >>> 0, next };
}

/** A generator of floats in [0, 1) (32-bit resolution) for the given integer seed. */
export function createRandom(seed: number): Random {
  let s = seed | 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    const step = splitmix32(s);
    words.push(step.value);
    s = step.next;
  }
  let a = words[0] ?? 0;
  let b = words[1] ?? 0;
  let c = words[2] ?? 0;
  let d = words[3] ?? 0;
  const random: Random = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // Discard the first outputs: sfc32 needs a few rounds to decorrelate from the seed words.
  for (let i = 0; i < 12; i++) random();
  return random;
}

/**
 * Derives the seed of one scenario from the suite seed and its parameters (FNV-1a over the
 * values, then a splitmix32 finalizer), so every network size × density has its own stable seed
 * and repetitions of a scenario measure the same network.
 */
export function deriveSeed(baseSeed: number, ...parts: number[]): number {
  let hash = 0x811c9dc5;
  for (const part of [baseSeed, ...parts]) {
    let v = part | 0;
    for (let i = 0; i < 4; i++) {
      hash ^= v & 0xff;
      hash = Math.imul(hash, 0x01000193);
      v >>>= 8;
    }
  }
  return splitmix32(hash).value;
}
