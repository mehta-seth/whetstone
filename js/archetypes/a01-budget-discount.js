import { money, awkward, roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a01 - Budget allocation with a blanket discount
//
// All arithmetic runs on integers. Prices are held in pence and the discount as
// an integer percentage, so `fixed`, `remainder` and the quotient are exact
// rationals rather than floats. This matters: the whole item turns on the
// fractional part of the quotient sitting inside a narrow band, and a float
// error of 1e-13 in the wrong place silently changes which items are accepted.
//
// Let T = qtyA*priceA + qtyB*priceB in pence, k = 100 - discount.
//   fixed     = T*k/100 pence
//   remainder = budget - fixed = (100*budgetPence - T*k) / 100 pence
//   quotient  = remainder / (unitPrice * k/100) = (100*budgetPence - T*k) / (unitPence*k)
// Numerator and denominator are both integers, so the floor is exact.

const BUYERS = [
  { name: 'Priya',   subject: 'she', possessive: 'her' },
  { name: 'Callum',  subject: 'he',  possessive: 'his' },
  { name: 'Ngozi',   subject: 'she', possessive: 'her' },
  { name: 'Tomas',   subject: 'he',  possessive: 'his' },
  { name: 'Meera',   subject: 'she', possessive: 'her' },
  { name: 'Idris',   subject: 'he',  possessive: 'his' },
];

const KITS = [
  { role: 'stationery purchasing', collective: 'stationery',
    a: { s: 'ring binder', p: 'ring binders' },
    b: { s: 'marker pack', p: 'marker packs' },
    u: { s: 'sticky note pad', p: 'sticky note pads' } },
  { role: 'the lab consumables order', collective: 'lab stock',
    a: { s: 'pipette rack', p: 'pipette racks' },
    b: { s: 'reagent bottle', p: 'reagent bottles' },
    u: { s: 'glass slide', p: 'glass slides' } },
  { role: 'the print room order', collective: 'print stock',
    a: { s: 'toner cartridge', p: 'toner cartridges' },
    b: { s: 'guillotine blade', p: 'guillotine blades' },
    u: { s: 'index divider', p: 'index dividers' } },
  { role: 'the canteen supply run', collective: 'canteen stock',
    a: { s: 'syrup bottle', p: 'syrup bottles' },
    b: { s: 'filter box', p: 'filter boxes' },
    u: { s: 'paper cup sleeve', p: 'paper cup sleeves' } },
];

const DISCOUNTS = [10, 15, 20, 25];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const lastWord = s => s.split(' ').pop();

// A price ending in exact whole pounds reads oddly beside its neighbours and
// weakens the discount step, so pence are always non-zero.
function price(rng, lo, hi) {
  for (let i = 0; i < 20; i++) {
    const v = roundTo(rng.float(lo, hi), 2);
    if (Math.round(v * 100) % 100 !== 0) return v;
  }
  return roundTo(rng.float(lo, hi), 2) + 0.05;
}

export default {
  id: 'a01',
  name: 'Budget allocation with a blanket discount',
  group: 'money',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'countWithUnit',
  targetSeconds: 83,

  constraints: [
    'quotient lands between .3 and .8 above an integer',
    'fixed spend leaves at least 40% of the budget',
    'answer is at least 20, so the count feels plausible',
    'all five options are distinct positive integers',
  ],

  errorTypes: ['partial-discount', 'omitted-component', 'round-up'],

  formulaText: 'floor((budget − discounted fixed spend) ÷ discounted unit price)',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const p = {
      priceA:    f.priceA    ?? price(rng, 12, 40),
      priceB:    f.priceB    ?? price(rng, 25, 60),
      unitPrice: f.unitPrice ?? price(rng, 0.80, 2.20),
      discount:  f.discount  ?? rng.pick(DISCOUNTS),
      qtyA:      f.qtyA      ?? rng.int(3, 5),
      qtyB:      f.qtyB      ?? rng.int(2, 3),
      buyer:     f.buyer     ?? rng.pick(BUYERS),
      kit:       f.kit       ?? rng.pick(KITS),
    };

    const Pa = Math.round(p.priceA * 100);
    const Pb = Math.round(p.priceB * 100);
    const Pu = Math.round(p.unitPrice * 100);
    const k  = 100 - p.discount;
    const T  = p.qtyA * Pa + p.qtyB * Pb;       // undiscounted fixed spend, pence

    // The budget is drawn last, from the interval constraint 2 leaves open, so
    // "fixed spend leaves at least 40% of the budget" holds by construction
    // rather than by rejection. Nothing about the stated 150 to 400 range
    // changes. This is the same conditional distribution rejection sampling
    // would reach, arrived at without burning 20% of every draw, and it also
    // makes remainder > 0 automatic.
    if (f.budget !== undefined) {
      p.budget = f.budget;
    } else {
      const lo = Math.max(150, Math.ceil(T * k / 60) / 100);
      if (lo > 400) return reject(diag, 'budget-infeasible');
      p.budget = awkward(rng, lo, 400, 2);
    }

    const B = Math.round(p.budget * 100);       // budget, pence
    const num = 100 * B - T * k;                // remainder, in pence * 100
    const den = Pu * k;                         // discounted unit price, in pence * 100

    if (num <= 0) return reject(diag, 'remainder-positive');

    const quotient = num / den;
    const answer   = Math.floor(quotient);
    const frac     = quotient - answer;

    // Constraint 1. The whole item is the floor, so the quotient has to sit far
    // enough above an integer that rounding up is tempting. At 96.04 the
    // round-up distractor is dead and the item is free.
    if (frac < 0.30 || frac > 0.80) return reject(diag, 'quotient-band');

    // Constraint 2. Fixed spend must not eat the budget.
    // fixed (pounds) = T*k/10000, budget (pounds) = B/100, so fixed <= 0.6*budget
    // reduces to T*k <= 60*B with everything still integral.
    if (T * k > 60 * B) return reject(diag, 'fixed-share');

    // Constraint 3.
    if (answer < 20) return reject(diag, 'answer-floor');

    const fixedPence     = (T * k) / 100;
    const remainderPence = num / 100;

    // Distractors. Each is the same expression with one named step done wrong.
    const dPartial  = Math.floor(num / (100 * Pu));                    // discount never reached the unit price
    const dRoundUp  = Math.ceil(quotient);

    // THE ZERO-ARITHMETIC EXPLOIT, AND WHY THE DISTRACTOR SET CHANGED.
    //
    // Measured before this change: 100% of items were answerable with no arithmetic at all. The
    // round-up distractor is answer + 1, every other option was separated by much more than one
    // unit, so exactly one pair of consecutive integers sat in the set and the answer was always its
    // LOWER member. Scan, take the lower, score 100%. a01 carries the warmup tier, so it is in near
    // constant rotation and this was the most exposed defect in the library.
    //
    // THE OBVIOUS REPAIR WAS MEASURED AND IS DEAD. Both the strategic audit and the an earlier round brief
    // proposed a second adjacent pair, on the arithmetic that a scanner facing two pairs must then
    // guess and scores 50%. It scores 100%. With `no-discount` and `partial-discount` BOTH below the
    // answer and `round-up` the only thing above it, the answer's pair is always the highest pair in
    // the set, so "take the lower member of the highest pair" is deterministic. An earlier round measured
    // this design at 50% because it scored a scanner choosing randomly between pairs; a scanner that
    // prefers the higher pair was never scored. Same shape as b02, where sampling both perturbation
    // directions was signed off as removing a leak and had in fact hidden it. See
    // test/probes/s7d1designs.mjs for the full battery of seven rules against five candidate designs.
    //
    // TWO CHANGES, and together they measure 35% against a 20% baseline, or 1.75x.
    //
    // ONE. `no-discount` becomes `omitted-component`, the fixed purchases ignored entirely, which
    // lands ABOVE the answer rather than below it. That is what gives the set a second far-side
    // option so the spare slot can be anchored either side of the answer, which is the only way to
    // break the ordering cue. The family traded is the cheaper of the two: `no-discount` and
    // `partial-discount` both test the discount BASE and the former is the cruder version of the
    // latter, while `omitted-component` is one of the three highest-frequency families in the format
    // per the archetype spec and was not otherwise represented here.
    //
    // TWO. `round-up` is emitted in half of items rather than all of them, replaced elsewhere by a
    // same-side value that is adjacent to nothing. This is priced honestly: a01 is the library's only
    // source of `round-up`, so the dashboard now ranks that family on half the data. It is worth it,
    // and the reason is the operator's rather than mine. The archetype spec says of a01 that "the floor is
    // the whole item", which reads as an argument against removing the floor distractor. It is an
    // argument FOR it: at a 100% exploit the floor was live in ZERO items, because a scanner never
    // computes it. Half is strictly better than none.
    const dOmitFixed = Math.floor((100 * B) / den);      // ignored the fixed purchases entirely
    // BOTH DRAWS ARE INJECTABLE. 9.4 is explicit that a fixture must pin every draw the arithmetic
    // depends on, and names a17's fixture as the cautionary case for leaving a subsidiary draw to the
    // rng. These two decide the option set, so they are forced parameters like any other.
    const keepRoundUp = f.keepRoundUp ?? (rng.next() < 0.5);
    // The decoy sits one unit from the whole-budget figure when placed above, and 9.1 caps a filler
    // at 2x the answer, so above-placement is only legal where that figure is close enough. Checked
    // here and named, rather than left to surface as an anonymous option-set rejection.
    const canPlaceAbove = (dOmitFixed + 1) <= 2 * answer;
    const decoyAbove = (f.decoyAbove ?? (rng.next() < 0.5)) && canPlaceAbove;

    if (dPartial <= 0 || dOmitFixed <= 0) return reject(diag, 'option-positive');
    // The omitted-fixed value must clear the answer, and clear the round-up option too where that is
    // present, or it is not a far-side option and the whole point of the change is lost.
    if (dOmitFixed <= dRoundUp + 1) return reject(diag, 'omit-fixed-not-far-side');

    const unitPlural   = lastWord(p.kit.u.p);
    const unitSingular = lastWord(p.kit.u.s);
    const context = { unit: unitSingular, unitPlural };

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dPartial, errorType: 'partial-discount',
            note: `discounted the fixed purchases but not the ${unitPlural}: floor(${money(remainderPence / 100, '£', 2)} ÷ ${money(p.unitPrice, '£', 2)})` },
          { value: dOmitFixed, errorType: 'omitted-component',
            note: 'ignored the fixed purchases entirely and spent the whole budget on '
              + unitPlural },
          ...(keepRoundUp
            ? [{ value: dRoundUp, errorType: 'round-up', note: 'rounded up instead of down' }]
            : [{ value: answer - 4, errorType: 'filler',
                note: 'filler, a count below the answer that no single step produces' }]),
        ],
        // THE SPARE SLOT IS ANCHORED ON A DRAWN SIDE. Placed one unit from an option ABOVE the
        // answer or one unit from an option BELOW it, so the decoy pair is sometimes the highest
        // pair in the set and sometimes the lowest. Without the draw, "take the lower member of the
        // highest pair" reads the answer off in every item. The anchor is never the answer's own
        // neighbour, because two pairs sharing a value make a run of three and "take the lowest of
        // the run" then returns to 100%, which an earlier round measured.
        filler: [
          { value: decoyAbove ? dOmitFixed + 1 : dPartial - 1,
            note: 'filler, a near miss on '
              + (decoyAbove ? 'the whole-budget figure' : 'the undiscounted unit price') },
        ],
        answerType: 'countWithUnit',
        context,
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const m = v => money(v, '£', 2);
    return {
      id: `a01#${rng.seed}`,
      archetypeId: 'a01',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${p.buyer.name} handles ${p.kit.role} and ${p.buyer.possessive} budget is ${m(p.budget)}. `
            + `${cap(p.kit.a.p)} are ${m(p.priceA)} each, ${p.kit.b.p} ${m(p.priceB)}, `
            + `${p.kit.u.p} ${m(p.unitPrice)}. All ${p.kit.collective} is ${p.discount}% off.`,
      },
      questionText: `If ${p.buyer.name} buys ${p.qtyA} ${p.kit.a.p} and ${p.qtyB} ${p.kit.b.p}, `
                  + `how many ${p.kit.u.p} can ${p.buyer.subject} buy?`,
      answerType: 'countWithUnit',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: context,
      values: {
        fixed: roundTo(fixedPence / 100, 4),
        remainder: roundTo(remainderPence / 100, 4),
        quotient: roundTo(quotient, 4),
      },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `fixed = ${p.qtyA} × ${m(p.priceA)} × ${(k / 100).toFixed(2)} + ${p.qtyB} × ${m(p.priceB)} × ${(k / 100).toFixed(2)} = ${m(fixedPence / 100)}`,
          `remainder = ${m(p.budget)} − ${m(fixedPence / 100)} = ${m(remainderPence / 100)}`,
          `discounted unit price = ${m(p.unitPrice)} × ${(k / 100).toFixed(2)} = ${money(den / 10000, '£', 4)}`,
          `quotient = ${m(remainderPence / 100)} ÷ ${money(den / 10000, '£', 4)} = ${quotient.toFixed(4)}`,
          `answer = floor(${quotient.toFixed(4)}) = ${answer} ${unitPlural}`,
        ],
      },
      targetSeconds: 83,
      params: p,
    };
  },
};
