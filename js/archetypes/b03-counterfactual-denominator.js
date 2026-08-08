import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { makeStimulus, stimulusFor } from '../lib/stimulus.js';
import { rowTotal, colTotal, counterfactual } from '../lib/dataset.js';
import { roundTo, groupDigits } from '../lib/money.js';

// b03 - Counterfactual that changes the denominator
//
// Perturbing a cell also changes the total it belongs to, so the denominator moves. The whole
// item is whether the candidate propagates the change.
//
// The archetype spec's FOUR DISTRACTORS CONTAIN A DUPLICATE. It names both `stale-denominator` ("old
// denominator used") and `ignored-counterfactual` ("perturbation ignored"). With the numerator
// being a cell the perturbation never touched, those are the same arithmetic and the same
// number: otherCell / oldTotal. One of the four had to be replaced, and the replacement is
// `sign-flip`, the perturbation applied in the wrong direction, which is a distinct value and a
// mistake a candidate actually makes under time. Recorded rather than patched silently.

export function formula({ other, oldTotal, delta }) {
  const newTotal = oldTotal + delta;
  return { newTotal, value: 100 * other / newTotal, stale: 100 * other / oldTotal };
}

const PCTS = [20, 25, 27, 30, 40, 50, 60];

export default {
  id: 'b03',
  name: 'Counterfactual that changes the denominator',
  group: 'comparison',
  desks: [2],
  families: ['regional'],
  tiers: ['standard'],
  stimulus: 'table',
  answerType: 'percentage',
  targetSeconds: 45,
  slotsPerStimulus: [1, 2],

  // The stem says increased or reduced, so the perturbation direction is visible
  variants: { key: 'direction', visible: true },

  constraints: [
    'the answer differs from the stale-denominator value by at least 2 percentage points, so '
      + 'that distractor is live rather than decorative',
    'the answer is between 3 and 60 per cent, so no option is eliminable on plausibility',
    'the perturbed cell stays positive and below three times the largest cell in the table',
    'all four distractors distinct from the answer and from each other',
  ],

  errorTypes: ['stale-denominator', 'wrong-cell', 'wrong-axis', 'sign-flip'],

  formulaText: 'other cell / (row total + the change to the perturbed cell) x 100',

  formula,

  build({ stimulus, rng, tier, forced = null, diag = null }) {
    const f = forced ?? {};
    const d = stimulus.dataset;
    const nCols = d.cols.length;
    const biggest = Math.max(...d.values.flat());

    const candidates = [];
    for (let r = 0; r < d.rows.length; r++) {
      for (let c = 0; c < nCols; c++) {
        for (let o = 0; o < nCols; o++) {
          if (o === c) continue;
          for (const pct of PCTS) {
            for (const direction of ['increase', 'reduce']) {
              const signed = direction === 'increase' ? pct : -pct;
              const delta = d.values[r][c] * signed / 100;
              if (d.values[r][c] + delta <= 0 || d.values[r][c] + delta > 3 * biggest) continue;
              const D = formula({ other: d.values[r][o], oldTotal: rowTotal(d, r), delta });
              if (Math.abs(D.value - D.stale) < 2) continue;
              if (D.value < 3 || D.value > 60) continue;
              candidates.push({ r, c, o, pct, direction, delta, D });
            }
          }
        }
      }
    }
    if (!candidates.length) return reject(diag, 'no-candidate-with-live-stale');

    let firstFailure = null;
    for (const cand of (f.candidate ? [f.candidate] : rng.shuffle(candidates)).slice(0, 14)) {
      const { r, c, o, pct, direction, delta, D } = cand;
      // Rounded at the display layer. 218 x 0.40 evaluates to 87.19999999999999 in binary floating
      // point, and that string reached both the audit's Values line and the app's worked solution.
      // The answer is computed from the unrounded value; only what is printed is rounded.
      const perturbedRaw = d.values[r][c] + delta;
      const perturbed = roundTo(perturbedRaw, 2);
      const wrongCell = 100 * perturbed / D.newTotal;
      const wrongAxis = 100 * d.values[r][o] / colTotal(d, o);
      const flipped   = 100 * d.values[r][o] / (rowTotal(d, r) - delta);
      const verb = direction === 'increase' ? 'increased' : 'reduced';
      let options;
      try {
        options = assemble({
          correct: { value: D.value },
          distractors: [
            { value: D.stale, errorType: 'stale-denominator',
              note: `used the original ${d.rows[r].label} total of ${rowTotal(d, r)}, so the change never reached the denominator` },
            { value: wrongCell, errorType: 'wrong-cell',
              note: `took the perturbed ${d.cols[c].label} figure as the numerator instead of ${d.cols[o].label}` },
            { value: wrongAxis, errorType: 'wrong-axis',
              note: `divided by the ${d.cols[o].label} column total instead of the ${d.rows[r].label} row total` },
            { value: flipped, errorType: 'sign-flip',
              note: `moved the total the wrong way, ${direction === 'increase' ? 'subtracting' : 'adding'} the change instead` },
          ],
          answerType: 'percentage', rng,
        });
      } catch (e) {
        if (e instanceof OptionError) { firstFailure = firstFailure ?? 'options:' + e.failures[0]; continue; }
        throw e;
      }
      void counterfactual(d, { r, c, pct: direction === 'increase' ? pct : -pct });
      return {
        id: `b03#${rng.seed}`, archetypeId: 'b03', seed: rng.seed, tier,
        stimulusType: 'table', stimulusId: stimulus.id, stimulus: stimulusFor(stimulus),
        questionText: `If the number of ${d.cols[c].label} at ${d.rows[r].label} were ${verb} by `
          + `${pct}%, what percentage of the ${d.meta.unitNoun} at ${d.rows[r].label} would then be `
          + `${d.cols[o].label}?`,
        answerType: 'percentage',
        correct: { value: D.value, display: options.find(x => x.role === 'correct').display },
        options, optionContext: {},
        values: { cell: d.values[r][c], perturbed, oldTotal: rowTotal(d, r),
          newTotal: roundTo(D.newTotal, 2), numerator: d.values[r][o] },
        workings: {
          formulaText: this.formulaText,
          steps: [
            `${d.cols[c].label} at ${d.rows[r].label}: ${d.values[r][c]} ${verb} by ${pct}% = ${groupDigits(perturbed, perturbed % 1 ? 2 : 0)}`,
            `row total moves from ${rowTotal(d, r)} to ${groupDigits(roundTo(D.newTotal, 2), roundTo(D.newTotal, 2) % 1 ? 2 : 0)}`,
            `${d.values[r][o]} / ${groupDigits(roundTo(D.newTotal, 2), roundTo(D.newTotal, 2) % 1 ? 2 : 0)} x 100 = ${D.value.toFixed(2)}%`,
          ],
        },
        targetSeconds: 45,
        params: { r, c, o, pct, direction },
      };
    }
    return reject(diag, firstFailure ?? 'no-assemblable-candidate');
  },

  generate(rng, tier, forced = null, diag = null) {
    const stimulus = makeStimulus({ family: 'regional', rng });
    if (!stimulus) return reject(diag, 'no-stimulus');
    const it = this.build({ stimulus, rng, tier, forced, diag });
    return it ? { ...it, stimulusIndex: 0, firstOnStimulus: true } : null;
  },
};
