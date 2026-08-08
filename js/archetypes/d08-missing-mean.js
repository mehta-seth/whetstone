import { groupDigits, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// d08 - Missing value given a mean
//
// Recover the total from the mean, then strip the known values. The multiplier is the whole item.
//
// TWO DIVERGENCES, both measured.
//
// 1. The archetype spec names `omitted-multiplier`, the mean less the sum of the known values. That is
//    negative in every legal draw, because four or five positive readings sum to more than one
//    mean, and a negative option among positive quantities is eliminable on sight. The archetype spec
//    makes exactly this complaint about a18's source, where non-integer unit counts made the
//    options unreachable.
//
// 2. The obvious replacement, one period SHORT, is the answer less the mean, so it goes negative
//    whenever the missing value is below the mean, which is half of all draws. It rejected 53.1%
//    of attempts and, worse, left the answer in sorted slot 4 in 100% of the ones that survived,
//    because it was the only thing that could ever sit below. The two off-by-ones are therefore
//    one period LONG and one listed value DROPPED, both above the answer, with the division slip
//    and the mean itself below or either side. Two slots, and the discriminator is whether the
//    missing value beats the mean, which cannot be seen without computing it.

const SETS = [
  { org: 'Thrapston Depot', unit: 'consignments', noun: 'consignment', period: 'week' },
  { org: 'Wrenbury Clinic', unit: 'appointments', noun: 'appointment', period: 'day' },
  { org: 'Ledsham Press', unit: 'print runs', noun: 'print run', period: 'month' },
  { org: 'Cranmore Ferry', unit: 'crossings', noun: 'crossing', period: 'day' },
];
const LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default {
  id: 'd08',
  name: 'Missing value given a mean',
  group: 'averages',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'number',
  targetSeconds: 83,

  constraints: [
    'every value is positive',
    'the answer is neither the largest nor the smallest in the set, so it cannot be guessed from '
      + 'its position in the list',
    'the mean is a whole number, so the total is clean',
  ],

  errorTypes: ['off-by-one', 'omitted-component', 'wrong-operation', 'reported-input'],

  formulaText: 'count x mean, less the sum of the values that are given',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const set = f.set ?? rng.pick(SETS);
    const n = f.n ?? rng.int(5, 6);
    const mean = f.mean ?? Math.round(awkward(rng, 240, 900, 0));
    const total = n * mean;

    // The missing value is drawn first and the known ones are built around it, so the constraint
    // that it is neither largest nor smallest holds by construction rather than by rejection.
    const answer = f.answer ?? Math.round(mean * rng.float(0.72, 1.28));
    if (answer <= 0) return reject(diag, 'answer-not-positive');
    // Forceable, because the search below consumes the rng and the spec asks a fixture to
    // inject every parameter the arithmetic depends on. Leaving it made the fixture pass or fail
    // on draw order rather than on the maths.
    let known = f.known ?? null;
    for (let attempt = 0; attempt < 200 && !known; attempt++) {
      const raw = Array.from({ length: n - 1 }, () => Math.round(mean * rng.float(0.55, 1.45)));
      const sum = raw.reduce((a, b) => a + b, 0);
      const fix = total - answer - sum;
      raw[rng.int(0, n - 2)] += fix;
      if (raw.some(v => v <= 0)) continue;
      if (new Set([...raw, answer]).size !== n) continue;
      if (answer >= Math.max(...raw) || answer <= Math.min(...raw)) continue;
      known = raw;
    }
    if (!known) return reject(diag, 'no-known-set-with-the-answer-interior');
    const sumKnown = known.reduce((a, b) => a + b, 0);
    if (sumKnown + answer !== total) return reject(diag, 'total-mismatch');

    const dropped = known[known.length - 1];
    const dLong = (n + 1) * mean - sumKnown;
    const dDropped = total - (sumKnown - dropped);
    const dDivide = Math.round(sumKnown / n);
    const vals = [dDropped, dLong, dDivide, mean];
    if (vals.some(v => v <= 0)) return reject(diag, 'non-positive-option');
    if (new Set([answer, ...vals]).size !== 5) return reject(diag, 'option-collision');

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dLong, errorType: 'off-by-one', note: `multiplied the mean by ${n + 1} rather than ${n}` },
          { value: dDropped, errorType: 'omitted-component',
            note: `left the ${groupDigits(dropped, 0)} out of the values that were subtracted` },
          { value: dDivide, errorType: 'wrong-operation',
            note: 'divided the values that are given by the count instead of working back from the total' },
          { value: mean, errorType: 'reported-input', note: 'repeated the mean, which is given in the stem' },
        ],
        answerType: 'number', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const named = known.map((v, i) => `${LABELS[i]} ${groupDigits(v, 0)}`).join(', ');
    return {
      id: `d08#${rng.seed}`, archetypeId: 'd08', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${set.org} handled a mean of ${groupDigits(mean, 0)} ${set.unit} a `
        + `${set.period} across ${n} ${set.period}s. The figures for ${n - 1} of them were `
        + `${named}.` },
      questionText: `How many ${set.unit} were handled on ${LABELS[n - 1]}?`,
      answerType: 'number',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: {},
      values: { n, mean, total, sumKnown },
      workings: { formulaText: this.formulaText, steps: [
        `total = ${n} x ${groupDigits(mean, 0)} = ${groupDigits(total, 0)}`,
        `given values add to ${groupDigits(sumKnown, 0)}`,
        `answer = ${groupDigits(total, 0)} - ${groupDigits(sumKnown, 0)} = ${groupDigits(answer, 0)}`,
      ] },
      targetSeconds: 83,
      params: { n, mean },
    };
  },
};
