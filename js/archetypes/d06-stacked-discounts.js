import { money, roundTo, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// d06 - Stacked discounts
//
// Two discounts multiply, they do not add. Order of application is not a valid distractor because
// multiplication commutes, and the archetype spec says so.
//
// The archetype spec FLAGS THIS ONE FOR THE ALGEBRA CHECK and the flag is half right. Both single-discount
// options sit on the same quantity as the answer and differ from it by stem-printed factors, which
// is the a17 shape. What makes a17 exploitable is that solving it means summing sixteen bars off a
// chart while the attack is one subtraction; here the legitimate path is two multiplications, so
// computing the ratios costs more than answering. Measured rather than assumed: see the audit.
//
// DIVERGENCE, and it also reduces the flagged exposure. The archetype spec names both "only the larger
// applied" and "only the smaller applied". Both sit above the answer, as does the wrong-base
// option, and the added-rates option always sits below, so all four together pin the answer to
// sorted slot 2 in every item. Dropping the smaller-only option for a drawn-side filler gives two
// slots, removes one of the two same-quantity options the flag is about, and costs a distractor
// the set already carries a twin of.

const DISCOUNTS = [10, 15, 20, 25, 30];
const SHOPS = [
  { name: 'Ravensworth Outdoor', item: 'a hiking pack', first: 'the winter sale', second: 'a members card' },
  { name: 'Calder & Finch', item: 'a dining table', first: 'the clearance event', second: 'a trade account' },
  { name: 'Loxley Instruments', item: 'a microscope', first: 'the education discount', second: 'a bulk order' },
  { name: 'Pentworth Cycles', item: 'a road frame', first: 'the end-of-season sale', second: 'a club membership' },
];

export default {
  id: 'd06',
  name: 'Stacked discounts',
  group: 'percentages',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  constraints: [
    'the two discounts differ, so the two single-discount values are distinct',
    'the added-rates value separates from the answer by the product of the two rates, which at '
      + 'the smallest legal pair is 1.5 per cent and is checked rather than assumed',
    'the answer lands exactly on two decimal places',
    'the answer is not the only option sitting on a whole number of pounds',
  ],

  errorTypes: ['added-rates', 'wrong-base', 'omitted-component', 'filler'],

  formulaText: 'price x (1 - first discount) x (1 - second discount)',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const shop = f.shop ?? rng.pick(SHOPS);
    // Drawn from the legal pairs rather than drawn and rejected. The added-rates value sits
    // d1 x d2 / 100 per cent below the answer, so 10 with 15 gives 1.5% and fails the minimum
    // option gap; enumerating first rather than rejecting saved 22.8% of attempts.
    const pairs = [];
    for (const a of DISCOUNTS) for (const b of DISCOUNTS) if (a !== b && a * b / 100 >= 2.2) pairs.push([a, b]);
    const [pd1, pd2] = f.d1 !== undefined ? [f.d1, f.d2] : rng.pick(pairs);
    const d1 = pd1, d2 = pd2;

    // Exact to the penny by construction: the price in pence must clear both complements.
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const mod = 10000 / gcd((100 - d1) * (100 - d2), 10000);
    const pricePence = f.pricePence
      ?? Math.ceil(Math.round(awkward(rng, 12000, 90000, 0)) / mod) * mod;
    const answerPence = pricePence * (100 - d1) * (100 - d2) / 10000;
    if (!Number.isInteger(answerPence)) return reject(diag, 'answer-not-exact');

    const price = pricePence / 100;
    const answer = answerPence / 100;
    const dAdded = roundTo(price * (100 - d1 - d2) / 100, 2);
    // The second discount taken off the first discount's saving rather than off the reduced price.
    const dWrongBase = roundTo(price * (1 - d1 / 100) - price * (d1 / 100) * (d2 / 100), 2);
    const dLarger = roundTo(price * (100 - Math.max(d1, d2)) / 100, 2);
    if (dAdded >= answer) return reject(diag, 'added-rates-not-below');
    if (dWrongBase <= answer || dLarger <= answer) return reject(diag, 'single-discount-not-above');

    const fillerBelow = f.fillerBelow ?? (rng.next() < 0.5);
    const nearAbove = Math.min(dWrongBase, dLarger);
    const lo = fillerBelow ? Math.max(dAdded, answer / 1.85) : answer;
    const hi = fillerBelow ? answer : nearAbove;
    if (hi - lo < 0.055 * answer) return reject(diag, 'no-room-for-filler');
    const filler = f.filler ?? roundTo(lo + (hi - lo) * rng.float(0.35, 0.65), 2);
    const gapOk = (x, y) => Math.abs(x - y) >= 0.021 * Math.max(x, y);
    if (![answer, dAdded, dWrongBase, dLarger].every(v => gapOk(v, filler))) return reject(diag, 'filler-too-tight');

    const isWhole = v => Math.abs(v - Math.round(v)) < 1e-9;
    if (isWhole(answer) && ![dAdded, dWrongBase, dLarger, filler].some(isWhole)) {
      return reject(diag, 'answer-alone-on-a-whole-value');
    }

    const m = v => money(v, '\u00a3', 2);
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dAdded, errorType: 'added-rates',
            note: `added the rates to ${d1 + d2}% and took that off in one go, which is too much` },
          { value: dWrongBase, errorType: 'wrong-base',
            note: `took the ${d2}% off the ${m(roundTo(price * d1 / 100, 2))} saved rather than off the reduced price` },
          { value: dLarger, errorType: 'omitted-component',
            note: `applied only the ${Math.max(d1, d2)}% and never applied the ${Math.min(d1, d2)}%` },
        ],
        filler: [{ value: filler, note: 'filler, close enough that magnitude cannot resolve the item' }],
        answerType: 'currency', context: { currencySymbol: '\u00a3' }, rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d06#${rng.seed}`, archetypeId: 'd06', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${shop.item[0].toUpperCase()}${shop.item.slice(1)} at ${shop.name} is `
        + `listed at ${m(price)}. ${shop.first[0].toUpperCase()}${shop.first.slice(1)} takes `
        + `${d1}% off, and ${shop.second} then takes a further ${d2}% off what is left.` },
      questionText: 'What is the final price?',
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: { currencySymbol: '\u00a3' },
      values: { price, d1, d2, afterFirst: roundTo(price * (100 - d1) / 100, 2) },
      workings: { formulaText: this.formulaText, steps: [
        `after ${d1}%: ${m(price)} x ${((100 - d1) / 100).toFixed(2)} = ${m(roundTo(price * (100 - d1) / 100, 2))}`,
        `after a further ${d2}%: x ${((100 - d2) / 100).toFixed(2)} = ${m(answer)}`,
      ] },
      targetSeconds: 83,
      params: { d1, d2, fillerBelow },
    };
  },
};
