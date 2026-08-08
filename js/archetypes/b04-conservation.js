import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';
import { makeStimulus, stimulusFor } from '../lib/stimulus.js';
import { rowTotal, counterfactual } from '../lib/dataset.js';
import { conservationReduction } from '../lib/relations.js';

// b04 - Counterfactual under a conservation constraint
//
// One cell rises, another must fall to hold the total constant. Find the required fall.
//
// TWO OF the archetype spec's FOUR DISTRACTORS ARE WRONG AS WRITTEN. Recorded as defect D1.
//
//   `sign-flip`, "direction reversed", cannot exist. The answer is a bare positive magnitude:
//   "by what percentage would they have to reduce their zebras". Reversing the direction of a
//   magnitude gives the same number, which trips distractor-equals-answer and makes the item
//   unbuildable. Replaced with `swapped-inputs`: the candidate perturbs the second cell and
//   solves for the first, which is a distinct value and the mistake the wording invites.
//
//   "the increase as a percentage of cellA" is algebraically the stated percentage itself. The
//   candidate who makes it answers 212% because 212% is what the stem handed them. That is
//   `reported-input`, not `wrong-base`.
//
// THREE CONSTRAINTS the archetype spec DOES NOT STATE, all forced by the option-set rules rather than
// chosen. The five options are the answer times cellB/rowTotal, cellB/cellA, (cellB/cellA)^2
// and cellB/100 respectively, so:
//   cellB / cellA at most 4          keeps `reported-input` inside the near band
//   cellB between 50 and 200         keeps `points-not-percent` inside the tight-neighbour band
//   the answer below 100 per cent    a reduction above 100% is not a reduction

const PCTS = [40, 60, 80, 100, 120, 150, 180, 200, 212, 240];

export function formula({ cellA, cellB, pct }) {
  const increase = cellA * pct / 100;
  return { increase, value: 100 * increase / cellB };
}

export default {
  id: 'b04',
  name: 'Counterfactual under a conservation constraint',
  group: 'comparison',
  desks: [2],
  families: ['regional'],
  tiers: ['hard'],
  stimulus: 'table',
  answerType: 'percentage',
  targetSeconds: 45,
  slotsPerStimulus: [1, 1],

  constraints: [
    'the required reduction lands on a whole percent',
    'the required reduction is under 100 per cent, so the increase is smaller than the cell it '
      + 'comes out of',
    'the second cell is between 50 and 200, which is what puts a tight neighbour in the set',
    'the second cell is at most four times the first, which keeps the reported-input option '
      + 'inside the near band',
  ],

  errorTypes: ['wrong-base', 'reported-input', 'swapped-inputs', 'points-not-percent'],

  formulaText: 'the increase in the first cell / the second cell x 100',

  formula,

  build({ stimulus, rng, tier, forced = null, diag = null }) {
    const f = forced ?? {};
    const d = stimulus.dataset;
    const nCols = d.cols.length;

    const candidates = [];
    for (let r = 0; r < d.rows.length; r++) {
      for (let cA = 0; cA < nCols; cA++) {
        for (let cB = 0; cB < nCols; cB++) {
          if (cA === cB) continue;
          const a = d.values[r][cA], b = d.values[r][cB];
          if (b < 50 || b > 200) continue;
          if (b / a > 4) continue;
          for (const pct of PCTS) {
            const D = formula({ cellA: a, cellB: b, pct });
            if (!Number.isInteger(D.value) || D.value < 5 || D.value >= 100) continue;
            candidates.push({ r, cA, cB, pct, D });
          }
        }
      }
    }
    if (!candidates.length) return reject(diag, 'no-whole-percent-conservation');

    let firstFailure = null;
    for (const cand of (f.candidate ? [f.candidate] : rng.shuffle(candidates)).slice(0, 14)) {
      const { r, cA, cB, pct, D } = cand;
      const a = d.values[r][cA], b = d.values[r][cB];
      const total = rowTotal(d, r);
      let options;
      try {
        options = assemble({
          correct: { value: D.value },
          distractors: [
            { value: 100 * D.increase / total, errorType: 'wrong-base',
              note: `took the increase of ${D.increase} as a percentage of the whole ${d.rows[r].label} total of ${total}` },
            { value: pct, errorType: 'reported-input',
              note: `gave back the ${pct}% from the question, which is the increase as a percentage of ${d.cols[cA].label} rather than of ${d.cols[cB].label}` },
            { value: 100 * b * pct / 100 / a, errorType: 'swapped-inputs',
              note: `raised ${d.cols[cB].label} by ${pct}% and solved for ${d.cols[cA].label}, the two cells the wrong way round` },
            { value: D.increase, errorType: 'points-not-percent',
              note: `reported the raw increase of ${D.increase} ${d.meta.unitNoun} as if it were a percentage` },
          ],
          answerType: 'percentage', rng,
        });
      } catch (e) {
        if (e instanceof OptionError) { firstFailure = firstFailure ?? 'options:' + e.failures[0]; continue; }
        throw e;
      }
      const cf = counterfactual(d, { r, c: cA, pct, conserve: { r, c: cB } });
      const check = conservationReduction(cf);
      if (Math.abs(check.value - D.value) > 1e-9) return reject(diag, 'relation-disagrees-with-formula');
      return {
        id: `b04#${rng.seed}`, archetypeId: 'b04', seed: rng.seed, tier,
        stimulusType: 'table', stimulusId: stimulus.id, stimulus: stimulusFor(stimulus),
        questionText: `If ${d.rows[r].label} increases its ${d.cols[cA].label} by ${pct}%, by what `
          + `percentage would it have to reduce its ${d.cols[cB].label} to keep its total number `
          + `of ${d.meta.unitNoun} the same?`,
        answerType: 'percentage',
        correct: { value: D.value, display: options.find(x => x.role === 'correct').display },
        options, optionContext: {},
        values: { cellA: a, cellB: b, increase: D.increase, rowTotal: total },
        workings: {
          formulaText: this.formulaText,
          steps: [
            `${d.cols[cA].label} rises by ${pct}% of ${a} = ${D.increase}`,
            `that ${D.increase} must come out of ${d.cols[cB].label}, which stands at ${b}`,
            `${D.increase} / ${b} x 100 = ${D.value}%`,
          ],
        },
        targetSeconds: 45,
        params: { r, cA, cB, pct },
      };
    }
    return reject(diag, firstFailure ?? 'no-assemblable-candidate');
  },


  // THE ESTIMATION ROUTE.
  //
  // 84% of b04's items resolve at one significant figure, which is high for a Desk 02 archetype and
  // is a consequence of the distractor set: three of the four are the same increase expressed over a
  // different base, so they differ from the answer by whole factors rather than by fine margins. The
  // work is choosing the base, not dividing accurately.
  //
  // The route states the base out loud for that reason. The increase is measured against cell B,
  // which is the cell that has to absorb it, and not against the total or against cell A, which are
  // the two wrong-base options.
  // `p.cA` and `p.cB` are COLUMN INDICES, so the quantities come from `v`, which is the same block
  // the worked solution reads. Computing from the indices scored 17%, which the route sweep caught.
  estimate(p, v) {
    const rise = sig2(v.cellA * p.pct / 100);
    const value = rise / v.cellB * 100;
    return {
      value,
      text: `the rise is about ${Math.round(rise)}, taken against the ${v.cellB} it has to come out `
        + `of, so about ${value.toFixed(0)}%`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const stimulus = makeStimulus({ family: 'regional', rng });
    if (!stimulus) return reject(diag, 'no-stimulus');
    const it = this.build({ stimulus, rng, tier, forced, diag });
    return it ? { ...it, stimulusIndex: 0, firstOnStimulus: true } : null;
  },
};
