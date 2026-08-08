// MEASURED PRECISION. How many significant figures an item actually requires.
//
// The number is DERIVED FROM THE OPTION SET, never authored. An authored field would drift the
// moment a distractor's arithmetic changed, and the whole point of the figure is that it describes
// the item in front of the candidate rather than the archetype's intent.
//
// Why it exists. 90.8% of numeric items in this library separate the answer from every distractor at
// two significant figures and only 40.1% at one, measured over 2,280 items. That geometry is close
// to ideal: crude estimation fails, disciplined two-figure estimation wins, which is the real skill
// on a test that permits a calculator and prices every item at 83 or 45 seconds. But every worked
// solution renders the exact chain to four decimal places, so the feedback layer demonstrates the
// slow method on items built to reward the fast one.
//
// The correction this makes to constants.js. `tightNeighbourWithin` is documented there as existing
// because "an option set whose nearest neighbour is 3.8x away is answerable by estimation, which
// defeats the point of the item". That reasoning holds for CRUDE estimation and is why the invariant
// stays. It does not follow that estimation is an exploit: it is the standard recommended method for
// these tests, and the tight-neighbour rule is what makes the disciplined version necessary rather
// than optional. Both statements are true at once and this module measures which regime an item is
// in rather than assuming.

// Round to k significant figures. Guarded at zero, where the log is undefined.
export function sigFig(value, k) {
  if (!Number.isFinite(value) || value === 0) return 0;
  const m = Math.pow(10, k - 1 - Math.floor(Math.log10(Math.abs(value))));
  return Math.round(value * m) / m;
}

// Two values are SEPARATED at k figures when rounding both to k figures leaves them distinct.
// The tolerance is relative, because sigFig itself introduces representation error: rounding
// 0.1 + 0.2 style artefacts to two figures can leave a 1e-17 residue that a strict !== reads as
// a separation. Scaled to the larger magnitude so it behaves the same at 0.6% and at 340,000.
export function separated(a, b, k) {
  const ra = sigFig(a, k), rb = sigFig(b, k);
  return Math.abs(ra - rb) > 1e-9 * Math.max(1, Math.abs(ra), Math.abs(rb));
}

// The fewest significant figures at which the answer is separated from EVERY other option, or null
// where no precision up to `max` separates them. Null is not a defect: it means two options display
// the same rounded value at every tested precision, which for a fraction or ratio type is ordinary.
export function requiredFigures(values, answer, max = 4) {
  const others = values.filter(v => v !== answer);
  if (!others.length) return 1;
  for (let k = 1; k <= max; k++) {
    if (others.every(v => separated(v, answer, k))) return k;
  }
  return null;
}

// The item-level entry point. Returns null for anything without a full set of finite numeric
// options, which is every label, month and verdict archetype and is not an error.
export function precisionOf(item) {
  const vals = (item?.options ?? []).map(o => o.value);
  if (!vals.length || !vals.every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  const answer = item.correct?.value;
  if (typeof answer !== 'number' || !Number.isFinite(answer)) return null;
  const figures = requiredFigures(vals, answer);
  return {
    figures,
    resolvableAt1: figures === 1,
    resolvableAt2: figures !== null && figures <= 2,
    // The nearest neighbour as a ratio, which is what decides whether the last digit matters.
    // Reported here as well so the feedback line and the audit read the same number.
    nearest: nearestRatio(vals, answer),
  };
}

function nearestRatio(vals, answer) {
  let best = Infinity;
  for (const v of vals) {
    if (v === answer) continue;
    if (answer === 0 || v === 0) continue;
    const r = Math.abs(v) > Math.abs(answer) ? Math.abs(v / answer) : Math.abs(answer / v);
    best = Math.min(best, r);
  }
  return Number.isFinite(best) ? best : null;
}

// THE ESTIMATION ROUTE. An earlier round.
//
// An archetype may export `estimate(params)` returning `{ value, text }`: the approximate answer
// from rounded inputs, and the one-line arithmetic that got there. This function turns that into the
// line the feedback screen shows, including which option the estimate lands on, which is the part
// that makes it a method rather than a remark.
//
// WHY THIS IS PER ARCHETYPE AND NOT GENERIC. `workings.steps` are formatted strings and `params`
// carries no operation graph, so nothing here can round the inputs and re-evaluate without the
// archetype's own arithmetic. One archetype in the library exports `formula(params)`, so that route
// was not available either. Authoring it everywhere would also be wrong: on an item where estimation
// cannot separate the options, a route teaches the losing method, so `estimate` is authored only
// where the measured 1sf rate says estimation wins and `precisionStatement` carries the rest.
//
// LANDS-ON IS DERIVED, NEVER ASSERTED. The nearest option to the estimate is computed here rather
// than declared by the archetype, so an `estimate` whose arithmetic drifts from `generate`'s shows
// up as a route that lands on a distractor, which the audit sweep then reports.
// THE SIGNATURE TAKES `values` AS WELL AS `params`, and the reason is worth recording. On a Desk 02
// archetype the parameter draw holds INDICES into the stimulus, not quantities: b04's `cA` and `cB`
// are column numbers, so `estimate(params)` alone computed a route from 1 and 2 and landed on the
// answer in 17% of items. The quantities live in `item.values`, which is where the worked solution
// already reads them from. Widening the signature is additive and keeps `params` doing the one job
// 10.1 gives it, which is letting the audit bucket on the draw, rather than turning it into a
// grab-bag of every number a route might want.
export function estimationRoute(item, archetype) {
  if (typeof archetype?.estimate !== 'function' || !item?.params) return null;
  let out = null;
  try { out = archetype.estimate(item.params, item.values ?? {}); } catch { return null; }
  if (!out || !Number.isFinite(out.value)) return null;
  const opts = (item.options ?? []).filter(o => typeof o.value === 'number' && Number.isFinite(o.value));
  if (!opts.length) return null;
  let landsOn = opts[0];
  for (const o of opts) {
    if (Math.abs(o.value - out.value) < Math.abs(landsOn.value - out.value)) landsOn = o;
  }
  return {
    value: out.value,
    text: out.text,
    landsOn,
    correct: landsOn.role === 'correct',
  };
}

// The sentence shown on the feedback screen. Deliberately three regimes rather than a number, and
// deliberately prescriptive: the candidate needs to know which method to reach for next time, and
// "2 significant figures" is not that instruction.
export function precisionStatement(item) {
  const p = precisionOf(item);
  if (!p) return null;
  if (p.figures === 1) {
    return 'One significant figure resolves this. Estimate, pick, move on: computing it exactly '
      + 'is time spent for no marks.';
  }
  if (p.figures === 2) {
    return 'Two significant figures resolve this. Estimate to two figures to eliminate, then '
      + 'compute only if two options survive.';
  }
  return 'This turns on the last digit. Estimation will not separate the options, so set the '
    + 'expression up carefully and compute it once.';
}

// Rounding shorthands for archetype `estimate` functions. Exported rather than redefined per module
// so that every route rounds the same way, and so a change to sigFig cannot leave thirteen archetypes
// disagreeing with the audit about what one significant figure means.
export const sig1 = v => sigFig(v, 1);
export const sig2 = v => sigFig(v, 2);
