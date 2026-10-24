// Test sizes. `npm test` runs everything at full size; `npm run test:quick` sets LL_QUICK=1 and the heavy audits use `scaled(full, quick)`
// lives instead (the rules and the checks stay the same, only the number of sampled lives is smaller). LL_SCALE=0.5 scales every
// scaled() size by that factor (at least 1), e.g. LL_SCALE=0.25 for a smoke run.

export const QUICK = !!process.env.LL_QUICK && process.env.LL_QUICK !== '0';

/** `full` lives in a complete run, `quick` in a quick one (and never fewer than `min`). */
export function scaled(full, quick, min = 20) {
  const k = Number(process.env.LL_SCALE);
  if (Number.isFinite(k) && k > 0) return Math.max(min, Math.round(full * k));
  return QUICK ? Math.max(min, quick) : full;
}
