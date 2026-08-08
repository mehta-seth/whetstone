import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a09 - Combined rates, third worker by subtraction
//
// Pair rate, trio rate, subtract, then apply an awkward time.
//
// THE SPEED RATIO IS A RED HERRING. The archetype spec's Move says "pair rate, split by ratio, trio
// rate, subtract", but its Formula never uses the ratio and its fixture's answer of 825 tiles
// does not depend on it. The ratio is a stated fact the question does not need, the same device
// as a02's herring, and it is retained because splitting the pair rate by it is a plausible
// wrong path that costs a candidate half the clock. Its only live role is the constraint that
// the pair rate divides cleanly by (1 + ratio), which is what makes that wrong path look
// inviting rather than obviously wrong.

const CREWS = [
  { org: 'a tiling firm', a: 'Mira', b: 'Owen', c: 'Rafe', out: { s: 'tile', p: 'tiles' } },
  { org: 'a packing line', a: 'Solveig', b: 'Danny', c: 'Priya', out: { s: 'carton', p: 'cartons' } },
  { org: 'a bindery', a: 'Aurelio', b: 'Kemi', c: 'Vance', out: { s: 'signature', p: 'signatures' } },
  { org: 'a sign shop', a: 'Nadia', b: 'Corin', c: 'Esther', out: { s: 'panel', p: 'panels' } },
];
const MINUTES = [15, 20, 27, 45];

export default {
  id: 'a09',
  name: 'Combined rates, third worker by subtraction',
  group: 'rates',
  desks: [1],
  tiers: ['hard'],
  stimulus: 'prose',
  answerType: 'countWithUnit',
  targetSeconds: 83,

  constraints: [
    'the pair rate divides cleanly by one plus the speed ratio, so splitting it looks inviting',
    'the third worker rate is positive',
    'the answer is a whole number, and the target minutes are never 30',
  ],

  errorTypes: ['wrong-rate', 'wrong-input'],

  formulaText: '(trio rate − pair rate) × the target time in hours',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const crew    = f.crew    ?? rng.pick(CREWS);
    const ratio   = f.ratio   ?? rng.pick([2, 3]);
    const minutes = f.minutes ?? rng.pick(MINUTES);
    const hours   = f.hours   ?? rng.int(2, 5);

    // The third worker rate must make the answer whole, so it is drawn from the multiples of
    // 60 / gcd(minutes, 60) rather than drawn freely.
    const step = 60 / gcd(minutes, 60);
    const thirdRate = f.thirdRate ?? rng.int(Math.ceil(120 / step), Math.floor(300 / step)) * step;

    // The pair rate must divide by (1 + ratio) so the ratio split lands on whole numbers, and it
    // must also carry the same factor as the third rate, or the two wrong-rate distractors are
    // not whole counts. Drawing on the ratio alone rejected 28% of attempts there.
    const block = lcm((1 + ratio) * 10, step);
    const pairRate = f.pairRate ?? rng.int(Math.ceil(120 / block), Math.floor(420 / block)) * block;
    const trioRate = pairRate + thirdRate;
    if (thirdRate <= 0) return reject(diag, 'third-rate-not-positive');

    const pairHours = f.pairHours ?? rng.int(4, 7);
    const trioHours = f.trioHours ?? rng.int(4, 7);
    const pairOutput = pairRate * pairHours;
    const trioOutput = trioRate * trioHours;

    const targetHours = hours + minutes / 60;
    const answer = thirdRate * targetHours;
    if (!Number.isInteger(answer)) return reject(diag, 'answer-not-whole');

    const dTrio     = trioRate * targetHours;
    const dPair     = pairRate * targetHours;
    const dNoMins   = thirdRate * hours;
    const dRoundUp  = thirdRate * (hours + 1);
    const set = [answer, dTrio, dPair, dNoMins, dRoundUp];
    if (!set.every(v => Number.isInteger(v) && v > 0)) return reject(diag, 'option-not-a-count');

    const context = { unit: crew.out.s, unitPlural: crew.out.p };
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dTrio, errorType: 'wrong-rate', note: `used the three-person rate of ${trioRate} an hour` },
          { value: dPair, errorType: 'wrong-rate', note: `used the two-person rate of ${pairRate} an hour` },
          { value: dNoMins, errorType: 'wrong-input', note: `dropped the ${minutes} minutes and used ${hours} hours` },
          { value: dRoundUp, errorType: 'wrong-input', note: `rounded the time up to ${hours + 1} hours` },
        ],
        answerType: 'countWithUnit',
        context,
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const n = v => v.toLocaleString('en-GB');
    return {
      id: `a09#${rng.seed}`,
      archetypeId: 'a09',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `At ${crew.org}, ${crew.a} works ${ratio} times as fast as ${crew.b}. `
            + `Working together the two of them lay ${n(pairOutput)} ${crew.out.p} in ${pairHours} hours. `
            + `With ${crew.c} joining them, the three lay ${n(trioOutput)} ${crew.out.p} in ${trioHours} hours.`,
      },
      questionText: `How many ${crew.out.p} would ${crew.c} lay alone in ${hours} hours and ${minutes} minutes?`,
      answerType: 'countWithUnit',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: context,
      values: { pairRate, trioRate, thirdRate },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `pair rate = ${n(pairOutput)} ÷ ${pairHours} = ${pairRate} an hour`,
          `trio rate = ${n(trioOutput)} ÷ ${trioHours} = ${trioRate} an hour`,
          `${crew.c} = ${trioRate} − ${pairRate} = ${thirdRate} an hour`,
          `answer = ${thirdRate} × ${targetHours} = ${n(answer)} ${crew.out.p}`,
          `the ${ratio}-to-1 speed ratio is not needed for this question`,
        ],
      },
      targetSeconds: 83,
      params: { crew, ratio, minutes, hours, thirdRate, pairRate, pairHours, trioHours },
    };
  },
};

function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
function lcm(a, b) { return a * b / gcd(a, b); }
