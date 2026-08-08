import { money, awkward, roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';

// d16 - Dividing in a ratio
//
// TWO CONSTRAINTS the archetype spec DOES NOT STATE, and the first is not a corner case. `wrong-part` is
// another share and `ignored-ratio` is the total split equally, so they collide whenever any part
// equals the sum of the parts over three. "No common factor" does not prevent it: 2:3:4 sums to 9
// and its middle part is exactly a third of it, and so do 3:5:7 and 2:5:8. It is most small
// three-part ratios rather than one bad case, which is why it is enforced rather than left to the
// option-collision check.
//
// The stem-ratio shape is present and expected to be harmless. `wrong-denominator` is the answer
// times the sum of the parts over three, and the sum is printed, so the pair stands in a stem-known
// ratio. But the legitimate path is one multiplication and one division, so computing the ratio
// costs as much as answering, which is d06's documented verdict on the same shape. Measured rather
// than assumed.
const POTS = [
  { org: 'the Pentland estate', thing: 'the annual surplus', who: ['the tenants', 'the trust', 'the repairs fund'] },
  { org: 'Cavendish Partners', thing: 'the quarterly profit', who: ['Rill', 'Okonjo', 'Vasey'] },
  { org: 'the Marlbrook appeal', thing: 'the money raised', who: ['the hospice', 'the school', 'the boat club'] },
];

export default {
  id: 'd16',
  name: 'Dividing in a ratio',
  group: 'rates',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  constraints: [
    'three parts with no common factor',
    'the sum of the parts divides the total exactly',
    'no part equals the sum of the parts over three, or the equal split collides with a share',
    'the asked part is not the largest, so the answer is not simply the biggest share',
  ],

  errorTypes: ['wrong-denominator', 'wrong-part', 'wrong-quantity', 'ignored-ratio'],

  formulaText: 'total x the asked part / the sum of the parts',


  // THE ESTIMATION ROUTE.
  //
  // 69% of d16's items resolve at one significant figure. The item is one division and one
  // multiplication, and every distractor is a different WRONG DENOMINATOR or a different share, so
  // they sit whole factors apart rather than close together.
  //
  // The route names the sum of the parts out loud because that is the entire trap: the commonest error
  // is dividing by the NUMBER of parts, three, rather than by their sum. Stating "one share is about
  // total over sum" is the correction, and it is a correction no amount of arithmetic accuracy
  // supplies on its own.
  // The total is common to every share, so it is not rounded. See the rule recorded in c01.
  estimate(p, v) {
    const unit = p.total / v.sum;
    const value = unit * p.partValues[p.askIdx];
    return {
      value,
      text: `${p.total} over the ${v.sum} parts is ${Math.round(unit)} each, `
        + `times ${p.partValues[p.askIdx]} is about ${Math.round(value)}`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const pot = f.pot ?? rng.pick(POTS);
    const parts = f.parts ?? (() => {
      const p = [rng.int(2, 5), rng.int(3, 8), rng.int(4, 11)].sort((a, b) => a - b);
      return p;
    })();
    if (parts.length !== 3) return reject(diag, 'wrong-part-count');
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    if (parts.reduce((a, b) => gcd(a, b)) !== 1) return reject(diag, 'parts-share-a-factor');
    if (new Set(parts).size !== 3) return reject(diag, 'parts-not-distinct');
    const sum = parts.reduce((a, b) => a + b, 0);
    // The collision that makes the equal split equal a share.
    if (parts.some(p => p * 3 === sum)) return reject(diag, 'a-part-is-a-third-of-the-sum');

    // The total is a multiple of the sum so every share is exact, and awkward so it is not
    // eyeballable.
    const unit = f.unit ?? Math.round(awkward(rng, 400, 2600, 0));
    const total = unit * sum;
    if (total < 4000 || total > 90000) return reject(diag, 'total-out-of-band');

    // The asked part is not the largest, so "pick the biggest share" is not the answer.
    const askIdx = f.askIdx ?? rng.int(0, 1);
    const asked = parts[askIdx];
    const shares = parts.map(p => unit * p);
    const answer = roundTo(shares[askIdx], 2);

    const otherIdx = [0, 1, 2].filter(i => i !== askIdx)[rng.int(0, 1)];
    const dWrongPart = roundTo(shares[otherIdx], 2);
    const dEqual = roundTo(total / 3, 2);
    const dWrongDenom = roundTo(total * asked / 3, 2);
    const gapPair = [0, 1, 2].filter(i => i !== askIdx);
    const dGap = roundTo(Math.abs(shares[gapPair[0]] - shares[gapPair[1]]), 2);

    const vals = [answer, dWrongPart, dEqual, dWrongDenom, dGap];
    if (new Set(vals.map(v => v.toFixed(2))).size !== 5) return reject(diag, 'option-collision');

    const m = v => money(v, '\u00a3', 0);
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dWrongDenom, errorType: 'wrong-denominator',
            note: `divided by the number of parts rather than by their sum, so by 3 instead of ${sum}` },
          { value: dWrongPart, errorType: 'wrong-part', note: `gave ${pot.who[otherIdx]}'s share instead` },
          { value: dGap, errorType: 'wrong-quantity', note: 'gave the difference between the other two shares' },
          { value: dEqual, errorType: 'ignored-ratio', note: 'split the money equally and ignored the ratio' },
        ],
        answerType: 'currency', context: { currencySymbol: '\u00a3' }, rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d16#${rng.seed}`, archetypeId: 'd16', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${m(total)} from ${pot.thing} at ${pot.org} is to be divided between `
        + `${pot.who[0]}, ${pot.who[1]} and ${pot.who[2]} in the ratio ${parts.join(':')}.` },
      questionText: `How much does ${pot.who[askIdx]} receive?`,
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: { currencySymbol: '\u00a3' },
      values: { sum, unit: m(unit), shares: shares.map(v => m(v)).join(' / ') },
      workings: { formulaText: this.formulaText, steps: [
        `the parts sum to ${sum}, so one part is ${m(total)} / ${sum} = ${m(unit)}`,
        `answer = ${asked} x ${m(unit)} = ${m(answer)}`,
      ] },
      targetSeconds: 83,
      // `total` and numeric `parts` added for the estimation route. `parts` was a joined
      // string, which a route would have to parse, and the total was not carried at all.
      params: { parts: parts.join(':'), askIdx, partValues: parts, total },
    };
  },
};
