import { money, groupDigits, roundTo } from './money.js';

export const NUMERIC_TYPES = new Set(['number', 'currency', 'percentage', 'countWithUnit', 'signedDirection']);
export const ANSWER_TYPES = new Set([...NUMERIC_TYPES, 'fraction', 'ratio', 'label', 'month', 'verdict']);

// Categorical types carry values that are not magnitudes: a label, a month index, a
// verdict string. An earlier round's four ratio guards (max-spread, filler-far, near-band,
// no-tight-neighbour) are all arguments about what a candidate can eliminate on sight
// by reading size, and none of them means anything between "Package W" and "Package X",
// or between month 9 and month 3. validate.js skips them for these types and keeps
// distinctness, finiteness and count.
export const CATEGORICAL_TYPES = new Set(['label', 'month', 'verdict']);

// Types where the option must carry its own display string, because the value alone
// cannot be formatted back into the printed form: 3/4 and 0.75 are the same number.
export const EXPLICIT_DISPLAY_TYPES = new Set(['fraction', 'ratio', 'label', 'verdict']);

// Decision 11. Every real currency option set observed is uniform: the
// paper's Q13 all integers, Q15 all integers, a20 all 2dp. Every real percentage set
// observed is mixed: 0.30 / 3.0 / 24 / 30 / 32, and 40 / 50 / 52.5 / 55 / 65. So money
// forces one decimal count across the set, and percentages and bare numbers stay
// natural. This narrows an earlier round's decision 3 rather than reversing it: that decision
// existed because forced uniformity printed "40.0%" and "65.0%", which is a percentage
// problem, not a currency one.
export const UNIFORM_DP_TYPES = new Set(['currency', 'signedDirection']);

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Fewest decimals that represent the value without losing information, capped at 2.
export function naturalDp(value) {
  if (Number.isInteger(roundTo(value, 2))) return 0;
  if (roundTo(value, 1) === roundTo(value, 2)) return 1;
  return 2;
}

export function display(value, answerType, context = {}) {
  const dp = context.dp ?? (NUMERIC_TYPES.has(answerType) ? naturalDp(value) : 0);
  const symbol = context.currencySymbol ?? '£';
  switch (answerType) {
    case 'number':      return groupDigits(value, dp);
    case 'currency':    return money(value, symbol, dp);
    case 'percentage':  return groupDigits(value, dp) + '%';
    case 'countWithUnit': {
      const noun = Math.abs(value) === 1 ? (context.unit ?? context.unitPlural) : (context.unitPlural ?? context.unit);
      return groupDigits(value, 0) + (noun ? ' ' + noun : '');
    }
    case 'signedDirection': {
      if (roundTo(value, dp) === 0) return context.zeroLabel ?? 'Does not change';
      const magnitude = context.magnitudeType === 'number'
        ? groupDigits(Math.abs(value), dp)
        : money(Math.abs(value), symbol, dp);
      return `${value < 0 ? 'Decrease' : 'Increase'} by ${magnitude}`;
    }
    case 'month':       return Number.isInteger(value) ? MONTHS[((value % 12) + 12) % 12] : String(value);
    default:            return String(value);   // fraction, ratio, label, verdict supply their own
  }
}

// Decision 3 replaces forced uniform decimals with natural formatting plus one
// guard. Formatting each option naturally is the correct behaviour — an option set
// can legitimately carry 0.30%, 3.0%, 24%, 30% and 32% side by side. The
// only thing that must not happen is decimal variation singling out the correct
// answer, so if the correct option's decimal count is unique in the set, and only
// then, the whole set is padded to the widest count present.
export function harmonise(options, answerType, context = {}) {
  if (!NUMERIC_TYPES.has(answerType) || context.dp !== undefined) {
    return options.map(o => ({ ...o, display: o.display ?? display(o.value, answerType, context) }));
  }
  const dps = options.map(o => naturalDp(o.value));
  const correctIdx = options.findIndex(o => o.role === 'correct');
  const correctDp = dps[correctIdx];
  const isolated = correctIdx >= 0 && dps.filter(d => d === correctDp).length === 1;
  // Money is always uniform. Everything else intervenes only if the decimal count
  // would single out the correct answer, which is a tell.
  const forced = (UNIFORM_DP_TYPES.has(answerType) || isolated) ? Math.max(...dps) : null;
  return options.map((o, i) => ({
    ...o,
    display: display(o.value, answerType, { ...context, dp: forced ?? dps[i] }),
  }));
}

// Trailing decimal count of a rendered option, used by the validator to confirm
// harmonise did its job even when an archetype supplied displays directly.
export function displayDp(str) {
  const m = String(str).match(/\.(\d+)/);
  return m ? m[1].length : 0;
}
