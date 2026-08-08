import { OPTION_RULES, REALISTIC_ASCENDING_P } from './constants.js';
import { harmonise } from './format.js';
import { checkOptionSet } from './validate.js';

export class OptionError extends Error {
  constructor(failures) {
    super('option set rejected: ' + failures.join(', '));
    this.name = 'OptionError';
    this.failures = failures;
  }
}

// Signature extends the spec with `context` and `rng`. Deliberate, and
// applied at every call site: display needs the currency symbol and the unit
// noun, and ordering needs a seeded source of randomness. Nothing else changed.
export function assemble({ correct, distractors = [], filler = [], answerType, order = 'ascending', context = {}, rng }) {
  const raw = [
    { value: correct.value, display: correct.display, role: 'correct', errorType: null, note: correct.note ?? 'CORRECT', sortKey: correct.sortKey, kind: correct.kind },
    ...distractors.map(d => ({ value: d.value, display: d.display, role: 'distractor', errorType: d.errorType, note: d.note, sortKey: d.sortKey, kind: d.kind })),
    ...filler.map(d => ({ value: d.value, display: d.display, role: 'filler', errorType: 'filler', note: d.note, sortKey: d.sortKey, kind: d.kind })),
  ];
  if (raw.length !== OPTION_RULES.count) throw new OptionError(['option-count']);
  const formatted = harmonise(raw, answerType, context);
  const failures = checkOptionSet(formatted, answerType, context);
  if (failures.length) throw new OptionError(failures);
  return reorder(formatted, order, rng);
}

// Numeric sets sort by value. Categorical sets have no magnitude order, so they sort by
// an explicit sortKey the archetype supplies, which is normally the stimulus row order
// with any verdict option last.
//
// Without the sortKey branch a label set came back in assemble order, which puts the
// correct option first in every single item. Measured on a12 before the fix: slot 1 in
// 100% of 200 items. That is a harder leak than an earlier round's open finding, because emit
// order is exactly what a candidate sees under ascending and realistic ordering.
const ascending = opts => {
  if (opts.every(o => typeof o.value === 'number')) return [...opts].sort((a, b) => a.value - b.value);
  if (opts.every(o => Number.isFinite(o.sortKey))) return [...opts].sort((a, b) => a.sortKey - b.sortKey);
  return opts;
};

// Ordering is applied here rather than inside generate (the spec step 6)
// because optionOrder is a session toggle and generate cannot see the session.
// Items are emitted in canonical ascending order and session.js reorders them
// from the item's own seed, so the result is identical and still reproducible.
export function reorder(options, order = 'ascending', rng) {
  if (order === 'ascending') return ascending(options);
  if (!rng) return ascending(options);
  if (order === 'realistic') {
    return rng.next() < REALISTIC_ASCENDING_P ? ascending(options) : rng.shuffle(options);
  }
  return rng.shuffle(options);
}
