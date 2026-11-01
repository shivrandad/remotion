// Cryptographically secure randomness. Math.random is never used for outcomes.

/** Uniform 32-bit unsigned integer from the OS CSPRNG. */
function u32() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

/** True 50/50: one bit from crypto.getRandomValues. */
export function coinToss() {
  return (u32() & 1) === 0 ? 'heads' : 'tails';
}

/** Uniform integer in [0, n) without modulo bias (rejection sampling). */
export function randInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  let x;
  do x = u32(); while (x >= limit);
  return x % n;
}

/** Uniform pick from `items`, never returning `exclude`. */
export function pickExcluding(items, exclude) {
  const pool = items.filter((i) => i !== exclude);
  return pool[randInt(pool.length)];
}

/** Uniform float in [0,1) for cosmetic jitter (also crypto-sourced). */
export function rand01() {
  return u32() / 0x100000000;
}
