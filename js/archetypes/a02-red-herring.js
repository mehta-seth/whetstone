import { roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a02 - Chained percentage with a red-herring intermediate
//
// The middle figure describes a state the question does not ask about. Ignore it, compute the
// end rate from raw output, compare it to the start.
//
// ONE CONSTRAINT ADDED: the start rate is never 100. At exactly 100 the raw unit gain and the
// percentage increase are the same number, so the `points-not-percent` distractor equals the
// answer and the item is unbuildable. The archetype spec does not exclude it.
//
// The fourth option stays filler rather than becoming a `wrong-base` distractor. Measuring the
// change against the end rate rather than the start gives 9.09% against a 10% answer, which is
// too close, and this archetype's teaching point is discarding the herring. `wrong-base` is
// already carried by a19.

const LINES = [
  { org: 'Ferrier Textiles', out: { s: 'metre', p: 'metres' }, thing: 'woven cloth',
    herring: 'the proportion of cloth rejected at inspection' },
  { org: 'Netley Press', out: { s: 'sheet', p: 'sheets' }, thing: 'printed sheets',
    herring: 'the proportion of sheets spoiled in setup' },
  { org: 'Alderbrook Dairy', out: { s: 'litre', p: 'litres' }, thing: 'bottled milk',
    herring: 'the proportion of bottles held back for testing' },
  { org: 'Wraysbury Glass', out: { s: 'pane', p: 'panes' }, thing: 'cut panes',
    herring: 'the proportion of panes scrapped for edge damage' },
];

// Every (start rate, increase) pair for which the end rate is a whole number. Enumerated once
// at module level: drawing the start rate and hoping an increase fits rejected 87% of attempts,
// because startRate x increase has to be divisible by 100 and most pairs are not. The start
// rate of 100 is excluded here rather than rejected later, since it makes the raw unit gain
// equal the percentage increase.
const PAIRS = (() => {
  const out = [];
  for (let s = 80; s <= 150; s++) {
    if (s === 100) continue;
    for (let inc = 8; inc <= 15; inc++) if ((s * inc) % 100 === 0) out.push({ startRate: s, increase: inc });
  }
  return out;
})();

export default {
  id: 'a02',
  name: 'Chained percentage with a red-herring intermediate',
  group: 'percentages',
  desks: [1],
  tiers: ['standard'],
  stimulus: 'prose',
  answerType: 'percentage',
  targetSeconds: 83,

  constraints: [
    'the end rate is a whole number, so the correct path is clean',
    'the true increase is 8 to 15%, and the red herring is strictly smaller than it',
    'the start rate is not 100, or the raw unit gain equals the percentage increase',
  ],

  errorTypes: ['reported-input', 'added-herring', 'points-not-percent'],

  formulaText: '(output ÷ hours − starting rate) ÷ starting rate × 100',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const line = f.line ?? rng.pick(LINES);
    const pair = (f.startRate !== undefined && f.increase !== undefined)
      ? { startRate: f.startRate, increase: f.increase }
      : rng.pick(PAIRS);
    const { startRate, increase } = pair;
    if (startRate === 100) return reject(diag, 'start-rate-100');
    if ((startRate * increase) % 100 !== 0) return reject(diag, 'no-whole-end-rate');
    const endRate = startRate * (100 + increase) / 100;

    const herring = f.herring ?? rng.int(3, 6);
    if (herring >= increase) return reject(diag, 'herring-not-smaller');

    const duration = f.duration ?? rng.int(5, 9);
    const totalOutput = endRate * duration;
    const gain = endRate - startRate;

    const answer = increase;
    const dHerring = herring;
    const dAdded   = increase + herring;
    const dPoints  = gain;                       // the raw unit gain read as a percentage
    const fFiller  = gain + herring;

    const set = [answer, dHerring, dAdded, dPoints, fFiller];
    if (new Set(set).size !== 5) return reject(diag, 'option-collision');
    if (set.some(v => v <= 0)) return reject(diag, 'option-not-positive');

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dHerring, errorType: 'reported-input',
            note: `reported the ${herring}% figure, which is about something else entirely` },
          { value: dAdded, errorType: 'added-herring',
            note: `added the ${herring}% to the true increase of ${increase}%` },
          { value: dPoints, errorType: 'points-not-percent',
            note: `reported the gain of ${gain} ${line.out.p} per hour as if it were a percentage` },
        ],
        filler: [
          { value: fFiller, note: `filler, the unit gain of ${gain} plus the ${herring}% figure` },
        ],
        answerType: 'percentage',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `a02#${rng.seed}`,
      archetypeId: 'a02',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${line.org} was producing ${startRate} ${line.out.p} of ${line.thing} an hour. `
            + `Over the same period ${line.herring} fell by ${herring}%. `
            + `The line now produces ${totalOutput.toLocaleString('en-GB')} ${line.out.p} in ${duration} hours.`,
      },
      questionText: `By what percentage has the hourly production rate increased?`,
      answerType: 'percentage',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: {},
      values: { endRate, gain, totalOutput },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `end rate = ${totalOutput.toLocaleString('en-GB')} ÷ ${duration} = ${endRate} ${line.out.p} an hour`,
          `gain = ${endRate} − ${startRate} = ${gain} ${line.out.p} an hour`,
          `answer = ${gain} ÷ ${startRate} × 100 = ${answer}%`,
          `the ${herring}% figure describes ${line.herring} and plays no part`,
        ],
      },
      targetSeconds: 83,
      params: { line, startRate, increase, herring, duration },
    };
  },
};
