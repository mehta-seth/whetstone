// Synthetic dataset. The first half of the spec's "relational generator (synthetic
// dataset plus relations over cells)". This file owns the data; relations.js owns the
// arithmetic over it; stimulus.js turns one into something a candidate can read.
//
// A dataset is a two-way matrix plus enough metadata that a relation can tell what is
// legal. values[r][c], rows and cols carrying their own labels, units and decimal places.
//
// ---------------------------------------------------------------------------------------
// FAMILIES. The archetype spec Part B says one table serves 3 to 7 questions and never says which
// archetypes may share one. Its own observed examples make three incompatible shapes, and
// the incompatibility is semantic rather than arithmetic:
//
//   regional   zoos x animal types. Additive along both axes, so a row total, a column
//              total and a grand total all mean something. b07's row-share-against-
//              column-share pair needs exactly this and can run nowhere else.
//   retail     metrics x product sizes. Only the quantity row is additive: adding a price
//              to a cup count is not a number. Carries the multiplicative derived series
//              (quantity x price = takings) that b08 is built on.
//   nutrition  nutrients x flavours, stated per 100 units, with a pack size per flavour
//              and a reference amount per nutrient. Neither axis is additive. b01 and b05
//              need the pack sizes and the references and no other family has them.
//
// So `additive` is a property of an axis, not of the table, and every relation that sums
// asks before it sums. Recorded as an addition to the specification, not a reading of it.
// ---------------------------------------------------------------------------------------

import { awkward, roundTo, groupDigits, money } from './money.js';

export const FAMILIES = ['regional', 'retail', 'nutrition', 'civic'];

// No two values inside a row or a column may be equal. Ties would make argmax ambiguous, and
// they make any "read the wrong row or column" distractor equal the answer, which is the one
// failure the spec will not tolerate. Cheaper to enforce at the draw than to
// reject the item four relations later.
export const allDistinct = arr => new Set(arr.map(v => Number(v))).size === arr.length;
const distinctGrid = g => g.every(allDistinct)
  && g[0].every((_, c) => allDistinct(g.map(row => row[c])));

export function makeDataset({ family, rows, cols, values, meta = {}, totals = {}, caption = null, text = '' }) {
  return {
    family,
    // rows: [{ key, label, unit, dp, additive, prefix }]  cols: [{ key, label }]
    rows, cols, values, meta, caption, text,
    totals: { row: !!totals.row, col: !!totals.col, label: totals.label ?? 'Total' },
  };
}

// ---- accessors -------------------------------------------------------------------------

export const rowIndex = (d, key) => d.rows.findIndex(r => r.key === key);
export const colIndex = (d, key) => d.cols.findIndex(c => c.key === key);
export const cell     = (d, r, c) => d.values[r][c];

export const rowTotal = (d, r) => d.values[r].reduce((s, v) => s + v, 0);
export const colTotal = (d, c) => d.values.reduce((s, row) => s + row[c], 0);
export const grandTotal = d => d.values.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);

// A labelled numeric vector. Relations take these rather than raw indices, which is what
// lets a derived series and a raw row be handled by identical code.
export function rowSeries(d, r) {
  return { axis: 'row', index: r, key: d.rows[r].key, label: d.rows[r].label,
    unit: d.rows[r].unit, dp: d.rows[r].dp, prefix: d.rows[r].prefix,
    labels: d.cols.map(c => c.label), keys: d.cols.map(c => c.key), values: d.values[r].slice() };
}
export function colSeries(d, c) {
  return { axis: 'col', index: c, key: d.cols[c].key, label: d.cols[c].label,
    unit: null, dp: 0, prefix: null,
    labels: d.rows.map(r => r.label), keys: d.rows.map(r => r.key), values: d.values.map(row => row[c]) };
}

export const seriesTotal = s => s.values.reduce((a, b) => a + b, 0);

// ---- the derived-series layer ----------------------------------------------------------
//
// "Derived columns are first-class series, so relations operate identically on raw or
// derived data." So this returns the same shape rowSeries does, and nothing downstream
// knows the difference. Three operations, which is what Part B's preamble names: the
// product of two rows, the difference of two rows, a row scaled by a stimulus-level factor.

export function derivedSeries(d, spec) {
  const { op } = spec;
  if (op === 'product') {
    const a = rowSeries(d, spec.a), b = rowSeries(d, spec.b);
    return { ...a, axis: 'derived', op, from: [a.key, b.key], key: spec.key ?? `${a.key}x${b.key}`,
      label: spec.label ?? `${a.label} x ${b.label}`, unit: spec.unit ?? null, dp: spec.dp ?? 2,
      prefix: spec.prefix ?? null,
      values: a.values.map((v, i) => v * b.values[i]) };
  }
  if (op === 'difference') {
    const a = rowSeries(d, spec.a), b = rowSeries(d, spec.b);
    return { ...a, axis: 'derived', op, from: [a.key, b.key], key: spec.key ?? `${a.key}-${b.key}`,
      label: spec.label ?? `${a.label} less ${b.label}`, unit: spec.unit ?? a.unit, dp: spec.dp ?? a.dp,
      prefix: spec.prefix ?? a.prefix,
      values: a.values.map((v, i) => v - b.values[i]) };
  }
  if (op === 'scaled') {
    // Per-column factors, which is what a stimulus-level scale is: b01's pack sizes are one
    // factor per flavour, not one factor for the table.
    const a = rowSeries(d, spec.a);
    const f = spec.factors;
    return { ...a, axis: 'derived', op, from: [a.key], key: spec.key ?? `${a.key}*`,
      label: spec.label ?? a.label, unit: spec.unit ?? a.unit, dp: spec.dp ?? a.dp,
      prefix: spec.prefix ?? a.prefix,
      values: a.values.map((v, i) => v * f[i]) };
  }
  throw new Error(`derivedSeries: unknown op ${op}`);
}

// ---- the counterfactual wrapper --------------------------------------------------------
//
// "Perturbs one cell, optionally under a conservation constraint, then evaluates any base
// relation on the modified data. One wrapper multiplies the whole relation inventory."
// Returns a new dataset. Immutable on purpose: b03 needs both the stale and the fresh
// denominator in one item, so the original has to survive the perturbation.

export function counterfactual(d, { r, c, pct, conserve = null }) {
  const values = d.values.map(row => row.slice());
  const before = values[r][c];
  const after = before * (1 + pct / 100);
  values[r][c] = after;
  const out = { ...d, values, perturbed: { r, c, before, after, pct, delta: after - before } };
  if (conserve) {
    // One cell rises, another falls to hold a total constant. The reduction is returned
    // rather than applied, because b04 asks for it as a percentage of the cell it came out
    // of, and applying it would make that cell's original value unreadable.
    out.conserved = { r: conserve.r, c: conserve.c, from: values[conserve.r][conserve.c],
      reduceBy: after - before,
      reducePct: 100 * (after - before) / values[conserve.r][conserve.c] };
  }
  return out;
}

// ---- cell formatting -------------------------------------------------------------------
//
// Cells are display strings by the time they reach a table, formatted here from the row's
// own unit and decimal count. table.js never formats a number, so what the audit page shows
// is what the candidate sees.

export function cellText(row, v) {
  if (row.prefix) return money(v, row.prefix, row.dp);
  const n = groupDigits(v, row.dp);
  return row.unit ? `${n} ${row.unit}` : n;
}

// ---- family builders -------------------------------------------------------------------

const PLACES = [
  { set: 'zoo', noun: 'zoos', unitNoun: 'animals', of: 'Zoo',
    keys: ['Aucten', 'Kemtern', 'Neflem', 'Congtin', 'Filsten'],
    cats: ['Lions', 'Zebras', 'Giraffes', 'Tigers', 'Other'] },
  { set: 'depot', noun: 'depots', unitNoun: 'vehicles', of: 'Depot',
    keys: ['Harlow', 'Ryecroft', 'Denbeigh', 'Ashmore', 'Culverton'],
    cats: ['Vans', 'Flatbeds', 'Tankers', 'Tippers', 'Other'] },
  { set: 'ward', noun: 'wards', unitNoun: 'referrals', of: 'Ward',
    keys: ['Marlow', 'Petrie', 'Osgood', 'Thane', 'Vellacott'],
    cats: ['Cardiology', 'Neurology', 'Oncology', 'Renal', 'Other'] },
];

// regional. Additive along both axes, so a row total, a column total and a grand total are
// all meaningful and all three get printed. Counts are drawn awkward per the spec:
// a candidate must not be able to eyeball a share.
// Five categories, not four. b06 needs five distinct column labels for a label answer set, and
// the dataset is shared, so the column count is a property of the family rather than of the item.
export function regionalDataset(rng, { places = 4, cats = 5 } = {}) {
  const scen = rng.pick(PLACES);
  const placeKeys = rng.shuffle(scen.keys).slice(0, places);
  const catKeys = [...rng.shuffle(scen.cats.slice(0, -1)).slice(0, cats - 1), scen.cats.at(-1)];
  let values;
  for (let i = 0; i < 80; i++) {
    values = placeKeys.map(() => catKeys.map(() => Math.round(awkward(rng, 18, 240, 0))));
    if (distinctGrid(values)) break;
  }
  return makeDataset({
    family: 'regional',
    rows: placeKeys.map(k => ({ key: k, label: `${k} ${scen.of}`, unit: null, dp: 0, additive: true })),
    cols: catKeys.map(k => ({ key: k, label: k })),
    values,
    totals: { row: true, col: true },
    meta: { scenario: scen, unitNoun: scen.unitNoun, placeNoun: scen.noun, catNoun: 'category' },
    caption: `Number of ${scen.unitNoun} recorded at each ${scen.of.toLowerCase()}`,
    text: `The table shows how many ${scen.unitNoun} of each type are recorded at each of the `
        + `${placeKeys.length} ${scen.noun}. Every ${scen.unitNoun.replace(/s$/, '')} is counted `
        + `in exactly one category.`,
  });
}

const RETAIL = [
  { set: 'coffee', unit: 'cups', item: 'coffee', sizes: ['Small', 'Regular', 'Medium', 'Large', 'Extra large'],
    org: 'Bramber Coffee', symbol: '£' },
  { set: 'paint', unit: 'tins', item: 'paint', sizes: ['250ml', '500ml', '1 litre', '2.5 litre', '5 litre'],
    org: 'Halloway Paints', symbol: '£' },
  { set: 'tyre', unit: 'tyres', item: 'tyre', sizes: ['13 inch', '14 inch', '15 inch', '16 inch', '17 inch'],
    org: 'Kirkmoor Tyres', symbol: '£' },
];

// retail. Only the quantity row is additive. price = cost + profit is printed in full,
// exactly as the observed coffee table does, which is what makes b06's "difference of two
// rows" already visible and forces its derived series to be a product instead.
// THE WEIGHTING IS THE BUILDER'S DEFAULT, not something a caller has to remember.
//
// An earlier round put the rank-pair target in b06's `buildSolo`, which only `generate` and `generateAll`
// reach. `session.js` builds a shared stimulus with `makeStimulus({ family, rng })` and no opts, so
// in a real Desk 02 session `want` was null and the weighting never ran. The audit harness calls
// generateAll, so it measured the weighted path and reported b06 at 31% on quantity sold while
// production delivered 72%, which is 3.6x chance and a rank leak. Measured on both paths at n=200.
//
// That is the same failure as an earlier round's c01 unreachability: the audit and the session disagreed
// and the audit was the one being read. It is also exactly what the spec means by verifying
// an independent path rather than the primary one against itself. Defaulting the draw here fixes
// both paths at once and leaves the caller free to override for a fixture.
const RETAIL_RANK_WEIGHTS = {
  '44|22': 0.0002, '34|22': 0.0005, '44|23': 0.0007, '44|32': 0.0007, '34|23': 0.0008,
  '43|22': 0.0008, '43|32': 0.0010, '24|32': 0.0023, '43|24': 0.0037, '34|42': 0.0038,
  '42|23': 0.0043, '24|42': 0.0058, '42|24': 0.1964, '33|24': 0.0495, '24|33': 0.3120,
  '33|42': 0.3409, '42|33': 0.0765,
};
export function drawWeighted(rng, weights, fallback) {
  let r = rng.next();
  for (const [cell, w] of Object.entries(weights)) { r -= w; if (r <= 0) return cell; }
  return fallback;
}

export function retailDataset(rng, { sizes = 5, want = undefined, tries = 40000 } = {}) {
  if (want === undefined) want = drawWeighted(rng, RETAIL_RANK_WEIGHTS, '33|42');
  const scen = rng.pick(RETAIL);
  const sizeKeys = scen.sizes.slice(0, sizes);
  const amax = arr => arr.indexOf(Math.max(...arr));
  const amin = arr => arr.indexOf(Math.min(...arr));
  const rankOf = (arr, i) => [...arr].sort((a, b) => a - b).indexOf(arr[i]) + 1;

  // Two changes, and the first is a defect fix rather than a feature.
  //
  // The loop used to run 600 attempts and then FALL THROUGH with whatever it had, so a table
  // violating the family invariant was returned silently and b06 rejected it downstream at
  // 24.5% of its attempts while b02 and b08 accepted it without looking. It now returns null
  // and every caller checks, which is what c01's silent unreachability taught.
  //
  // Second, the quantity row is redrawn inside the loop rather than once outside it. The
  // search below needs both rows free, because it is aiming at a rank PAIR and fixing one row
  // halves the space it can reach.
  let sold = [], price = [], cost = [], profit = [];
  for (let attempt = 0; attempt < tries; attempt++) {
    // Quantity sold, awkward and not monotone in size, so the largest is not the busiest.
    sold = sizeKeys.map(() => Math.round(awkward(rng, 240, 1900, 0)));
    if (!allDistinct(sold)) continue;
    // Price rises with size, so it is distinct by construction. Cost is drawn as a fraction of
    // price and can tie, and so can the profit it implies, so both are redrawn until clean:
    // b06's derived series is quantity x profit, and a tie in the profit row makes its argmax
    // ambiguous.
    price = []; cost = [];
    let p = roundTo(rng.float(1.55, 2.35), 2);
    for (let i = 0; i < sizeKeys.length; i++) {
      price.push(roundTo(p, 2));
      cost.push(roundTo(p * rng.float(0.32, 0.82), 2));
      p += rng.float(0.35, 0.85);
    }
    profit = price.map((v, i) => roundTo(v - cost[i], 2));
    if (!allDistinct(cost) || !allDistinct(profit)) continue;
    if (profit.some(v => v <= 0.1)) continue;
    // A FAMILY-LEVEL INVARIANT, established here rather than in b06. b06 needs the argmax of
    // quantity x profit to be the argmax of neither input row, or the item is answered by reading
    // one column. Drawing the table and then testing rejected 98.9% of attempts, because with
    // five columns the product's extremum is usually driven by one of the two inputs. It is a
    // property of the shape rather than of the item, and b02 and b08 do not care either way, so
    // the builder guarantees it. Same argument as an earlier round's constructed a12 and a14 parameters.
    const takings = sold.map((v, i) => v * profit[i]);
    if (amax(takings) === amax(sold) || amax(takings) === amax(profit)) continue;
    if (amin(takings) === amin(sold) || amin(takings) === amin(profit)) continue;
    if (amax(sold) === amax(profit) || amin(sold) === amin(profit)) continue;
    if (amin(takings) === amax(sold) || amin(takings) === amax(profit)) continue;
    if (amax(takings) === amin(sold) || amax(takings) === amin(profit)) continue;
    const st = [...takings].sort((x, y) => y - x);
    if (Math.abs(st[0] - st[1]) < 0.02 * st[0]) continue;

    // Carry-in 2. The rank pair the winner and the loser occupy on the two input
    // rows, drawn by the caller and realised here. Barring the winner from being either input's
    // argmax leaves it high but not highest on both, and rank 4 of 5 is exactly that: measured
    // at 70% on quantity and 77% on profit for the argmax half, mirrored at 78% and 72% on the
    // argmin half. Six of the sixteen interior pairs are reachable on each half and seventeen of
    // the thirty-six joint cells, so the target is a joint cell and the search realises it.
    if (want) {
      const w = amax(takings), l = amin(takings);
      const cell = `${rankOf(sold, w)}${rankOf(profit, w)}|${rankOf(sold, l)}${rankOf(profit, l)}`;
      if (cell !== want) continue;
    }
    return finishRetail(scen, sizeKeys, sold, price, cost, profit);
  }
  return null;
}

function finishRetail(scen, sizeKeys, sold, price, cost, profit) {
  return makeDataset({
    family: 'retail',
    rows: [
      { key: 'sold',   label: `${scen.unit.replace(/^./, ch => ch.toUpperCase())} sold`, unit: null, dp: 0, additive: true },
      { key: 'price',  label: 'Price each',  unit: null, dp: 2, additive: false, prefix: scen.symbol },
      { key: 'cost',   label: 'Cost each',   unit: null, dp: 2, additive: false, prefix: scen.symbol },
      { key: 'profit', label: 'Profit each', unit: null, dp: 2, additive: false, prefix: scen.symbol },
    ],
    cols: sizeKeys.map(k => ({ key: k, label: k })),
    values: [sold, price, cost, profit],
    totals: { row: false, col: false },
    meta: { scenario: scen, symbol: scen.symbol, unitNoun: scen.unit, org: scen.org },
    caption: `${scen.org}, last full year`,
    text: `${scen.org} sells ${scen.item} in ${sizeKeys.length} sizes. The table shows how many of `
        + `each size were sold last year, together with the price, the cost and the profit on a `
        + `single ${scen.item === 'coffee' ? 'cup' : 'unit'}.`,
  });
}

const NUTRITION = [
  { set: 'crisps', org: 'Tolliver Snacks', item: 'crisps', pack: 'packet', packPlural: 'packets',
    cols: ['Ready Salted', 'BBQ', 'Pickled Onion', 'Cheese & Chive', 'Smoked Paprika'] },
  { set: 'cereal', org: 'Ferngate Cereals', item: 'cereal', pack: 'portion', packPlural: 'portions',
    cols: ['Original', 'Honey Nut', 'Berry Crunch', 'Malted Wheat', 'Bran Flakes'] },
];

// The four nutrients. Energy is an integer multiple of 20 per 100g so that every legal pack
// factor gives a clean answer; the other three are one decimal place. Reference amounts are
// the printed daily figures b05 measures a shortfall against.
const NUTRIENTS = [
  { key: 'energy', label: 'Energy',        unit: 'kJ', dp: 0, ref: [8000, 9000, 10000] },
  { key: 'fat',    label: 'Fat',           unit: 'g',  dp: 1, ref: [62, 70, 78] },
  { key: 'fibre',  label: 'Fibre',         unit: 'g',  dp: 1, ref: [24, 28, 30] },
  { key: 'salt',   label: 'Salt',          unit: 'g',  dp: 1, ref: [5, 6, 7] },
];

// Pack sizes. The archetype spec: 25 to 100, "so scale factors are not all 1", and "at least one
// pack size is not a round fraction of 100". 30, 40, 60 and 80 are the ones that are not.
const PACK_SIZES = [25, 30, 40, 50, 60, 75, 80, 100];

export function nutritionDataset(rng, { cols = 4, nutrients = 4 } = {}) {
  const scen = rng.pick(NUTRITION);
  const colKeys = rng.shuffle(scen.cols).slice(0, cols);
  const rows = NUTRIENTS.slice(0, nutrients);
  const drawRow = n => colKeys.map(() => {
    if (n.key === 'energy') {
      let v;
      do { v = 20 * rng.int(66, 118); } while (v % 100 === 0);   // awkward, and clean under every factor
      return v;
    }
    const band = { fat: [8, 38], fibre: [1.8, 8.4], salt: [0.4, 2.6] }[n.key];
    return roundTo(rng.float(band[0], band[1]), 1);
  });
  const values = rows.map(n => {
    let v;
    for (let i = 0; i < 80; i++) { v = drawRow(n); if (allDistinct(v)) break; }
    return v;
  });
  // One pack size per flavour, all different, at least one not a round fraction of 100, and
  // never all 100 or the whole archetype collapses.
  let packs;
  for (let i = 0; i < 60; i++) {
    packs = rng.shuffle(PACK_SIZES).slice(0, colKeys.length);
    const awkwardOne = packs.some(p => ![25, 50, 100].includes(p));
    const notAllFull = packs.filter(p => p !== 100).length >= colKeys.length - 1;
    if (awkwardOne && notAllFull) break;
  }
  const refs = Object.fromEntries(rows.map(n => [n.key, rng.pick(n.ref)]));
  // b05's Cannot Say variant needs a nutrient with no printed reference. One row is chosen
  // to have none, which is the only construction that makes the verdict genuinely correct
  // rather than a distractor dressed as one.
  const unreferenced = rng.pick(rows.slice(1)).key;
  delete refs[unreferenced];

  return makeDataset({
    family: 'nutrition',
    rows: rows.map(n => ({ key: n.key, label: n.label, unit: n.unit, dp: n.dp, additive: false })),
    cols: colKeys.map(k => ({ key: k, label: k })),
    values,
    totals: { row: false, col: false },
    meta: {
      scenario: scen, packs, refs, unreferenced,
      packRowLabel: `Pack size`, packUnit: 'g',
      pack: scen.pack, packPlural: scen.packPlural,
    },
    caption: `${scen.org}: nutritional content per 100 g`,
    text: `Every figure in the table is the amount contained in 100 g of that variety. `
        + `The bottom row gives the weight of one ${scen.pack} as sold.`,
  });
}


// ---- civic -----------------------------------------------------------------------------
//
// Entities across two periods plus a population column, serving d13 (spend per head)
// and d18 (absolute against relative growth). One family rather than two, because d13 needs
// totals with populations and d18 needs the same entities across two periods.
//
// SIX ENTITIES, NOT FIVE, AND THE REASON IS MEASURED. d13's answer is the argmax of spend over
// population, and it is barred from being the argmax or argmin of either column, so its rank pair
// is interior on both. Enumerated over 200,000 draws at five entities, the population rank can
// only ever be 2 or 3: the winner has the highest spend per head, so a large population would make
// its spend the largest too, which is barred. Two reachable ranks put the flattest achievable
// marginal at 50% against a 20% chance, which is 2.50x and above the leak band whatever the
// weighting does. That is c02's wall exactly. At six entities the population rank reaches 2, 3 and
// 4, so the floor is 33% against 16.7%, which is 2.00x and inside the concentrated band. Seven
// entities would reach 25% and 1.75x at the cost of a seventh division inside 45 seconds, and the
// figures are in test/probes/s6d13ranks.mjs if that trade is ever wanted.
//
// Widening the ranges does not help and a10's generalisation says why: spend is population times
// spend-per-head, so the pin lands on the factor with the wider relative range. Narrowing
// population from a 5.4x range to 1.5x and widening spend-per-head to 3.8x moved the
// largest-spend-equals-largest-population clash from 75% to 63% and left the reachable population
// ranks at two. The lever is the entity count, not the ranges.
//
// The values are drawn and then the PAIRING of populations to spend-per-head figures is enumerated,
// which is a10's method: 720 pairings a draw, so a single draw usually contains several that hit
// the target cell. The early period is a free column given the late one, since it is the late
// figure divided by a per-entity growth factor, so d13's control over (population, late) and d18's
// over (early, late) do not compete for the same freedom.
const CIVIC = [
  { noun: 'councils', one: 'council', of: 'Council', spendNoun: 'service spending', unitNoun: 'residents', oneUnit: 'resident',
    keys: ['Ashwell', 'Bramcote', 'Calderfield', 'Dunmarsh', 'Easthaven', 'Fenwick', 'Garrowby', 'Hollingbury'],
    symbol: '\u00a3' },
  { noun: 'health boards', one: 'health board', of: 'Board', spendNoun: 'prescribing spend', unitNoun: 'patients', oneUnit: 'patient',
    keys: ['Alderbay', 'Brackmoor', 'Cranstead', 'Dellwick', 'Eskmouth', 'Fairholt', 'Glenhurst', 'Hartsmere'],
    symbol: '\u00a3' },
  { noun: 'transport authorities', one: 'transport authority', of: 'Authority', spendNoun: 'capital spending', unitNoun: 'residents', oneUnit: 'resident',
    keys: ['Ardwick', 'Belmarch', 'Colthorpe', 'Denhollow', 'Everton', 'Frayling', 'Gorsemere', 'Havenscroft'],
    symbol: '\u00a3' },
];

const permutations = n => {
  const out = [], idx = [...Array(n).keys()];
  const walk = (arr, rest) => {
    if (!rest.length) { out.push(arr); return; }
    rest.forEach((v, i) => walk([...arr, v], rest.filter((_, j) => j !== i)));
  };
  walk([], idx);
  return out;
};
const PERM = { 6: permutations(6), 7: permutations(7) };

// FLAVOUR, because d13 and d18 CANNOT SHARE A TABLE and that is measured rather than assumed.
// Serving both from one dataset was the plan and the economy was sound a priori: d13 needs totals
// with populations, d18 needs the same entities across two periods, so one family looked like it
// covered both. The geometry refuses it. Each archetype needs its own five-role bijection on the
// same rows, and satisfying d18's pushed d13's answer to rank 5 of 7 on the START column in 46% of
// items, 3.20x chance, on a column d13's answer has no business correlating with. Measured at seven
// entities with both sets of conditions live; with d13's alone the same column reads 1.63x.
//
// This is c02's relocation failure in a new place: constraining one thing moved the pin onto
// another rather than removing it. So the flavour guarantees ONE archetype's conditions and the
// other rides as an ordinary reader of the table. Two flavours of one builder rather than two
// builders, since the columns, scenarios and rendering are shared.
// One finish for both flavours, so the columns, scenarios, caption and rendering cannot drift
// between them. Same rule as lib/table.js: one spec, several producers, never parallel copies.
// One finish, so the columns, scenarios, caption and rendering cannot drift between the readers.
// Same rule as lib/table.js: one spec, several producers, never parallel copies.
function finishCivic(scen, keys, pop, early, late, percap, d18, index) {
  const [y1, ym, y2] = [2019, 2022, 2024];
  return makeDataset({
    family: 'civic',
    rows: [
      { key: 'pop', label: 'Population (thousands)', unit: null, dp: 0, additive: false },
      { key: 'early', label: `${scen.spendNoun[0].toUpperCase()}${scen.spendNoun.slice(1)} ${y1} (${scen.symbol}m)`, unit: null, dp: 1, additive: false },
      { key: 'late', label: `${scen.spendNoun[0].toUpperCase()}${scen.spendNoun.slice(1)} ${y2} (${scen.symbol}m)`, unit: null, dp: 1, additive: false },
    ],
    cols: keys.map(k => ({ key: k, label: k })),
    values: [pop, early, late],
    totals: { row: false, col: false },
    meta: {
      scenario: scen, rowHeading: scen.of, years: [y1, ym, y2], symbol: scen.symbol,
      unitNoun: scen.unitNoun, noun: scen.noun, one: scen.one, oneUnit: scen.oneUnit,
      roles: percap, ranks: percap.ranks, growth: d18, index,
      // makeDataset carries no `note` field, so the printed index travels in meta and
      // datasetTable renders it. Passing `note` to makeDataset dropped it silently and the
      // rendered table read "undefined" until a smoke test showed it.
      note: `Price index for ${scen.spendNoun}: ${y1} = 100, ${ym} = ${index.mid}, ${y2} = ${index.late}.`,
      perHead: late.map((v, i) => v / pop[i]),
    },
    caption: `${scen.spendNoun[0].toUpperCase()}${scen.spendNoun.slice(1)} and population, by ${scen.of.toLowerCase()}`,
    text: `The table shows ${scen.spendNoun} in ${y1} and ${y2} for ${keys.length} ${scen.noun}, `
        + `together with the ${scen.oneUnit} population each one serves. `
        + `Population is unchanged between the two years.`,
  });
}

// STAGE ONE. The two spending years, constructed so that d18's roles and rank targets are realised.
//
// The draw order is the whole point, and the obvious order is the wrong one. Draw the EARLY column and the
// growth factors separately, and then the relative growth of an entity is exactly its growth
// factor, so the relative winner IS the entity holding the largest factor and its rank on the early
// column is fixed by choosing which early value receives that factor. No search at all on the
// marginal that was at 3.62x. The absolute winner is the argmax of early times factor, a
// product-argmax controllable by enumerating the remaining pairings, which is a10's method on a
// space small enough to exhaust.
//
// FOUR ROLES, NOT FIVE. `headline-metric` on the largest STARTING value is dropped, because it is
// the only one of d18's four that does not correspond to a coherent mistake: confusing level with
// growth gives the largest final value, and a small base genuinely does inflate relative growth,
// which is what makes `checked-extremes-only` on the smallest start real. Nobody picks the largest
// start for a reason. Measured at seven entities, dropping it moves the role separation from 1.23%
// to 8.08% and the start-column floor from 33% to 25%, so 1.75x rather than 2.33x. That is better
// than five roles at eight entities, which reached 2.03x, and it keeps the table inside the width
// the observed papers actually use. The fifth option becomes the leftover entity, labelled from its
// real rank on the asked series the way a10 and a14 label theirs.
//
// THE JOINT CELL IS DRAWN FROM A SOLVED WEIGHTING. Forced-draw measurement put six of nine cells
// reachable at five roles, in a10's triangle, with `rel < abs` strictly: the relative winner is the
// largest growth factor and the absolute winner is the argmax of start times factor, so for the two
// to differ the relative winner must sit LOWER on the start column. Drawing the two marginals
// independently cannot flatten them, because the triangle couples them. Minimising the worse
// marginal has an exact solution and it is the DIAGONAL, equal weight per cell, which makes both
// marginals flat by construction. The residual is that the absolute winner sits exactly one start
// rank above the relative winner in every item; it is not usable, since identifying either winner
// is the item.
function civicGrowth(rng, places, forceRel = null, forceAbs = null) {
  const rankOf = (arr, i) => [...arr].sort((a, b) => a - b).indexOf(arr[i]) + 1;
  const amax = a => a.indexOf(Math.max(...a));
  const diagonal = [];
  for (let r = 2; r + 1 <= places - 1; r++) diagonal.push([r, r + 1]);
  // A RESIDUAL, RECORDED RATHER THAN TUNED AWAY. The absolute winner is barred from being the
  // largest end, so it lands immediately below it: rank 6 of 7 in 58% of items, 4.02x chance. That
  // is a10's original finding in a new costume, the winner pinned to the neighbour of the extremum
  // it may not be, and here it is forced by algebra: the absolute rise is start times factor and
  // the end is start times one-plus-factor, so a maximal rise implies a large end.
  //
  // Drawing the end rank as a third target was MEASURED AND REJECTED. It cannot be drawn freely,
  // because an end rank below the start rank is impossible, and clamping it correlates the two
  // targets: the relative winner's start column went from 2.26x to 3.71x and the absolute end
  // barely moved, 4.02x to 3.89x. Every marginal got worse. That is c02's oscillation and the same
  // stopping rule applies.
  //
  // Removing it needs `headline-metric` on the largest END value to stop being a role, which is an
  // The archetype spec change and not obviously the right one: confusing level with growth is a coherent
  // mistake and it is the strongest of d18's remaining three.
  const rest = permutations(places - 1);

  for (let attempt = 0; attempt < 80; attempt++) {
    const cell = diagonal[Math.floor(rng.next() * diagonal.length)];
    const wantRel = forceRel ?? cell[0];
    const wantAbs = forceAbs ?? cell[1];

    const early = [];
    for (let i = 0; i < places; i++) early.push(Math.round(awkward(rng, 60, 300, 1) * 10) / 10);
    early.sort((a, b) => a - b);
    if (!allDistinct(early) || early.some((v, i) => i && v / early[i - 1] < 1.03)) continue;

    const g = [];
    for (let i = 0; i < places; i++) g.push(Math.round(rng.float(2, 62)) / 100);
    g.sort((a, b) => b - a);
    if (!allDistinct(g) || g[0] - g[1] < 0.03) continue;

    const slots = [...Array(places).keys()].filter(k => k !== wantRel - 1);
    for (const perm of rest) {
      const factor = new Array(places);
      factor[wantRel - 1] = g[0];
      perm.forEach((pi, j) => { factor[slots[j]] = g[pi + 1]; });

      const late = early.map((v, i) => Math.round(v * (1 + factor[i]) * 10) / 10);
      if (!allDistinct(late)) continue;
      const abs = late.map((v, i) => Math.round((v - early[i]) * 10) / 10);
      const rel = late.map((v, i) => (v - early[i]) / early[i]);
      if (!allDistinct(abs) || !allDistinct(rel.map(v => v.toFixed(9))) || abs.some(v => v <= 0)) continue;

      const Wr = amax(rel), Wa = amax(abs), mL = amax(late), nE = 0;
      if (rankOf(early, Wa) !== wantAbs) continue;
      if (new Set([Wr, Wa, mL, nE]).size !== 4) continue;
      const sr = [...rel].sort((a, b) => b - a), sa = [...abs].sort((a, b) => b - a);
      if (sr[0] < 1.02 * sr[1] || sa[0] < 1.02 * sa[1]) continue;
      return { early, late, abs, rel,
        d18: { relWinner: Wr, absWinner: Wa, topLate: mL, lowEarly: nE,
          relRank: [wantRel, rankOf(late, Wr)], absRank: [wantAbs, rankOf(late, Wa)] } };
    }
  }
  return null;
}

// STAGE TWO. Population, chosen so that d13's roles and rank pair are realised on a late column
// that is already fixed.
//
// THIS IS WHY ONE TABLE SERVES BOTH. The earlier conclusion that it could not was an artifact of
// the draw order, again. Drawing population first and deriving spending
// from it coupled d13's control to d18's, and adding d18's conditions pushed d13's answer to 3.20x
// on the start column. With the spending years fixed first, population is a FREE column: d18 never
// reads it, so choosing it can only affect d13. Two stages, no competition.
// Compensated against the realised mix at n=1000, not against the per-target success rate, because
// the population stage sits downstream of the growth stage and its failures are not independent of
// it. Weights of 26.8 / 24.4 / 24.4 / 24.4 delivered 36 / 27 / 24 / 13, which is 2.51x with a 95%
// span of 2.30 to 2.72 and so genuinely over the 2.40x bar rather than near it. Scaled by
// target over realised.
const CIVIC_POP_WEIGHTS = { 2: 0.1630, 3: 0.2000, 4: 0.2240, 5: 0.4130 };
function civicPopulation(rng, places, late, tries = 240) {
  const rankOf = (arr, i) => [...arr].sort((a, b) => a - b).indexOf(arr[i]) + 1;
  const amax = a => a.indexOf(Math.max(...a));
  const amin = a => a.indexOf(Math.min(...a));
  const spendRank = rankOf(late, amax(late));

  let r = rng.next(), wantPop = 3;
  for (const [k, w] of Object.entries(CIVIC_POP_WEIGHTS)) { r -= w; if (r <= 0) { wantPop = Number(k); break; } }

  for (let t = 0; t < tries; t++) {
    // Per head drawn wide and population derived, so no figure is round and the population column
    // does not track the spending columns.
    const per = [];
    for (let i = 0; i < places; i++) per.push(Math.round(rng.float(380, 1100)));
    if (!allDistinct(per)) continue;
    const pop = late.map((v, i) => Math.round(v * 1000 / per[i]));
    if (!allDistinct(pop) || pop.some(v => v < 60 || v > 900)) continue;
    const actual = late.map((v, i) => v / pop[i]);
    if (!allDistinct(actual.map(v => v.toFixed(9)))) continue;

    const W = amax(actual), A = amax(late), B = amax(pop), C = amin(pop), D = amin(actual);
    const rS = rankOf(late, W), rP = rankOf(pop, W);
    if (rS === 1 || rS === places || rP === 1 || rP === places) continue;
    if (rP !== wantPop) continue;
    // Five roles onto five distinct entities, because d13's option set is five of the labels. The
    // clash that dominates is largest-spend equals largest-population.
    if (new Set([W, A, B, C, D]).size !== 5) continue;
    // A BAND, NOT A FLOOR. The archetype spec gives only "at least 2% of the winner", and unbounded the
    // margin ran to 68% with a median of 6.8%, which is resolvable by eye and defeats the item.
    // a10 states its margin as a band for exactly this reason.
    const sorted = [...actual].sort((a, b) => b - a);
    if (sorted[0] < 1.02 * sorted[1] || sorted[0] > 1.12 * sorted[1]) continue;
    return { pop, percap: { winner: W, topSpend: A, topPop: B, lowPop: C, lowPerHead: D,
      ranks: { spend: rS, pop: rP } } };
  }
  return null;
}

// ONE FAMILY, THREE READERS, and the shared ruling now delivers what it was for. A civic table
// serves d13 on population against the later year, d18's matched pair on the two years, and d12 on
// the printed index, which is four to five questions off one stimulus and inside the 3-to-7 range.
// Collapsing the two flavours also removes a whole class of divergence: there is one construction,
// so there is nothing for the two readers to disagree about.
export function civicDataset(rng, { places = 7, wantRel = null, wantAbs = null } = {}) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const scen = rng.pick(CIVIC);
    const keys = rng.shuffle(scen.keys).slice(0, places);
    if (keys.length !== places) return null;      // a scenario short of names, not a draw failure

    const grown = civicGrowth(rng, places, wantRel, wantAbs);
    if (!grown) continue;
    const popped = civicPopulation(rng, places, grown.late);
    if (!popped) continue;

    // The index band is set by arithmetic, not taste. d12's wrong-operation option subtracts the
    // inflation rate as a percentage instead of deflating, and the gap to the answer is exactly
    // x squared over ten thousand where x is the index's distance from 100, so clearing the 2%
    // minimum option gap needs |index - 100| >= 14.15. Same algebra as d05's t squared.
    const late = 115 + Math.floor(rng.next() * 14);            // 115 to 128
    const mid = 100 + Math.floor((late - 100) * rng.float(0.35, 0.65));
    if (Math.abs(late - 100) < 15 || mid <= 100 || mid >= late) continue;

    // Entity order is shuffled against the sorted early column, so the table does not present its
    // rows in start-column order and position cannot proxy for rank.
    const order = rng.shuffle([...Array(places).keys()]);
    const pick = arr => order.map(i => arr[i]);
    const where = i => order.indexOf(i);
    const remap = o => Object.fromEntries(Object.entries(o).map(([k, v]) =>
      [k, typeof v === 'number' ? where(v) : v]));

    return finishCivic(scen, keys, pick(popped.pop), pick(grown.early), pick(grown.late),
      { ...remap(popped.percap), ranks: popped.percap.ranks },
      { ...remap(grown.d18), relRank: grown.d18.relRank, absRank: grown.d18.absRank },
      { mid, late });
  }
  return null;
}

export function buildDataset(family, rng, opts = {}) {
  if (family === 'regional')  return regionalDataset(rng, opts);
  if (family === 'retail')    return retailDataset(rng, opts);
  if (family === 'nutrition') return nutritionDataset(rng, opts);
  if (family === 'civic')     return civicDataset(rng, opts);
  throw new Error(`buildDataset: unknown family ${family}`);
}
