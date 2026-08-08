import { money, roundTo, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// d05 - Tax inclusive against exclusive
//
// Strip the tax by dividing by (1 + rate). Multiplying the gross down by (1 - rate) is the trap,
// and it is close: the two differ by a factor of 1 - rate squared, which at 20% is 4%.

// The archetype spec's rate set of {5, 12, 20} contradicts its own constraint. The multiply-down value is
// the answer times (1 - t squared), so the separation is t squared: 0.25% at 5%, 1.44% at 12% and
// 4% at 20%. Its own bar is 1% and the library's minimum option gap is 2%, so only 20% clears
// either. The set is replaced by rates whose square exceeds 2%, which means 15% and up, and all
// four are real sales-tax rates somewhere.
const RATES = [15, 20, 22, 25];
const BUYERS = ['Rosalind', 'Emeka', 'Delphine', 'Tomas', 'Priya', 'Bertrand'];
const THINGS = [
  { org: 'Wenlock Joinery', thing: 'a workbench' },
  { org: 'Carraway Print', thing: 'a run of catalogues' },
  { org: 'Ilkeston Glass', thing: 'a set of display cases' },
  { org: 'Ardmore Fabrication', thing: 'a steel gate' },
];

export default {
  id: 'd05',
  name: 'Tax inclusive against exclusive',
  group: 'money',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  constraints: [
    'the multiply-down value separates from the answer by more than 1 per cent of the answer, '
      + 'which the factor of 1 minus rate squared gives at every listed rate',
    'the net figure lands exactly on two decimal places, by drawing the gross from the residue '
      + 'class that 100 plus the rate divides',
    'the answer is not the only option sitting on a whole number of pounds',
  ],

  errorTypes: ['multiply-down', 'wrong-quantity', 'sign-flip', 'filler'],

  formulaText: 'gross / (1 + tax rate)',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const t = f.rate ?? rng.pick(RATES);
    const who = f.who ?? rng.pick(BUYERS);
    const job = f.job ?? rng.pick(THINGS);

    // net = gross x 100 / (100 + t), exact when the gross in pence is a multiple of the reduced
    // denominator. Constructive, so nothing is rejected on exactness.
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const den = 100 + t;
    const mod = den / gcd(den, 100);
    const grossPence = f.grossPence
      ?? Math.ceil(Math.round(awkward(rng, 24000, 180000, 0)) / mod) * mod;
    const netPence = grossPence * 100 / den;
    if (!Number.isInteger(netPence)) return reject(diag, 'net-not-exact');

    const gross = grossPence / 100;
    const answer = netPence / 100;
    const dDown = roundTo(gross * (100 - t) / 100, 2);
    const dTax = roundTo(gross * t / 100, 2);
    const dUp = roundTo(gross * (100 + t) / 100, 2);
    if (Math.abs(dDown - answer) < 0.01 * answer) return reject(diag, 'multiply-down-too-close');

    // dDown and dTax sit below the answer, dUp above it, so the filler decides the slot and its
    // side is drawn. Hidden: the candidate cannot tell which option is the filler.
    // The filler cannot go between the answer and the multiply-down value: that gap is t squared,
    // 4% at the commonest rate, and two 2% clearances do not fit inside it. It goes either below
    // the multiply-down value, which puts the answer fourth, or above the answer, which puts it
    // third. Both intervals are wide and the side is drawn and hidden.
    const fillerBelow = f.fillerBelow ?? (rng.next() < 0.5);
    const lo = fillerBelow ? Math.max(dTax, answer / 1.85) : answer;
    const hi = fillerBelow ? dDown : Math.min(dUp, answer * 1.85);
    if (hi - lo < 0.06 * answer) return reject(diag, 'no-room-for-filler');
    const filler = f.filler ?? roundTo(lo + (hi - lo) * rng.float(0.35, 0.65), 2);
    const gapOk = (x, y) => Math.abs(x - y) >= 0.021 * Math.max(x, y);
    if (![answer, dDown, dTax, dUp].every(v => gapOk(v, filler))) return reject(diag, 'filler-too-tight');

    const isWhole = v => Math.abs(v - Math.round(v)) < 1e-9;
    if (isWhole(answer) && ![dDown, dTax, dUp, filler].some(isWhole)) {
      return reject(diag, 'answer-alone-on-a-whole-value');
    }

    const m = v => money(v, '\u00a3', 2);
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dDown, errorType: 'multiply-down',
            note: `took ${t}% off the gross instead of dividing it out, which is not the same thing` },
          { value: dTax, errorType: 'wrong-quantity', note: `gave the tax itself rather than the figure before tax` },
          { value: dUp, errorType: 'sign-flip', note: `added another ${t}% instead of stripping the tax already in the price` },
        ],
        filler: [{ value: filler, note: 'filler, close enough that magnitude cannot resolve the item' }],
        answerType: 'currency', context: { currencySymbol: '\u00a3' }, rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d05#${rng.seed}`, archetypeId: 'd05', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${who} has an invoice from ${job.org} for ${job.thing}. The total is `
        + `${m(gross)}, and that figure already includes sales tax at ${t}%.` },
      questionText: 'What was the price before tax?',
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: { currencySymbol: '\u00a3' },
      values: { gross, rate: t, answer },
      workings: { formulaText: this.formulaText, steps: [
        `the ${m(gross)} is 100% + ${t}% = ${den}% of the price before tax`,
        `answer = ${m(gross)} x 100 / ${den} = ${m(answer)}`,
      ] },
      targetSeconds: 83,
      params: { rate: t, fillerBelow },
    };
  },
};
