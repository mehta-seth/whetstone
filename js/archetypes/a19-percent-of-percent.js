import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a19 - Percent change of a percentage
//
// Everything is held in hundredths of a percentage point as integers, so the two
// quoted rates and their difference are all exact at 2dp.
//
// Constraint 2 restated as a parameter bound. The points-not-percent distractor
// is delta read as a percent, and the answer is delta/old*100, so their ratio is
// exactly oldPct. Requiring them to differ by a factor of 1.2 is therefore a
// bound on oldPct alone, checkable before anything is computed. Near oldPct = 1
// the two values converge and the distractor stops working, which is what the
// excluded band records.
//
// The change has to land on a clean 2dp value or the two quoted rates cannot both
// be stated at 2dp, which forces oldPct to a multiple of 0.05 and the answer to a
// multiple of 100/gcd(oldHundredths, 100). Generated forwards from oldPct and
// backwards from the answer for exactly that reason.
//
// The fifth option replaces the archetype spec's decimal-slip filler, which sat at 8x the
// answer and now fails the 2x filler rule. Dividing the change by the mean of the
// two rates is a real wrong base, sits at about 1.1x, and needs no filler.

const OLD_EXCLUDED = [83.4, 120];        // hundredths, the band where oldPct ~ 1
const METRICS = [
  { name: 'defect rate',        owner: 'Thorne Castings',  fall: 'fall', rise: 'rise' },
  { name: 'loan default rate',  owner: 'Merrow Finance',   fall: 'fall', rise: 'rise' },
  { name: 'contamination rate', owner: 'Aldbury Dairies',  fall: 'fall', rise: 'rise' },
  { name: 'packet loss rate',   owner: 'Vellon Networks',  fall: 'fall', rise: 'rise' },
];
const AUDITS = [['March', 'September'], ['January', 'July'], ['Q1', 'Q3'], ['the spring audit', 'the autumn audit']];

const gcd = (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; };
const pct = h => (h / 100).toFixed(2);

export default {
  id: 'a19',
  name: 'Percent change of a percentage',
  group: 'percentages',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'percentage',
  targetSeconds: 83,

  constraints: [
    'oldPct outside 0.834 to 1.20, so the point-difference distractor stays a factor of 1.2 clear of the answer',
    'the change is between 15% and 40% of oldPct and lands on a clean 2dp value',
    'dividing by the new value gives a figure at least 4 percentage points from the answer',
    'all five options distinct once rounded as a candidate would report them',
  ],

  errorTypes: ['points-not-percent', 'wrong-base', 'complement'],

  formulaText: '|old − new| ÷ old × 100, with old as the base',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const oldH = f.oldPct !== undefined ? Math.round(f.oldPct * 100)
               : rng.pick([...Array(5).keys()].map(i => 60 + i * 5)
                          .concat([...Array(25).keys()].map(i => 120 + i * 5)));

    if (oldH > OLD_EXCLUDED[0] && oldH < OLD_EXCLUDED[1]) return reject(diag, 'oldpct-band');

    // Admissible answers: those making the change an exact 2dp figure.
    const step = 100 / gcd(oldH, 100);
    const admissible = [];
    for (let a = Math.ceil(15 / step) * step; a <= 40; a += step) admissible.push(a);
    if (!admissible.length) return reject(diag, 'no-clean-change');

    const direction = f.direction ?? rng.pick(['fall', 'rise']);
    const answer = f.newPct !== undefined
      ? Math.round(Math.abs(oldH - Math.round(f.newPct * 100)) / oldH * 100)
      : rng.pick(admissible);

    const deltaH = oldH * answer / 100;
    if (!Number.isInteger(deltaH)) return reject(diag, 'no-clean-change');
    const newH = direction === 'fall' ? oldH - deltaH : oldH + deltaH;
    if (newH <= 0) return reject(diag, 'new-positive');

    const round0 = v => Math.round(v);
    const dPoints     = deltaH;                                  // 0.30 reported as 30%
    const dWrongBase  = round0(deltaH / newH * 100);              // divided by the new value
    const dComplement = round0(newH / oldH * 100);                // reported what it fell to, not by
    const dMeanBase   = round0(2 * deltaH / (oldH + newH) * 100); // divided by the mean of the two

    if (Math.abs(dWrongBase - answer) < 4) return reject(diag, 'wrong-base-too-close');

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dPoints, errorType: 'points-not-percent',
            note: `reported the ${pct(deltaH)} point difference as a percentage` },
          { value: dWrongBase, errorType: 'wrong-base',
            note: `divided the change by the new value: ${pct(deltaH)} ÷ ${pct(newH)}` },
          { value: dComplement, errorType: 'complement',
            note: `reported the new rate as a percentage of the old, what it ${direction === 'fall' ? 'fell' : 'rose'} to rather than by` },
          { value: dMeanBase, errorType: 'wrong-base',
            note: `divided the change by the mean of the two rates rather than by the old rate` },
        ],
        answerType: 'percentage',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const metric = f.metric ?? rng.pick(METRICS);
    const audit = f.audit ?? rng.pick(AUDITS);
    const verb = direction === 'fall' ? 'fall' : 'rise';
    return {
      id: `a19#${rng.seed}`,
      archetypeId: 'a19',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `At ${audit[0]}, ${metric.owner} recorded a ${metric.name} of ${pct(oldH)}%. `
            + `At ${audit[1]} the ${metric.name} was ${pct(newH)}%.`,
      },
      questionText: `By what percentage did ${metric.owner}'s ${metric.name} ${verb} between the two?`,
      answerType: 'percentage',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      values: { oldPct: Number(pct(oldH)), newPct: Number(pct(newH)), pointDifference: Number(pct(deltaH)) },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `point difference = ${pct(oldH)} − ${pct(newH)} = ${pct(deltaH)} percentage points`,
          `answer = ${pct(deltaH)} ÷ ${pct(oldH)} × 100 = ${answer}%`,
        ],
      },
      targetSeconds: 83,
      params: { oldPct: Number(pct(oldH)), newPct: Number(pct(newH)), direction, metric, audit },
    };
  },
};
