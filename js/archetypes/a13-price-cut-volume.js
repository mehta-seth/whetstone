import { money, roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';

// a13 - Price cut against volume lift
//
// Compute both revenues in full. The sign of the change is the question.
//
// (1 − cut)(1 + lift) < 1 whenever lift < cut, which the archetype spec already requires, so the
// decrease is guaranteed and the intuitive answer is wrong. Proof: the product is below 1 iff
// lift < cut(1 + lift), and lift/(1 + lift) < lift < cut. No rejection needed.
//
// The mandated "Does not change" option carries value 0, which every ratio guard in
// validate.js used to reject as an infinity. Zero-magnitude options are now exempt: see
// An earlier round blocker B4. This archetype is the reason that exemption exists.

const LINES = [
  { org: 'Marrable Bakery', item: 'sourdough loaf', items: 'loaves' },
  { org: 'Thorne Hardware', item: 'tin of primer', items: 'tins' },
  { org: 'Quintrell Nursery', item: 'tray of bedding plants', items: 'trays' },
  { org: 'Aveley Books', item: 'paperback', items: 'paperbacks' },
];
const CUTS = [10, 15, 20];
const LIFTS = [8, 12, 15];

export default {
  id: 'a13',
  name: 'Price cut against volume lift',
  group: 'money',
  desks: [1],
  tiers: ['standard'],
  stimulus: 'prose',
  answerType: 'signedDirection',
  targetSeconds: 83,

  constraints: [
    'the lift is strictly smaller than the cut, which guarantees a decrease by algebra rather than by rejection',
    'the new volume is a whole number',
    'the answer lands on two decimal places',
  ],

  errorTypes: ['omitted-component', 'sign-flip'],

  formulaText: 'new volume × cut price − old volume × old price, reported with its direction',


  // THE ESTIMATION ROUTE.
  //
  // a13 resolves at ONE significant figure in 100% of items, measured over 200. That is not a
  // weakness in the option set, it is what the archetype is: the work is establishing that
  // (1 - cut)(1 + lift) < 1 so revenue must FALL, and the arithmetic only has to be good enough
  // to pick the one decrease of roughly the right size. A candidate computing this to the penny
  // under the clock has misread which skill is being tested.
  estimate(p) {
    const price = sig2(p.price), volume = sig2(p.volume);
    const before = price * volume;
    const factor = (1 - p.cut / 100) * (1 + p.lift / 100);
    const value = before * factor - before;
    return {
      value,
      text: `${price} x ${volume} = ${before}, then x ${factor.toFixed(2)} loses about `
        + `${Math.abs(Math.round(value))}`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const line   = f.line   ?? rng.pick(LINES);
    const cut    = f.cut    ?? rng.pick(CUTS);
    const lift   = f.lift   ?? rng.pick(LIFTS.filter(l => l < cut));
    if (!(lift < cut)) return reject(diag, 'lift-not-below-cut');
    const price  = f.price  ?? roundTo(rng.float(4, 12), 2);
    // The new volume must be whole, which for an 8 or 12% lift means a multiple of 25 and for
    // 15% a multiple of 20. Enumerated from the drawn lift rather than drawn and rejected:
    // drawing freely from 150 to 350 rejected 96.9% of attempts on this one condition.
    const legalVolumes = [];
    for (let v = 150; v <= 350; v++) if ((v * (100 + lift)) % 100 === 0) legalVolumes.push(v);
    if (!legalVolumes.length) return reject(diag, 'no-legal-volume');
    const volume = f.volume ?? rng.pick(legalVolumes);

    // Integer arithmetic, not volume * 1.08: the float form returns 189.00000000000003 for a
    // volume of 175 and Number.isInteger then rejects a legal draw.
    if ((volume * (100 + lift)) % 100 !== 0) return reject(diag, 'new-volume-not-whole');
    const newVolume = volume * (100 + lift) / 100;

    const before = roundTo(volume * price, 2);
    const after  = roundTo(newVolume * price * (1 - cut / 100), 2);
    const answer = roundTo(after - before, 2);
    if (answer >= 0) return reject(diag, 'not-a-decrease');

    const dDiscountOnly = roundTo(before * (1 - cut / 100) - before, 2);   // volume ignored
    const dLiftOnly     = roundTo(before * (1 + lift / 100) - before, 2);  // discount ignored
    const dSignFlip     = -answer;

    const context = { currencySymbol: '£', magnitudeType: 'currency', zeroLabel: 'Revenue would not change' };
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dDiscountOnly, errorType: 'omitted-component',
            note: 'applied the discount to the old revenue and ignored the extra volume' },
          { value: dLiftOnly, errorType: 'omitted-component',
            note: 'applied the extra volume and ignored the discount, which gives an increase' },
          { value: dSignFlip, errorType: 'sign-flip',
            note: 'right magnitude, wrong direction' },
        ],
        filler: [
          { value: 0, kind: 'verdict', note: 'filler, the two effects do not cancel' },
        ],
        answerType: 'signedDirection',
        context: { ...context, expectedSign: -1 },
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const m = v => money(v, '£', 2);
    return {
      id: `a13#${rng.seed}`,
      archetypeId: 'a13',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${line.org} sells ${volume} ${line.items} a week at ${m(price)} each. `
            + `The price is cut by ${cut}%, and the number sold rises by ${lift}% as a result.`,
      },
      questionText: 'What happens to the weekly revenue from this line?',
      answerType: 'signedDirection',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: context,
      values: { before, after, newVolume },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `before = ${volume} × ${m(price)} = ${m(before)}`,
          `new volume = ${volume} × ${(1 + lift / 100).toFixed(2)} = ${newVolume}`,
          `after = ${newVolume} × ${m(price)} × ${(1 - cut / 100).toFixed(2)} = ${m(after)}`,
          `answer = ${m(after)} − ${m(before)} = a decrease of ${m(Math.abs(answer))}`,
        ],
      },
      targetSeconds: 83,
      params: { line, cut, lift, price, volume },
    };
  },
};
