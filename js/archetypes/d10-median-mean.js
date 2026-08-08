import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { groupDigits } from '../lib/money.js';

// d10 - Median against mean
//
// The archetype spec calls this "Median against mean from a table" and the stimulus is PROSE, settled twice
// over: Part D's preamble keeps d10 prose because a median over six figures reads perfectly well in
// a sentence, and the README's an earlier round log says the same. The name is user-visible in Classify
// mode's archetype list, so a name saying "table" on a prose item is a tell as well as an error.
// Renamed here.
//
// AN EVEN COUNT, so the median is the mean of the middle two and cannot be read off the list. That
// makes the archetype spec's fourth distractor undefined as written: "the middle value of the unsorted list"
// does not exist when there are six values. Defined here as the mean of the two values sitting in
// the middle of the list AS PRINTED, which is the actual slip, and constrained to differ from the
// answer, which needs the printed order to put a different pair in the middle.
//
// The mode needs a repeated value, so exactly one value is duplicated. That is also what keeps the
// mode distinct from the median rather than landing on it.
const SETTINGS = [
  { org: 'Wrenbury Clinic', unit: 'appointments', per: 'day', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
  { org: 'Thrapston Depot', unit: 'consignments', per: 'day', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
  { org: 'Haldon Library', unit: 'loans', per: 'day', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
];

export default {
  id: 'd10',
  name: 'Median against mean',
  group: 'averages',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'number',
  targetSeconds: 83,

  constraints: [
    'an even count, so the median is the mean of the middle two and cannot be read off',
    'the mean, the median, the mode and the midrange are all distinct',
    'the two values in the middle of the printed order are not the two in the middle of the sorted order',
    'exactly one value is repeated, so a mode exists and is not the median',
  ],

  errorTypes: ['wrong-statistic', 'unsorted'],

  formulaText: 'the mean of the two middle values once sorted',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const s = f.setting ?? rng.pick(SETTINGS);
    const values = f.values ?? (() => {
      const v = [];
      for (let i = 0; i < 5; i++) v.push(rng.int(210, 990));
      v.push(v[rng.int(0, 4)]);              // exactly one repeat, so a mode exists
      return rng.shuffle(v);
    })();
    if (values.length !== 6) return reject(diag, 'wrong-count');

    const sorted = [...values].sort((a, b) => a - b);
    const median = (sorted[2] + sorted[3]) / 2;
    const mean = values.reduce((a, b) => a + b, 0) / 6;
    const midrange = (sorted[0] + sorted[5]) / 2;
    const counts = new Map();
    values.forEach(v => counts.set(v, (counts.get(v) ?? 0) + 1));
    const repeated = [...counts.entries()].filter(([, n]) => n > 1);
    if (repeated.length !== 1 || repeated[0][1] !== 2) return reject(diag, 'no-single-mode');
    const mode = repeated[0][0];
    const unsorted = (values[2] + values[3]) / 2;

    const r2 = v => Math.round(v * 100) / 100;
    const answer = r2(median);
    const opts = [answer, r2(mean), r2(mode), r2(midrange), r2(unsorted)];
    if (new Set(opts.map(v => v.toFixed(2))).size !== 5) return reject(diag, 'statistics-collide');
    // Estimation must not resolve it, and the printed middle pair must be a different pair.
    if (Math.abs(unsorted - median) < 0.02 * answer) return reject(diag, 'unsorted-too-close');
    if (Math.abs(mean - median) < 0.02 * answer) return reject(diag, 'mean-too-close');
    if (Math.abs(midrange - median) < 0.02 * answer) return reject(diag, 'midrange-too-close');

    const n = v => groupDigits(v, Number.isInteger(v) ? 0 : 1);
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: r2(mean), errorType: 'wrong-statistic', note: 'gave the mean rather than the median' },
          { value: r2(mode), errorType: 'wrong-statistic', note: 'gave the mode, the only figure that appears twice' },
          { value: r2(midrange), errorType: 'wrong-statistic', note: 'gave the midrange, halfway between the highest and the lowest' },
          { value: r2(unsorted), errorType: 'unsorted',
            note: 'took the middle two of the list as printed rather than sorting first' },
        ],
        answerType: 'number', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d10#${rng.seed}`, archetypeId: 'd10', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${s.org} recorded the number of ${s.unit} handled on each of six days: `
        + s.days.map((d, i) => `${d} ${groupDigits(values[i], 0)}`).join(', ') + '.' },
      questionText: `What was the median number of ${s.unit} handled per ${s.per}?`,
      answerType: 'number',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: {},
      values: { sorted: sorted.join(', '), median: n(median), mean: n(r2(mean)), mode: n(mode), midrange: n(midrange) },
      workings: { formulaText: this.formulaText, steps: [
        `sorted: ${sorted.map(v => groupDigits(v, 0)).join(', ')}`,
        `the two middle values are ${groupDigits(sorted[2], 0)} and ${groupDigits(sorted[3], 0)}`,
        `answer = (${groupDigits(sorted[2], 0)} + ${groupDigits(sorted[3], 0)}) / 2 = ${n(answer)}`,
      ] },
      targetSeconds: 83,
      params: { spread: sorted[5] - sorted[0] },
    };
  },
};
