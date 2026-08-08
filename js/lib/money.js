// Round half away from zero at a fixed decimal count, with a nudge that absorbs
// binary representation error. Math.round alone breaks on negatives (it rounds
// toward +Infinity) which matters for signedDirection answers.
export function roundTo(value, dp = 0) {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** dp;
  const rounded = Math.round(Math.abs(value) * f + 1e-9);
  return (value < 0 ? -1 : 1) * rounded / f;
}

// Thousands separators, hand-rolled rather than toLocaleString so that node and
// the browser cannot disagree about the output a fixture is diffed against.
export function groupDigits(value, dp = 0) {
  const neg = value < 0;
  const fixed = Math.abs(roundTo(value, dp)).toFixed(dp);
  const [int, fracPart] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + (fracPart ? '.' + fracPart : '');
}

export function money(value, symbol = '£', dp = 'auto') {
  const places = dp === 'auto' ? (Number.isInteger(roundTo(value, 2)) ? 0 : 2) : dp;
  return (value < 0 ? '-' : '') + symbol + groupDigits(Math.abs(value), places);
}

// Is this number eyeballable? The spec wants awkward values: 4,283 forces
// a setup, 4,000 does not. Generator-side helper only, never a validator
// predicate, because a15's own parameters are round to the nearest 100.
export function isRound(value, dp = 0) {
  const scaled = Math.round(Math.abs(value) * 10 ** dp);
  if (scaled === 0) return true;
  const step = 10 ** Math.max(1, String(scaled).length - 2);
  return scaled % step === 0;
}

export function awkward(rng, min, max, dp = 0) {
  for (let i = 0; i < 40; i++) {
    const v = roundTo(rng.float(min, max), dp);
    if (!isRound(v, dp)) return v;
  }
  return roundTo(rng.float(min, max), dp);   // give up rather than loop forever
}
