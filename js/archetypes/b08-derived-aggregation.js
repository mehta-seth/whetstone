import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { money } from '../lib/money.js';
import { makeStimulus, stimulusFor } from '../lib/stimulus.js';
import { derivedSeries, rowSeries } from '../lib/dataset.js';
import { seriesTotal } from '../lib/relations.js';

// b08 - Derived series before aggregation
//
// Build a derived series across every column first, then aggregate, then take a share. The most
// expensive item type in the format, at 45 seconds: five multiplications, a sum and a division.
//
// ONE DISTRACTOR SUBSTITUTED. The archetype spec's fourth is "a single column's derived value reported
// (wrong-quantity)". That value is a sum of money, roughly 1,500 against an answer of roughly 22,
// so as an option in a percentage set it reads as 1,500% and is eliminable on sight. The spec's
// spread rule exists to exclude exactly that. Replaced with `adjacent-column`: the share of the
// neighbouring column's derived value, which is a real misread, stays inside the percentage range
// and keeps the option set unresolvable by magnitude.

export default {
  id: 'b08',
  name: 'Derived series before aggregation',
  group: 'normalising',
  desks: [2],
  families: ['retail'],
  tiers: ['hard'],
  stimulus: 'table',
  answerType: 'percentage',
  targetSeconds: 45,
  slotsPerStimulus: [1, 2],

  constraints: [
    'the share of the derived total differs from the share of either raw row total by at least 5 '
      + 'percentage points, so both skipped-derivation distractors are live',
    'the answer is between 8 and 45 per cent, so no option is eliminable on plausibility',
    'the adjacent column carries a derived share at least 2 points from the answer',
  ],

  errorTypes: ['skipped-derivation', 'wrong-denominator', 'adjacent-column'],

  formulaText: 'one column of (quantity x price) / the total of (quantity x price) across all columns x 100',

  build({ stimulus, rng, tier, forced = null, diag = null }) {
    const d = stimulus.dataset;
    const soldIdx = d.rows.findIndex(r => r.key === 'sold');
    const priceIdx = d.rows.findIndex(r => r.key === 'price');
    if (soldIdx < 0 || priceIdx < 0) return reject(diag, 'wrong-family');

    const sold = rowSeries(d, soldIdx), price = rowSeries(d, priceIdx);
    const takings = derivedSeries(d, { op: 'product', a: soldIdx, b: priceIdx, label: 'takings' });
    const tTotal = seriesTotal(takings), sTotal = seriesTotal(sold), pTotal = seriesTotal(price);

    const candidates = [];
    for (let k = 0; k < d.cols.length; k++) {
      const answer = 100 * takings.values[k] / tTotal;
      const skipA = 100 * sold.values[k] / sTotal;
      const skipB = 100 * price.values[k] / pTotal;
      if (answer < 8 || answer > 45) continue;
      if (Math.abs(answer - skipA) < 5 || Math.abs(answer - skipB) < 5) continue;
      const nbr = k + 1 < d.cols.length ? k + 1 : k - 1;
      const adj = 100 * takings.values[nbr] / tTotal;
      if (Math.abs(adj - answer) < 2) continue;
      candidates.push({ k, nbr, answer, skipA, skipB, adj });
    }
    if (!candidates.length) return reject(diag, 'no-column-with-separated-shares');

    let firstFailure = null;
    for (const cand of (forced?.candidate ? [forced.candidate] : rng.shuffle(candidates)).slice(0, 8)) {
      const { k, nbr, answer, skipA, skipB, adj } = cand;
      const m = v => money(v, d.meta.symbol, 2);
      let options;
      try {
        options = assemble({
          correct: { value: answer },
          distractors: [
            { value: skipA, errorType: 'skipped-derivation',
              note: `gave the ${d.cols[k].label} share of ${d.meta.unitNoun} sold and never multiplied by price` },
            { value: skipB, errorType: 'skipped-derivation',
              note: `gave the ${d.cols[k].label} share of the prices added together, which is not a quantity` },
            { value: 100 * takings.values[k] / (tTotal - takings.values[k]), errorType: 'wrong-denominator',
              note: `divided by the takings on the other four sizes rather than by the total` },
            { value: adj, errorType: 'adjacent-column',
              note: `worked out the takings correctly but took the ${d.cols[nbr].label} column` },
          ],
          answerType: 'percentage', rng,
        });
      } catch (e) {
        if (e instanceof OptionError) { firstFailure = firstFailure ?? 'options:' + e.failures[0]; continue; }
        throw e;
      }
      return {
        id: `b08#${rng.seed}`, archetypeId: 'b08', seed: rng.seed, tier,
        stimulusType: 'table', stimulusId: stimulus.id, stimulus: stimulusFor(stimulus),
        questionText: `What percentage of all takings last year were due to ${d.cols[k].label} `
          + `${d.meta.unitNoun}?`,
        answerType: 'percentage',
        correct: { value: answer, display: options.find(o => o.role === 'correct').display },
        options, optionContext: {},
        values: Object.fromEntries([
          ...takings.values.map((v, i) => [`takings_${d.cols[i].key}`, m(v)]),
          ['total', m(tTotal)],
        ]),
        workings: {
          formulaText: this.formulaText,
          steps: [
            ...takings.values.map((v, i) =>
              `${d.cols[i].label}: ${sold.values[i]} x ${m(price.values[i])} = ${m(v)}`),
            `total takings = ${m(tTotal)}`,
            `${m(takings.values[k])} / ${m(tTotal)} x 100 = ${answer.toFixed(2)}%`,
          ],
        },
        targetSeconds: 45,
        params: { k },
      };
    }
    return reject(diag, firstFailure ?? 'no-assemblable-candidate');
  },

  generate(rng, tier, forced = null, diag = null) {
    const stimulus = makeStimulus({ family: 'retail', rng });
    if (!stimulus) return reject(diag, 'no-stimulus');
    const it = this.build({ stimulus, rng, tier, forced, diag });
    return it ? { ...it, stimulusIndex: 0, firstOnStimulus: true } : null;
  },
};
