import { money, roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a20 - Reverse percentage
//
// Generated backwards. The archetype spec requires the original price to land on a clean
// 2dp value, which is a condition on the original rather than on the sale price,
// so the original is drawn first and the sale price derived from it. In pence,
// original * (100 - d) must be divisible by 100, which makes the original a
// multiple of 100/gcd(100-d, 100).
//
// One inconsistency in the archetype spec resolved here: the parameter list offers
// discounts from {20, 25, 30, 35, 40} while constraint 1 requires the discount to
// be at least 25%. 20 is dropped, since the constraint is the operative statement
// and a 20% discount puts the multiply-back distractor too close to the answer.

const DISCOUNTS = [25, 30, 35, 40];
const SHOPS = [
  { name: 'Halcyon Audio',  item: 'a turntable',        sale: 'the winter sale' },
  { name: 'Perrin Cycles',  item: 'a touring frame',    sale: 'the end of season sale' },
  { name: 'Ludlow Optics',  item: 'a pair of binoculars', sale: 'the clearance' },
  { name: 'Ashgrove Tools', item: 'a mitre saw',        sale: 'the trade sale' },
];

const gcd = (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; };

// The archetype spec's OWN FIXTURE PARAMETERS ARE NOW ILLEGAL, and formula() exists to keep
// their arithmetic pinned anyway, which is the spec's route and a12's precedent. At a final
// price of 494.00 and a 35% discount the answer is 760.00 and the four distractors are 666.90,
// 172.90 and 1,411.43, so the answer is the ONLY option with an empty fractional part and "pick
// the one with no pence" names it without arithmetic. An earlier round made that a central check in
// validate, which rejects these parameters at 0.4% of attempts. The arithmetic is unchanged and
// still worth pinning; only the option set it produces is inadmissible.
export function formula({ finalPrice, discount }) {
  const k = 100 - discount;
  const answer = Math.round(finalPrice * 10000 / k) / 100;
  return {
    answer,
    multiplyBack: Math.round(finalPrice * (100 + discount)) / 100,
    wrongOperation: Math.round(finalPrice * discount) / 100,
    wrongBase: Math.round(finalPrice * 10000 / discount) / 100,
  };
}

export default {
  id: 'a20',
  name: 'Reverse percentage',
  group: 'percentages',
  desks: [1],
  tiers: ['warmup'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  constraints: [
    'discount is at least 25%, so the multiply-back-up distractor separates clearly',
    'the original price lands exactly on 2dp',
    'final price divided by the rate is at least 1.5 times the answer',
    'the filler complement produces an option within 2x of the answer',
  ],

  errorTypes: ['multiply-back', 'wrong-operation', 'wrong-base'],

  formulaText: 'sale price ÷ (1 − discount)',
  formula,

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const d = f.discount ?? rng.pick(DISCOUNTS);
    if (d < 25) return reject(diag, 'discount-floor');
    const k = 100 - d;

    // Original price in pence, a multiple of the modulus that keeps the sale
    // price exact to the penny.
    const mod = 100 / gcd(k, 100);
    let originalP;
    if (f.finalPrice !== undefined) {
      originalP = Math.round(f.finalPrice * 10000 / k);
    } else {
      const lo = Math.ceil(20000 / mod), hi = Math.floor(120000 / mod);
      originalP = rng.int(lo, hi) * mod;
    }
    if (originalP % mod !== 0) return reject(diag, 'original-not-clean');

    const finalP = originalP * k / 100;
    if (!Number.isInteger(finalP)) return reject(diag, 'final-not-clean');

    const answer = originalP / 100;
    const final = finalP / 100;

    if ((final / (d / 100)) / answer < 1.5) return reject(diag, 'wrong-base-too-close');

    const dBack   = roundTo(final * (1 + d / 100), 2);   // multiplied back up
    const dTakeOff = roundTo(final * (d / 100), 2);      // took the discount off the sale price
    const dRate   = roundTo(final / (d / 100), 2);       // divided by the rate, not its complement

    const comp = f.fillerComplement ?? rng.pick(DISCOUNTS.filter(x => x !== d).map(x => 100 - x));
    const fNear = roundTo(final / (comp / 100), 2);      // a nearby wrong complement

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dBack,    errorType: 'multiply-back',   note: `multiplied back up: ${money(final)} × ${(1 + d / 100).toFixed(2)}` },
          { value: dTakeOff, errorType: 'wrong-operation', note: `took ${d}% off the sale price instead of reversing it` },
          { value: dRate,    errorType: 'wrong-base',      note: `divided by the discount rate rather than its complement: ${money(final)} ÷ ${(d / 100).toFixed(2)}` },
        ],
        filler: [
          { value: fNear, note: `filler, divided by a nearby wrong complement of ${(comp / 100).toFixed(2)}` },
        ],
        answerType: 'currency',
        context: { currencySymbol: '£' },
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const shop = f.shop ?? rng.pick(SHOPS);
    return {
      id: `a20#${rng.seed}`,
      archetypeId: 'a20',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `In ${shop.sale}, ${shop.name} is selling ${shop.item} at ${d}% off the usual price. `
            + `The sale price is ${money(final, '£', 2)}.`,
      },
      questionText: `What was the usual price before the discount?`,
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: { currencySymbol: '£' },
      values: { salePrice: final, complement: k / 100 },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `complement = 1 − ${(d / 100).toFixed(2)} = ${(k / 100).toFixed(2)}`,
          `answer = ${money(final, '£', 2)} ÷ ${(k / 100).toFixed(2)} = ${money(answer, '£', 2)}`,
        ],
      },
      targetSeconds: 83,
      params: { finalPrice: final, discount: d, fillerComplement: comp, shop },
    };
  },
};
