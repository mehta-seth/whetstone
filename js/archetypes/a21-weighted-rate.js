import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a21 - Weighted rate across unequal groups
//
// Rates are integer percentages and the group sizes are integers, so the pooled
// rate is the exact rational (n1*r1 + n2*r2) / (n1 + n2). Both products are
// required to be whole numbers of wins, which is what makes the correct path
// clean, and both the answer and the weights-swapped figure are required to land
// on at most one decimal place, because the percentage formatter would otherwise
// print the answer to two places while every other option showed none, which is
// itself a tell.
//
// Every option here is a specific misuse of the weighting. That is the target
// quality for the whole library.

// The whole-win-counts constraint is far more restrictive than the stated ranges
// admit, and the archetype spec does not spell out what it implies. With rates as
// multiples of 5, n*r divisible by 100 reduces to n*s divisible by 20 where
// r = 5s, so group sizes that are odd and not multiples of 5 admit no legal rate
// at all: 17, 19, 21, 23, 27 and 29 are all dead. Drawing them and rejecting
// afterwards is what took this archetype to 309 attempts per item, so the
// admissible rates are enumerated per group size instead.
const admissibleRates = n => {
  const out = [];
  for (let s = 6; s <= 16; s++) if ((n * 5 * s) % 100 === 0) out.push(5 * s);
  return out;
};
const SIZES_1 = [];
for (let n = 15; n <= 30; n++) if (admissibleRates(n).length) SIZES_1.push(n);

const CLUBS = [
  ['Rosemont', 'Ashford'], ['Kilbride', 'Danesfield'],
  ['Waverton', 'Elmsby'], ['Norbury', 'Castlemere'],
];
const CONTESTS = [
  { unit: 'fixtures', verb: 'won' },
  { unit: 'tenders', verb: 'won' },
  { unit: 'trials', verb: 'passed' },
];

export default {
  id: 'a21',
  name: 'Weighted rate across unequal groups',
  group: 'averages',
  desks: [1],
  tiers: ['standard'],
  stimulus: 'prose',
  answerType: 'percentage',
  targetSeconds: 83,

  constraints: [
    'both group win counts are whole numbers, so the correct path is clean',
    'group sizes differ, with a ratio between 1.2 and 2.0',
    'the two rates differ by at least 15 points',
    'the unweighted average differs from the answer by at least 2 percentage points',
    'the answer equals neither rate, and both it and the swapped figure land on one decimal place',
  ],

  errorTypes: ['unweighted-average', 'weights-swapped', 'reported-input'],

  formulaText: '(n1 × r1 + n2 × r2) ÷ (n1 + n2), pooling the counts before taking the rate',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const n1 = f.n1 ?? rng.pick(SIZES_1);
    const rates1 = admissibleRates(n1);
    if (!rates1.length) return reject(diag, 'no-legal-rate');
    const r1 = f.r1 ?? rng.pick(rates1);

    // The second group and its rate are chosen together, because the constraint
    // that the pooled rate lands on one decimal place couples them: it depends on
    // n1*r1 + n2*r2 against n1 + n2, so no independent draw of either can
    // satisfy it. Rejecting afterwards cost 82% of attempts.
    let n2, r2;
    if (f.n2 !== undefined && f.r2 !== undefined) {
      n2 = f.n2; r2 = f.r2;
    } else {
      const pairs = [];
      for (let n = 20; n <= 40; n++) {
        if (n === n1) continue;
        if (f.n2 !== undefined && n !== f.n2) continue;
        const ratio = Math.max(n, n1) / Math.min(n, n1);
        if (ratio < 1.2 || ratio > 2.0) continue;
        const t = n1 + n;
        for (const r of admissibleRates(n)) {
          if (Math.abs(r - r1) < 15) continue;
          if ((10 * (n1 * r1 + n * r)) % t !== 0) continue;
          if ((10 * (n1 * r + n * r1)) % t !== 0) continue;
          if (Math.abs((r1 + r) / 2 - (n1 * r1 + n * r) / t) < 2) continue;
          const a = (n1 * r1 + n * r) / t;
          if (a === r1 || a === r) continue;
          pairs.push([n, r]);
        }
      }
      if (!pairs.length) return reject(diag, 'no-legal-second-group');
      [n2, r2] = rng.pick(pairs);
    }

    if (n1 === n2) return reject(diag, 'equal-groups');
    const ratio = Math.max(n1, n2) / Math.min(n1, n2);
    if (ratio < 1.2 || ratio > 2.0) return reject(diag, 'size-ratio');
    if (Math.abs(r1 - r2) < 15) return reject(diag, 'rates-too-close');
    if ((n1 * r1) % 100 !== 0 || (n2 * r2) % 100 !== 0) return reject(diag, 'fractional-wins');

    const total = n1 + n2;
    const pooled = n1 * r1 + n2 * r2;                 // in percentage-point units
    const swappedPooled = n1 * r2 + n2 * r1;
    if ((pooled * 10) % total !== 0) return reject(diag, 'answer-precision');
    if ((swappedPooled * 10) % total !== 0) return reject(diag, 'swapped-precision');

    const answer = pooled / total;
    const unweighted = (r1 + r2) / 2;
    const swapped = swappedPooled / total;

    if (Math.abs(unweighted - answer) < 2) return reject(diag, 'unweighted-too-close');
    if (answer === r1 || answer === r2) return reject(diag, 'answer-equals-input');

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: unweighted, errorType: 'unweighted-average',
            note: `averaged the two rates without weighting: (${r1} + ${r2}) ÷ 2` },
          { value: swapped, errorType: 'weights-swapped',
            note: `applied each rate to the other group's size` },
          { value: r1, errorType: 'reported-input', note: `reported the first group's rate unchanged` },
          { value: r2, errorType: 'reported-input', note: `reported the second group's rate unchanged` },
        ],
        answerType: 'percentage',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const clubs = f.clubs ?? rng.pick(CLUBS);
    const c = f.contest ?? rng.pick(CONTESTS);
    return {
      id: `a21#${rng.seed}`,
      archetypeId: 'a21',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${clubs[0]} entered ${n1} ${c.unit} last season and ${c.verb} ${r1}% of them. `
            + `${clubs[1]} entered ${n2} ${c.unit} and ${c.verb} ${r2}%.`,
      },
      questionText: `Taken together, what percentage of the ${total} ${c.unit} were ${c.verb}?`,
      answerType: 'percentage',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      values: { wins1: n1 * r1 / 100, wins2: n2 * r2 / 100, totalWins: pooled / 100, total },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `${clubs[0]} ${c.verb} ${n1} × ${r1}% = ${n1 * r1 / 100}`,
          `${clubs[1]} ${c.verb} ${n2} × ${r2}% = ${n2 * r2 / 100}`,
          `answer = ${pooled / 100} ÷ ${total} × 100 = ${answer}%`,
        ],
      },
      targetSeconds: 83,
      params: { n1, r1, n2, r2, clubs, contest: c },
    };
  },
};
