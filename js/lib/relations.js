// The relation set. Second half of the relational generator: dataset.js owns the data,
// this owns the arithmetic over it.
//
// Every relation returns { value, steps, formulaText }. None of them solves anything: each
// evaluates its own definition over values it is handed, which is the spec's
// first rule. An archetype composes a relation with operands drawn from the dataset and
// never rearranges the arithmetic.
//
// ---------------------------------------------------------------------------------------
// COUNT. The archetype spec Part B says "Fifteen relations" and then lists sixteen items. It
// reconciles only if argmax and argmin are one relation with a direction parameter, which
// is how b06 ("Argmax or argmin with label answers") and d18 both treat it. Built that way,
// so the count below is honest: fifteen entries, one of which takes a direction.
//
// FOUR DEFINITIONS the archetype spec NAMES WITHOUT DEFINING. Recorded here and printed on the
// audit page so the stems can be read against them:
//
//   percentageChange      across periods, (late - early) / early. Directional.
//   percentageDifference  between two co-temporal values, (a - b) / b. "How much more
//                         than", which is a different question from a change over time,
//                         and the relation set lists both.
//   percentageOfReference value / reference. Not a shortfall: no direction implied.
//   pctRequiredToMatch    (target - current) / current. What b04 and d18 need.
// ---------------------------------------------------------------------------------------

import { rowTotal, colTotal, grandTotal, seriesTotal } from './dataset.js';
import { ratio as makeRatio } from './fraction.js';

const pct = (num, den) => 100 * num / den;

// 1. Cell lookup. Trivial as arithmetic, and still a relation: it is the base case the
//    counterfactual wrapper is most often composed with.
export const cellLookup = (series, i) => ({
  value: series.values[i],
  formulaText: 'the value in that cell',
  steps: [`${series.labels[i]}: ${series.values[i]}`],
});

// 2. Row share. cell / rowTotal.
export const rowShare = (d, r, c) => {
  const cell = d.values[r][c], total = rowTotal(d, r);
  return { value: pct(cell, total), formulaText: 'cell / row total x 100',
    steps: [`${d.rows[r].label} total = ${total}`, `${cell} / ${total} x 100 = ${pct(cell, total).toFixed(4)}%`] };
};

// 3. Column share. cell / colTotal. Deliberately a separate relation from row share even
//    though the arithmetic is a mirror, because b07 exists to punish confusing the two.
export const colShare = (d, r, c) => {
  const cell = d.values[r][c], total = colTotal(d, c);
  return { value: pct(cell, total), formulaText: 'cell / column total x 100',
    steps: [`${d.cols[c].label} total = ${total}`, `${cell} / ${total} x 100 = ${pct(cell, total).toFixed(4)}%`] };
};

// 4. Cell over grand total.
export const cellOverGrand = (d, r, c) => {
  const cell = d.values[r][c], total = grandTotal(d);
  return { value: pct(cell, total), formulaText: 'cell / grand total x 100',
    steps: [`grand total = ${total}`, `${cell} / ${total} x 100 = ${pct(cell, total).toFixed(4)}%`] };
};

// 5. Subtotal over grand total. The subtotal is a sum of named cells, so this covers a row
//    over the grand total, a column over it, or any hand-picked block.
export const subtotalOverGrand = (d, cells) => {
  const sub = cells.reduce((s, [r, c]) => s + d.values[r][c], 0);
  const total = grandTotal(d);
  return { value: pct(sub, total), formulaText: 'subtotal / grand total x 100',
    steps: [`subtotal = ${sub}`, `grand total = ${total}`, `${sub} / ${total} x 100 = ${pct(sub, total).toFixed(4)}%`] };
};

// 6. Multi-cell sum.
export const multiCellSum = (d, cells) => {
  const parts = cells.map(([r, c]) => d.values[r][c]);
  return { value: parts.reduce((a, b) => a + b, 0), formulaText: 'sum of the named cells',
    steps: [`${parts.join(' + ')} = ${parts.reduce((a, b) => a + b, 0)}`] };
};

// 7. Argmax or argmin over any series, raw or derived. One relation, a direction parameter.
//    Returns the series key, not a number, which is what makes the answer type `label`.
export const extremum = (series, direction = 'max') => {
  const cmp = direction === 'max'
    ? (a, b) => a > b
    : (a, b) => a < b;
  let best = 0;
  for (let i = 1; i < series.values.length; i++) if (cmp(series.values[i], series.values[best])) best = i;
  return {
    value: series.keys[best], index: best, label: series.labels[best],
    formulaText: `arg${direction} over ${series.label}`,
    steps: series.values.map((v, i) => `${series.labels[i]}: ${v}${i === best ? '  <- ' + direction : ''}`),
  };
};
export const argmax = s => extremum(s, 'max');
export const argmin = s => extremum(s, 'min');

// 8. Percentage change across periods. Directional: a fall is negative.
export const percentageChange = (early, late) => ({
  value: pct(late - early, early), formulaText: '(late - early) / early x 100',
  steps: [`(${late} - ${early}) / ${early} x 100 = ${pct(late - early, early).toFixed(4)}%`],
});

// 9. Percentage difference between two co-temporal values. "How much more than."
export const percentageDifference = (a, b) => ({
  value: pct(a - b, b), formulaText: '(a - b) / b x 100',
  steps: [`(${a} - ${b}) / ${b} x 100 = ${pct(a - b, b).toFixed(4)}%`],
});

// 10. Percentage of a reference.
export const percentageOfReference = (value, reference) => ({
  value: pct(value, reference), formulaText: 'value / reference x 100',
  steps: [`${value} / ${reference} x 100 = ${pct(value, reference).toFixed(4)}%`],
});

// 11. Shortfall or excess against a reference. Positive is a shortfall, negative an excess,
//     and the sign is the whole point: b05's verdict option is correct exactly when this
//     comes out negative.
export const shortfall = (value, reference) => ({
  value: pct(reference - value, reference), exceeded: value > reference,
  formulaText: '(reference - consumed) / reference x 100',
  steps: [`(${reference} - ${value}) / ${reference} x 100 = ${pct(reference - value, reference).toFixed(4)}%`],
});

// 12. Ratio, reduced to lowest terms.
export const ratioOf = (a, b) => {
  const r = makeRatio(Math.round(a), Math.round(b));
  return { value: r.value, display: r.display, a: r.a, b: r.b,
    formulaText: 'a : b in lowest terms', steps: [`${Math.round(a)} : ${Math.round(b)} = ${r.display}`] };
};

// 13. Percentage required to match a target.
export const pctRequiredToMatch = (current, target) => ({
  value: pct(target - current, current), formulaText: '(target - current) / current x 100',
  steps: [`(${target} - ${current}) / ${current} x 100 = ${pct(target - current, current).toFixed(4)}%`],
});

// 14. Per-unit rate.
export const perUnitRate = (total, units) => ({
  value: total / units, formulaText: 'total / units',
  steps: [`${total} / ${units} = ${(total / units).toFixed(4)}`],
});

// 15. Weighted average over a series and a weight series.
export const weightedAverage = (values, weights) => {
  const num = values.reduce((s, v, i) => s + v * weights[i], 0);
  const den = weights.reduce((a, b) => a + b, 0);
  return { value: num / den, formulaText: 'sum(value x weight) / sum(weight)',
    steps: [`weighted sum = ${num}`, `weights = ${den}`, `${num} / ${den} = ${(num / den).toFixed(4)}`] };
};

// The conservation relation behind b04. One cell rises by a stated percentage and another
// must fall to hold a total constant; the answer is that fall as a percentage of the cell
// it comes out of. Reads the `conserved` block counterfactual() attached.
export const conservationReduction = cf => {
  if (!cf.conserved) throw new Error('conservationReduction: dataset carries no conservation block');
  const { from, reduceBy, reducePct } = cf.conserved;
  return { value: reducePct, increase: reduceBy,
    formulaText: 'increase in the first cell / the second cell x 100',
    steps: [`increase = ${reduceBy}`, `${reduceBy} / ${from} x 100 = ${reducePct.toFixed(4)}%`] };
};

// Registry, so the audit page can print the definition of whatever a stem claims to be
// asking. Fifteen, argmax and argmin counted once.
export const RELATIONS = {
  cellLookup:            { fn: cellLookup,            definition: 'the value in one cell' },
  rowShare:              { fn: rowShare,              definition: 'cell / row total x 100' },
  colShare:              { fn: colShare,              definition: 'cell / column total x 100' },
  cellOverGrand:         { fn: cellOverGrand,         definition: 'cell / grand total x 100' },
  subtotalOverGrand:     { fn: subtotalOverGrand,     definition: 'subtotal / grand total x 100' },
  multiCellSum:          { fn: multiCellSum,          definition: 'sum of the named cells' },
  extremum:              { fn: extremum,              definition: 'argmax or argmin over a series, raw or derived' },
  percentageChange:      { fn: percentageChange,      definition: '(late - early) / early x 100' },
  percentageDifference:  { fn: percentageDifference,  definition: '(a - b) / b x 100, co-temporal' },
  percentageOfReference: { fn: percentageOfReference, definition: 'value / reference x 100' },
  shortfall:             { fn: shortfall,             definition: '(reference - consumed) / reference x 100' },
  ratioOf:               { fn: ratioOf,               definition: 'a : b in lowest terms' },
  pctRequiredToMatch:    { fn: pctRequiredToMatch,    definition: '(target - current) / current x 100' },
  perUnitRate:           { fn: perUnitRate,           definition: 'total / units' },
  weightedAverage:       { fn: weightedAverage,       definition: 'sum(value x weight) / sum(weight)' },
};

export const RELATION_COUNT = Object.keys(RELATIONS).length;

// Sum of a series, exported so archetypes never reimplement it.
export { seriesTotal };
