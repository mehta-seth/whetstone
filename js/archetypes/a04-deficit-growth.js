import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';

// a04 - Fractional deficit plus headcount growth
//
// Current stock comes from the current base. The new requirement comes from the grown base.
// Buy the gap.
//
// THE BINDING CONSTRAINT, and one added. The archetype spec requires `have` and `need` to be whole
// numbers, which kills most parameter draws: it names 150 with 8% growth as legal and 145 with
// 8% as illegal. Enumerated, the legal headcounts in 80 to 200 are sparse:
//
//   1/4 + 8%  ->  100, 200 only          1/6 + 8%  ->  150 only
//   1/6 + 5%  ->  120, 180               1/5 + 8%  ->  100, 125, 150, 175, 200
//
// So the headcount is enumerated from the drawn fraction and growth rather than drawn and
// rejected. Every legal headcount is a round number, which the spec would rather avoid.
// Integrality wins; `isRound` is a generator helper, not a validator predicate.
//
// ONE CONSTRAINT ADDED. The archetype spec's fixture uses headcount 150 with a 1/5 deficit, whose
// wrong-base distractor is 162/5 = 32.4, shipped as 32. That is exactly the defect a18's own
// correction exists to remove: a fractional count no candidate would pick, reachable only by
// rounding. The requirement that `need × fraction` is also a whole number removes it. Headcount
// 125 with 8% growth gives have 100, need 135, answer 35 and a wrong-base of exactly 27, so the
// fixture is repinned there.

const KITS = [
  { org: 'Halewood Assembly', unit: { s: 'torque driver', p: 'torque drivers' }, role: 'line fitter', roles: 'line fitters' },
  { org: 'Sandbourne Care', unit: { s: 'handover tablet', p: 'handover tablets' }, role: 'support worker', roles: 'support workers' },
  { org: 'Kirkwall Ferries', unit: { s: 'deck radio', p: 'deck radios' }, role: 'deck hand', roles: 'deck hands' },
  { org: 'Ellisfield Depot', unit: { s: 'barcode scanner', p: 'barcode scanners' }, role: 'picker', roles: 'pickers' },
];
const FRACTIONS = [{ n: 1, d: 4, t: 'a quarter' }, { n: 1, d: 5, t: 'a fifth' }, { n: 1, d: 6, t: 'a sixth' }];
const GROWTHS = [5, 8, 10];

export default {
  id: 'a04',
  name: 'Fractional deficit plus headcount growth',
  group: 'averages',
  desks: [1],
  tiers: ['standard'],
  stimulus: 'prose',
  answerType: 'countWithUnit',
  targetSeconds: 83,

  constraints: [
    'the current holding and the new requirement are both whole numbers',
    'the wrong-base quantity is a whole number too, so no option is a rounded fraction',
    'all five options are distinct positive integers',
  ],

  errorTypes: ['omitted-component', 'wrong-base', 'wrong-quantity'],

  formulaText: 'grown headcount − (current headcount − its shortfall)',


  // THE ESTIMATION ROUTE.
  //
  // 83% at one significant figure. Both omitted-component distractors are ADDENDS of the answer,
  // so they are always smaller, and an estimate that gets the magnitude roughly right rules both
  // out without either subtraction being done exactly. This is also the archetype the archetype spec
  // records as pinned to sorted slot 4 in 100% of items, so the estimate is doing the work the
  // position leak would otherwise do for free, which is the honest way round.
  estimate(p) {
    const h = sig2(p.headcount);
    const have = h * (p.frac.d - p.frac.n) / p.frac.d;
    const need = h * (100 + p.growth) / 100;
    const value = need - have;
    return {
      value,
      text: `about ${Math.round(need)} needed against about ${Math.round(have)} held, so roughly `
        + `${Math.round(value)} to buy`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const kit  = f.kit  ?? rng.pick(KITS);
    const frac = f.frac ?? rng.pick(FRACTIONS);
    const growth = f.growth ?? rng.pick(GROWTHS);

    // Enumerated, not drawn. `have`, `need` and `need × fraction` must all be whole.
    const legal = [];
    for (let h = 80; h <= 200; h++) {
      if ((h * (frac.d - frac.n)) % frac.d !== 0) continue;
      if ((h * (100 + growth)) % 100 !== 0) continue;
      const need = h * (100 + growth) / 100;
      if ((need * frac.n) % frac.d !== 0) continue;
      legal.push(h);
    }
    if (!legal.length) return reject(diag, 'no-legal-headcount');
    const headcount = f.headcount ?? rng.pick(legal);

    const have = headcount * (frac.d - frac.n) / frac.d;
    const need = headcount * (100 + growth) / 100;
    const answer = need - have;
    if (answer <= 0) return reject(diag, 'answer-not-positive');

    const dNewOnly = need - headcount;                    // only the new hires covered
    const dOldOnly = headcount - have;                    // only the existing shortfall covered
    const dWrongBase = need * frac.n / frac.d;            // deficit taken off the grown headcount
    const dTotal = need;                                  // the whole requirement, not the purchase

    const set = [answer, dNewOnly, dOldOnly, dWrongBase, dTotal];
    if (!set.every(v => Number.isInteger(v) && v > 0)) return reject(diag, 'option-not-a-count');

    const context = { unit: kit.unit.s, unitPlural: kit.unit.p };
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dNewOnly, errorType: 'omitted-component',
            note: `covered only the new ${kit.roles}, ${need} − ${headcount}` },
          { value: dOldOnly, errorType: 'omitted-component',
            note: `covered only the existing shortfall, ${headcount} − ${have}` },
          { value: dWrongBase, errorType: 'wrong-base',
            note: `took ${frac.t} of the grown headcount ${need} rather than of the current ${headcount}` },
          { value: dTotal, errorType: 'wrong-quantity',
            note: 'reported the total requirement rather than the number to buy' },
        ],
        answerType: 'countWithUnit',
        context,
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `a04#${rng.seed}`,
      archetypeId: 'a04',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${kit.org} employs ${headcount} ${kit.roles}, and every one of them needs `
            + `${kit.unit.s}. At the moment ${frac.t} of the ${kit.roles} do not have one. `
            + `Headcount is due to rise by ${growth}%.`,
      },
      questionText: `How many more ${kit.unit.p} must be bought so that every ${kit.role} has one after the rise?`,
      answerType: 'countWithUnit',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: context,
      values: { have, need },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `have = ${headcount} × ${(1 - frac.n / frac.d).toFixed(4)} = ${have}`,
          `need = ${headcount} × ${(1 + growth / 100).toFixed(2)} = ${need}`,
          `answer = ${need} − ${have} = ${answer} ${kit.unit.p}`,
        ],
      },
      targetSeconds: 83,
      params: { kit, frac, growth, headcount },
    };
  },
};
