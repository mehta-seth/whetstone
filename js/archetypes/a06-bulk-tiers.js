import { money, roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a06 - Per-unit cost across bulk tiers
//
// Divide every tier. The largest is deliberately not the cheapest.
//
// ONE CHANGE to which tiers tie. The archetype spec requires exactly two non-winning tiers to tie on
// per-unit cost, and its fixture ties the 80 and the 250, but 250 is also the largest tier and
// therefore already carries the `assumed-bulk-cheapest` derivation. That leaves one tier holding
// two derivations and another holding none. The two non-extreme non-winners are tied instead,
// which always exist: with five tiers and the winner at position 2, 3 or 4, exactly two
// non-winning non-extreme positions remain. All four procedures then land on four distinct tiers.
//
// Unit costs carry three decimal places and every quantity is a multiple of ten, so each tier
// price is an exact number of pence and the tie is exact rather than a rounding artefact.
//
// Slots 1 and 5 of the option list are unreachable, because the archetype spec requires the winner to be
// neither the smallest nor the largest tier and the options read in quantity order. That is the
// archetype's own constraint rather than a leak.

const GOODS = [
  { org: 'Wickham Supplies', unit: { s: 'cable tie', p: 'cable ties' }, pack: 'box' },
  { org: 'Marlowe Catering', unit: { s: 'napkin', p: 'napkins' }, pack: 'pack' },
  { org: 'Stourfield Vets', unit: { s: 'syringe', p: 'syringes' }, pack: 'carton' },
  { org: 'Denholm Signs', unit: { s: 'blank badge', p: 'blank badges' }, pack: 'sleeve' },
];

export default {
  id: 'a06',
  name: 'Per-unit cost across bulk tiers',
  group: 'comparison',
  desks: [1],
  tiers: ['warmup'],
  stimulus: 'prose',
  answerType: 'label',
  targetSeconds: 83,

  constraints: [
    'the winner is neither the smallest nor the largest tier',
    'exactly two non-winning tiers tie on per-unit cost, and they are the two non-extreme ones',
    'the spread between best and worst per-unit cost is between 5% and 12%, so estimation cannot resolve it',
    'every tier price is an exact number of pence',
  ],

  errorTypes: ['assumed-bulk-cheapest', 'checked-extremes-only', 'partial-check'],

  formulaText: 'price ÷ quantity for every tier, lowest wins',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const goods = f.goods ?? rng.pick(GOODS);

    // Five ascending quantities, all multiples of ten so that a three-decimal unit cost gives an
    // exact price in pence.
    const quantities = f.quantities ?? (() => {
      const q = [rng.int(4, 5) * 10, rng.int(7, 9) * 10, rng.int(11, 14) * 10,
                 rng.int(18, 22) * 10, rng.int(24, 28) * 10];
      return q;
    })();
    if (quantities.length !== 5) return reject(diag, 'tier-count');
    if (!quantities.every((v, i) => i === 0 || v > quantities[i - 1])) return reject(diag, 'not-ascending');
    if (!quantities.every(q => q % 10 === 0)) return reject(diag, 'quantity-not-round');

    const winner = f.winner ?? rng.int(1, 3);                 // never position 0 or 4
    const others = [1, 2, 3].filter(i => i !== winner);       // the two non-extreme non-winners
    if (others.length !== 2) return reject(diag, 'tie-pair');

    // Per-unit costs in thousandths, so the tie is exact.
    const base = f.base ?? rng.int(180, 260);
    // The spread is drawn from the thousandths that put the best-to-worst ratio inside the 5 to
    // 12% band, which scales with the base. A fixed 6 to 11 range rejected 86% of attempts,
    // because at a base of 260 even 11 thousandths is only 4.2%.
    const spreadLo = Math.ceil(0.05 * base), spreadHi = Math.floor(0.12 * base);
    if (spreadHi < spreadLo + 3) return reject(diag, 'spread-window');
    const spread = f.spread ?? rng.int(spreadLo, spreadHi);
    const worst = base + spread;
    if (worst / base < 1.05 || worst / base > 1.12) return reject(diag, 'spread-band');

    const tieCost = f.tieCost ?? base + rng.int(1, spread - 1);
    const smallCost = worst;                                  // the smallest tier is the dearest
    const largeCost = f.largeCost ?? base + rng.int(1, spread - 1);
    const costs = [];
    costs[0] = smallCost;
    costs[4] = largeCost;
    costs[winner] = base;
    for (const i of others) costs[i] = tieCost;
    if (new Set([base, tieCost, smallCost, largeCost]).size !== 4) return reject(diag, 'cost-collision');
    if (Math.max(...costs) / Math.min(...costs) > 1.12) return reject(diag, 'spread-band');
    if (Math.min(...costs) !== base) return reject(diag, 'winner-not-cheapest');

    // Price in pence is (quantity / 10) x cost-in-thousandths, which is an integer for every
    // multiple-of-ten quantity, so exactness holds by construction rather than by rejection.
    const pence = quantities.map((q, i) => (q / 10) * costs[i]);
    if (!pence.every(Number.isInteger)) return reject(diag, 'price-not-exact-pence');
    const prices = pence.map(p => roundTo(p / 100, 2));

    const label = i => `${quantities[i]} for ${money(prices[i], '£', 2)}`;
    const m = v => money(v, '£', 2);
    const per = i => (costs[i] / 1000).toFixed(4);

    let options;
    try {
      options = assemble({
        correct: { value: `t${winner}`, display: label(winner), sortKey: winner },
        distractors: [
          { value: 't4', display: label(4), sortKey: 4, errorType: 'assumed-bulk-cheapest',
            note: `took the largest tier on the assumption that bulk is cheapest, at ${per(4)} each` },
          { value: 't0', display: label(0), sortKey: 0, errorType: 'checked-extremes-only',
            note: `took the smallest tier, which is in fact the dearest at ${per(0)} each` },
          { value: `t${others[0]}`, display: label(others[0]), sortKey: others[0], errorType: 'partial-check',
            note: `stopped at ${per(others[0])} each, which ties with the ${quantities[others[1]]} tier` },
          { value: `t${others[1]}`, display: label(others[1]), sortKey: others[1], errorType: 'partial-check',
            note: `stopped at ${per(others[1])} each, which ties with the ${quantities[others[0]]} tier` },
        ],
        answerType: 'label',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `a06#${rng.seed}`,
      archetypeId: 'a06',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${goods.org} sells ${goods.unit.p} in five ${goods.pack} sizes: `
            + quantities.map((q, i) => `${q} for ${m(prices[i])}`).join(', ') + '.',
      },
      questionText: `Which ${goods.pack} size gives the lowest price per ${goods.unit.s}?`,
      answerType: 'label',
      correct: { value: `t${winner}`, display: label(winner) },
      options,
      optionContext: {},
      // Read by the audit's column-correlation diagnostic, which otherwise only sees tables.
      correlation: {
        keys: quantities.map((_, i) => `t${i}`),
        columns: { Quantity: quantities.slice(), Price: prices.slice() },
      },
      values: Object.fromEntries(quantities.map((q, i) => [`per_${q}`, roundTo(costs[i] / 1000, 4)])),
      workings: {
        formulaText: this.formulaText,
        steps: [
          ...quantities.map((q, i) => `${q} for ${m(prices[i])} = ${per(i)} each`
            + (i === winner ? '   <- lowest' : '')),
          `answer: the ${quantities[winner]} ${goods.pack}`,
        ],
      },
      targetSeconds: 83,
      params: { goods, quantities, winner, costs },
    };
  },
};
