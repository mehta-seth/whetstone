import { money, roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { MONTHS } from '../lib/format.js';

// a11 - Compounding to a cumulative threshold
//
// Accumulate month by month. The threshold applies to the running total, not to the monthly
// figure. The most time-expensive archetype in the format.
//
// ---------------------------------------------------------------------------------
// The archetype spec's `simple-not-compound` distractor is dropped, because it cannot exist here.
//
// It asks for the month at which SIMPLE growth would cross the target. Over 5,904 legal
// parameter sets that month equalled the correct month 5,453 times, 92.4%, and equalled the
// k+1 off-by-one distractor the other 451, 7.6%. It was never a fifth distinct value. At 2 to
// 4% monthly growth over 6 to 8 months the two cumulative curves differ by far less than one
// month's profit, so they cross together. Flat growth crosses in the same month too, which
// means a candidate who estimates crudely still lands on or just under the answer.
//
// The window also runs the other way from the obvious guess. Every plausible error here lands
// EARLY: stopping at the last month below the target gives k−1, and estimating with flat growth
// gives k−1 or earlier. Nothing plausible overshoots by two. So the five options are
// k−3, k−2, k−1, k, k+1, and they are labelled honestly: k−1 and k+1 are the two named
// off-by-one procedures, k−2 and k−3 are bracket filler. Calling k+2 a named procedure would
// overstate it, and the derivation discipline is the point.

const FIRMS = [
  { org: 'Ravensworth Joinery', what: 'profit' },
  { org: 'Culdrose Marine', what: 'profit' },
  { org: 'Bellhaven Studios', what: 'profit' },
  { org: 'Tarrant Freight', what: 'profit' },
];

export default {
  id: 'a11',
  name: 'Compounding to a cumulative threshold',
  group: 'series',
  desks: [1],
  tiers: ['hard'],
  stimulus: 'prose',
  answerType: 'month',
  targetSeconds: 83,

  constraints: [
    'the crossing month is six to eight months after the start',
    'the month before crossing falls short by less than one month of profit, keeping the '
      + 'off-by-one live',
    'the crossing month clears the target by between 5% and 20% of one month of profit',
    'the option window runs from three months before the crossing to one month after',
  ],

  errorTypes: ['off-by-one'],

  formulaText: 'accumulate first month × (1 + growth) to the power k until the running total reaches the target',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const firm      = f.firm      ?? rng.pick(FIRMS);
    const startIdx  = f.startIdx  ?? rng.int(0, 5);            // January to June
    const first     = f.first     ?? rng.int(16, 24) * 500;    // 8,000 to 12,000
    const growth    = f.growth    ?? rng.pick([2, 3, 4]);
    const k         = f.k         ?? rng.int(6, 8);            // months after the start
    const clearPct  = f.clearPct  ?? rng.int(5, 20);

    const g = 1 + growth / 100;
    const profit = n => first * g ** n;
    let cumBefore = 0;
    for (let i = 0; i < k; i++) cumBefore += profit(i);
    const monthK = profit(k);

    // Backwards: the target is set so the crossing lands exactly on month k, clearing it by the
    // chosen share of that month's profit. Forwards, the crossing month is whatever it is.
    const target = f.target ?? Math.round(cumBefore + monthK * (1 - clearPct / 100));
    if (target <= cumBefore) return reject(diag, 'target-below-previous');

    // Recomputed from the target, so a forced fixture is held to the same bar.
    let cum = 0, crossing = -1;
    const running = [];
    for (let i = 0; i < 24; i++) {
      cum += profit(i);
      running.push(cum);
      if (cum >= target) { crossing = i; break; }
    }
    if (crossing !== k) return reject(diag, 'crossing-moved');
    const clear = (running[k] - target) / monthK;
    if (clear < 0.04 || clear > 0.21) return reject(diag, 'clearance-band');

    const idx = n => startIdx + n;
    const name = n => MONTHS[((idx(n) % 12) + 12) % 12];
    if (k - 3 < 0) return reject(diag, 'window-before-start');

    let options;
    try {
      options = assemble({
        correct: { value: idx(k), display: name(k) },
        distractors: [
          { value: idx(k - 1), display: name(k - 1), errorType: 'off-by-one',
            note: `stopped at the last month still below the target, ${money(Math.round(running[k] - monthK), '£', 0)}` },
          { value: idx(k + 1), display: name(k + 1), errorType: 'off-by-one',
            note: 'counted one month too many' },
        ],
        filler: [
          { value: idx(k - 2), display: name(k - 2), note: 'filler, two months before the crossing' },
          { value: idx(k - 3), display: name(k - 3), note: 'filler, three months before the crossing' },
        ],
        answerType: 'month',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const m = v => money(v, '£', 0);
    return {
      id: `a11#${rng.seed}`,
      archetypeId: 'a11',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${firm.org} made ${m(first)} ${firm.what} in ${MONTHS[startIdx]}, and expects `
            + `${firm.what} to grow by ${growth}% every month after that.`,
      },
      questionText: `In which month will total ${firm.what} since ${MONTHS[startIdx]} first reach ${m(target)}?`,
      answerType: 'month',
      correct: { value: idx(k), display: name(k) },
      options,
      optionContext: {},
      values: {
        cumBefore: roundTo(running[k] - monthK, 2),
        cumCrossing: roundTo(running[k], 2),
        monthProfit: roundTo(monthK, 2),
      },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `${name(k - 1)} running total = ${m(Math.round(running[k] - monthK))}, still short of ${m(target)}`,
          `${name(k)} profit = ${m(first)} × ${g.toFixed(2)} ^ ${k} = ${m(Math.round(monthK))}`,
          `${name(k)} running total = ${m(Math.round(running[k]))}, which clears ${m(target)}`,
        ],
      },
      targetSeconds: 83,
      params: { firm, startIdx, first, growth, k, target },
    };
  },
};
