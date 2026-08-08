import { groupDigits, roundTo, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// d17 - Compound annual growth rate
//
// The nth root of the ratio, less one. Dividing the total growth by n is the trap and it always
// overstates, because compounding does the work the division ignores.
//
// DIVERGENCE. The archetype spec names both "total growth divided by n" and "(end - start) / start / n"
// as separate distractors. They are the same expression written twice. The duplicate is replaced
// by `wrong-base`, the growth taken over the END value rather than the start, which is the most
// common percentage-change error in the format and is not otherwise represented here. The
// off-by-one is drawn to either n - 1 or n + 1, which is what gives the archetype two sorted
// slots rather than one: rooting by too few years overstates the rate and by too many understates
// it, so the drawn direction moves the option across the answer.

const SERIES = [
  { org: 'Wrenfield Logistics', metric: 'turnover', unit: '\u00a3', scale: 'm' },
  { org: 'Castleton Brewing', metric: 'output', unit: '', scale: ' hectolitres' },
  { org: 'Pellow Analytics', metric: 'subscriptions', unit: '', scale: '' },
  { org: 'Marden Freight', metric: 'tonnage handled', unit: '', scale: ' tonnes' },
];

export default {
  id: 'd17',
  name: 'Compound annual growth rate',
  group: 'series',
  desks: [1],
  tiers: ['hard'],
  stimulus: 'prose',
  answerType: 'percentage',
  targetSeconds: 83,

  variants: { key: 'offBy', visible: false },

  constraints: [
    'the answer is reported to one decimal place',
    'the simple-average distractor differs from the answer by at least 1.5 percentage points, '
      + 'which needs either a long period or a large total growth',
    'the off-by-one is drawn to either side, so the sorted slot is not fixed by the geometry',
  ],

  errorTypes: ['simple-average', 'omitted-annualisation', 'wrong-base', 'off-by-one'],

  formulaText: '(end / start) to the power of one over the number of years, less one',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const s = f.series ?? rng.pick(SERIES);
    const years = f.years ?? rng.int(4, 8);
    const start = f.start ?? Math.round(awkward(rng, 1200, 9000, 0));
    const growth = f.growth ?? rng.float(0.55, 2.6);
    const end = f.end ?? Math.round(start * (1 + growth));
    if (end <= start) return reject(diag, 'no-growth');

    const ratio = end / start;
    const answer = roundTo((Math.pow(ratio, 1 / years) - 1) * 100, 1);
    const totalGrowth = roundTo((ratio - 1) * 100, 1);
    const dSimple = roundTo(totalGrowth / years, 1);
    const dWrongBase = roundTo((end - start) / end * 100 / years, 1);
    // Drawn to either side. Rooting by fewer years overstates the rate, by more it understates.
    const offBy = f.offBy ?? (rng.next() < 0.5 ? 'short' : 'long');
    const wrongN = offBy === 'short' ? years - 1 : years + 1;
    const dOffByOne = roundTo((Math.pow(ratio, 1 / wrongN) - 1) * 100, 1);

    if (Math.abs(dSimple - answer) < 1.5) return reject(diag, 'simple-average-too-close');
    const vals = [totalGrowth, dSimple, dWrongBase, dOffByOne];
    if (new Set([answer, ...vals].map(v => v.toFixed(1))).size !== 5) return reject(diag, 'option-collision');
    if (answer < 4 || answer > 30) return reject(diag, 'answer-out-of-band');
    const isWhole = v => Math.abs(v - Math.round(v)) < 1e-9;
    if (isWhole(answer) && !vals.some(isWhole)) return reject(diag, 'answer-alone-on-a-whole-value');

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: totalGrowth, errorType: 'omitted-annualisation',
            note: `gave the growth across the whole ${years} years and never turned it into a yearly rate` },
          { value: dSimple, errorType: 'simple-average',
            note: `divided the ${totalGrowth}% total growth by ${years}, which ignores that each year compounds on the last` },
          { value: dWrongBase, errorType: 'wrong-base',
            note: 'took the growth as a share of the final figure rather than the starting one, then divided by the years' },
          { value: dOffByOne, errorType: 'off-by-one',
            note: `rooted by ${wrongN} rather than ${years}, which is the count of figures rather than the count of intervals` },
        ],
        answerType: 'percentage', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const fmt = v => `${s.unit}${groupDigits(v, 0)}${s.scale}`;
    return {
      id: `d17#${rng.seed}`, archetypeId: 'd17', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${s.org} reported ${s.metric} of ${fmt(start)} at the start of the period `
        + `and ${fmt(end)} ${years} years later.` },
      questionText: 'What was the compound annual growth rate over the period?',
      answerType: 'percentage',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: {},
      values: { start, end, years, ratio: roundTo(ratio, 6), totalGrowth },
      workings: { formulaText: this.formulaText, steps: [
        `ratio = ${groupDigits(end, 0)} / ${groupDigits(start, 0)} = ${roundTo(ratio, 6)}`,
        `${roundTo(ratio, 6)} to the power 1/${years} = ${roundTo(Math.pow(ratio, 1 / years), 6)}`,
        `answer = ${answer}%`,
      ] },
      targetSeconds: 83,
      params: { years, offBy },
    };
  },
};
