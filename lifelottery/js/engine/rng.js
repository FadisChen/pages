// Seedable PRNG (sfc32) plus the small set of sampling utilities the engine needs.
//
// The generator state is a plain array of four uint32 values, so it can live inside the
// JSON save file (`state.rng`) and a life can be resumed bit-for-bit after a page reload.
// Every function takes the state array explicitly; there is no hidden global state.

/** Hash an arbitrary seed (number or string) into a non-zero uint32. */
export function hashSeed(seed) {
  let h = 2166136261 >>> 0; // FNV-1a
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 0x9e3779b9;
}

/** Create a fresh PRNG state array from any seed value. */
export function createRngState(seed) {
  // splitmix32 expands one 32-bit hash into four well-mixed words.
  let x = hashSeed(seed);
  const next = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st = [next(), next(), next(), next()];
  for (let i = 0; i < 12; i++) rand(st); // warm up
  return st;
}

/** Uniform float in [0, 1). Mutates `st`. */
export function rand(st) {
  let a = st[0], b = st[1], c = st[2], d = st[3];
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  st[0] = a >>> 0; st[1] = b; st[2] = c; st[3] = d;
  return t / 4294967296;
}

/** True with probability p. */
export const chance = (st, p) => rand(st) < p;

/** Uniform float in [a, b). */
export const between = (st, a, b) => a + rand(st) * (b - a);

/** Uniform integer in [a, b], inclusive. */
export const randInt = (st, a, b) => a + Math.floor(rand(st) * (b - a + 1));

/** Uniform element of a non-empty array. */
export function pick(st, arr) {
  return arr[Math.floor(rand(st) * arr.length)];
}

/** Standard normal sample (Box-Muller). */
export function gauss(st) {
  let u = 0;
  while (u === 0) u = rand(st);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand(st));
}

/** Normal sample with mean and standard deviation. */
export const normal = (st, mean = 0, sd = 1) => mean + sd * gauss(st);

/** Normal sample truncated to [lo, hi] by clamping. */
export const normalClamped = (st, mean, sd, lo, hi) => Math.min(hi, Math.max(lo, normal(st, mean, sd)));

/** Poisson sample (Knuth; fine for small lambda). */
export function poisson(st, lambda) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(st); } while (p > L && k < 60);
  return k - 1;
}

/** Index drawn proportionally to `weights` (non-negative numbers). Returns -1 if all are zero. */
export function weightedIndex(st, weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i] > 0 ? weights[i] : 0;
  if (total <= 0) return -1;
  let r = rand(st) * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if (r < w) return i;
    r -= w;
  }
  return weights.length - 1;
}

/** Element drawn proportionally to `weightFn(item)`; returns undefined when nothing has weight. */
export function weightedPick(st, items, weightFn) {
  const i = weightedIndex(st, items.map(weightFn));
  return i < 0 ? undefined : items[i];
}

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Inverse standard normal CDF (Acklam's approximation), p in (0, 1). */
export function normInv(p) {
  p = clamp(p, 1e-6, 1 - 1e-6);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  let q, r;
  if (p < lo) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5; r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Deterministic number in [0, 1) from a string (FNV-1a plus a final avalanche so similar strings differ). No generator state is used. */
export function hash01(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
