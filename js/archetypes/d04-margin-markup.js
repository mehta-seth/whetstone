import { money, roundTo, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// d04 - Margin against markup
//
// Markup is profit over COST. Margin is profit over REVENUE. Given one, find the other. The stem
// names which is which explicitly, and which is asked is visible before any arithmetic.
//
// DIVERGENCE. The archetype spec's filler is "the two averaged", which always lands between the given
// value and the answer and so fixes the sorted slot. The filler here is drawn on a side instead,
// which is what lets each visible half reach two slots rather than one. Without it the margin
// half is slot 1 in every item and the markup half is slot 5 in every item: two certainties that
// pool to a healthy-looking spread, which is the a17 midSide error.

const SELLERS = ['Halcyon Tools', 'Brightmere Supplies', 'Fenwick Instruments', 'Corvale Trading',
                 'Ashby Components', 'Rilling Marine'];

export default {
  id: 'd04',
  name: 'Margin against markup',
  group: 'money',
  desks: [1],
  tiers: ['standard', 'hard'],
  stimulus: 'prose',
  answerType: 'percentage',
  targetSeconds: 83,

  variants: { key: 'asked', visible: true },

  constraints: [
    'the margin and the markup differ by at least 4 percentage points',
    'the stem names the term it gives and the term it asks for, unambiguously',
    'the answer is reported to one decimal place, which is what the option set requires: the '
      + 'exact-1dp version of this constraint admits only two values of the given percentage in '
      + 'the margin direction and three in the markup direction, since it requires 100 plus or '
      + 'minus the given figure to divide 100000',
  ],

  errorTypes: ['margin-markup-confusion', 'inverted', 'wrong-base', 'filler'],

  formulaText: 'markup is profit over cost, margin is profit over revenue',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const seller = f.seller ?? rng.pick(SELLERS);
    const asked = f.asked ?? (rng.next() < 0.5 ? 'margin' : 'markup');
    const cost = f.cost ?? Math.round(awkward(rng, 1800, 9000, 0)) / 100;

    // Drawn on the side that is given, so the stated figure is a clean one and the derived one is
    // whatever it implies. Both directions are one step, which is the point of the item.
    const givenPct = f.givenPct ?? rng.pick([18, 22, 24, 25, 28, 32, 35, 38, 42, 45]);
    const g = givenPct / 100;
    const derived = asked === 'margin' ? g / (1 + g) : g / (1 - g);
    const answer = roundTo(derived * 100, 1);
    if (Math.abs(answer - givenPct) < 4) return reject(diag, 'too-close-to-the-given');

    // Cost as a share of revenue, which is the complement of the margin and the single most
    // common misread of the term.
    // Cost as a share of the selling price, the single most common misread of the term. It is
    // the complement of the margin, so it is large where the margin is small.
    const complement = asked === 'margin' ? roundTo(100 / (1 + g), 1) : roundTo(100 - givenPct, 1);
    // The other formula applied to the given number, which is the arithmetic slip rather than the
    // definitional one.
    const swapped = asked === 'margin' ? roundTo(g / (1 - g) * 100, 1) : roundTo(g / (1 + g) * 100, 1);

    const fixed = [givenPct, complement, swapped];
    if (new Set([answer, ...fixed]).size !== 4) return reject(diag, 'option-collision');

    const below = fixed.filter(v => v < answer).sort((a, b) => b - a);
    const above = fixed.filter(v => v > answer).sort((a, b) => a - b);
    const fillerBelow = f.fillerBelow ?? (rng.next() < 0.5);
    const lo = fillerBelow ? (below.length ? below[0] : Math.max(0.5, answer * 0.6)) : answer;
    const hi = fillerBelow ? answer : (above.length ? above[0] : answer * 1.5);
    if (hi - lo < 1.2) return reject(diag, 'no-room-for-filler');
    const filler = f.filler ?? roundTo(lo + (hi - lo) * rng.float(0.35, 0.65), 1);
    const gapOk = (x, y) => Math.abs(x - y) >= 0.021 * Math.max(x, y);
    if (![answer, ...fixed].every(v => gapOk(v, filler))) return reject(diag, 'filler-too-tight');

    const revenue = roundTo(asked === 'margin' ? cost * (1 + g) : cost / (1 - g), 2);
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: givenPct, errorType: 'margin-markup-confusion',
            note: `repeated the ${asked === 'margin' ? 'markup' : 'margin'} it was given, which is the other term` },
          { value: complement, errorType: 'inverted',
            note: `gave the ${asked === 'margin' ? 'cost' : 'profit'} as a share of the wrong total, which is the complement rather than the ratio asked for` },
          { value: swapped, errorType: 'wrong-base',
            note: `used the other formula on the given figure, dividing by the wrong base` },
        ],
        filler: [{ value: filler, note: 'filler, close enough that magnitude cannot resolve the item' }],
        answerType: 'percentage', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d04#${rng.seed}`, archetypeId: 'd04', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${seller} buys a unit for ${money(cost, '\u00a3', 2)}. It works to a `
        + `${asked === 'margin' ? 'markup' : 'margin'} of ${givenPct}%, where `
        + `${asked === 'margin' ? 'markup is profit as a percentage of cost' : 'margin is profit as a percentage of the selling price'}.` },
      questionText: asked === 'margin'
        ? 'What is its margin, that is, profit as a percentage of the selling price?'
        : 'What is its markup, that is, profit as a percentage of cost?',
      answerType: 'percentage',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: {},
      values: { cost, revenue, givenPct, asked },
      workings: { formulaText: this.formulaText, steps: [
        `cost ${money(cost, '\u00a3', 2)}, selling price ${money(revenue, '\u00a3', 2)}, profit ${money(roundTo(revenue - cost, 2), '\u00a3', 2)}`,
        asked === 'margin'
          ? `margin = profit / selling price = ${givenPct}% / (100% + ${givenPct}%)`
          : `markup = profit / cost = ${givenPct}% / (100% - ${givenPct}%)`,
        `answer = ${answer}%`,
      ] },
      targetSeconds: 83,
      params: { asked, givenPct, fillerBelow },
    };
  },
};
