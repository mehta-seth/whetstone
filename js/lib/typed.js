// Typed answers. Some timed tests have you build the answer rather than pick it, so there is
// nothing to eliminate and no option to estimate towards. With the `typedAnswer` toggle on, a
// numeric item hides its options and takes the value instead.
//
// A TYPED WRONG ANSWER IS STILL ERROR-TYPED. Every distractor is a named wrong procedure, so a typed
// value that lands on a distractor's value names the mistake exactly as picking that option would.
// One that lands on nothing is recorded as unmatched, which is information too: the mistake was not
// one the archetype models.
import { displayDp } from './format.js';

// Types whose value can be typed. Labels, months, verdicts and signed directions are answered by
// choosing, because there is nothing to type that is not one of the options.
export const TYPABLE = new Set(['number', 'currency', 'percentage', 'countWithUnit', 'fraction']);

export function parseTyped(text, answerType) {
  if (typeof text !== 'string') return null;
  const raw = text.trim().toLowerCase();
  if (!raw) return null;
  if (answerType === 'fraction') {
    const m = raw.match(/^(-?\d+)\s*\/\s*(\d+)$/);
    if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2]);
  }
  // Currency symbols, percent signs, thousands separators and a trailing unit word are all accepted,
  // so "£22,064", "24%" and "96 pads" read the way they are written.
  const t = raw.replace(/[£$€%,\s]/g, '').replace(/[a-z]+$/, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
}

// The option the typed value matches, at that option's own displayed precision: a value that rounds
// to what the option shows is that option. Closest wins if two qualify. Fractions match exactly.
export function matchTyped(value, options, answerType) {
  if (!Number.isFinite(value)) return -1;
  let best = -1, bestGap = Infinity;
  options.forEach((o, i) => {
    if (typeof o.value !== 'number') return;
    // A count or a series term whose true value is whole is matched exactly, so 96.4 is not "96 pads"
    // and 72.4 is not the next term in a series. Measured before this: both scored as correct.
    // Money and percentages still round to their display, so £760.004 is "£760.00" and 24.4 is "24%".
    const exact = answerType === 'fraction'
      || ((answerType === 'countWithUnit' || answerType === 'number') && Number.isInteger(o.value));
    const tol = exact ? 1e-9 : 0.5 * 10 ** -displayDp(o.display) + 1e-9;
    const gap = Math.abs(value - o.value);
    if (gap <= tol && gap < bestGap) { best = i; bestGap = gap; }
  });
  return best;
}
