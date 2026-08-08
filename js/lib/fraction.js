function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

export function frac(numerator, denominator) {
  if (denominator === 0) throw new Error('fraction: zero denominator');
  let n = numerator, d = denominator;
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  n /= g; d /= g;
  return { n, d, value: n / d, display: d === 1 ? String(n) : `${n}/${d}` };
}
export const addFrac = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const subFrac = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mulFrac = (a, b) => frac(a.n * b.n, a.d * b.d);
export const ratio   = (a, b) => { const g = gcd(a, b) || 1; return { a: a / g, b: b / g, value: a / b, display: `${a / g}:${b / g}` }; };

// Recover the exact rational behind a value, searching denominators up to maxDen. Returns null
// when the value is not that rational, which is what keeps b02's answer a formula rather than a
// rounding judgement: The archetype spec calls for an "approximate ratio" and an approximate answer is
// not defined by the spec's first rule.
export function simpleRatio(value, maxDen = 12, maxNum = 24) {
  if (!Number.isFinite(value) || value <= 0) return null;
  for (let b = 1; b <= maxDen; b++) {
    const a = value * b;
    if (Math.abs(a - Math.round(a)) < 1e-9) {
      const r = ratio(Math.round(a), b);
      if (r.a <= maxNum && r.b <= maxDen) return r;
      return null;
    }
  }
  return null;
}
