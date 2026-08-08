import { money } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { tableSpec } from '../lib/table.js';

// a18 - Solving backwards for unknown units
//
// Strip every known contribution from the stated total, then divide the residue by the
// per-unit profit. Warranty counts are independent of unit counts, which is the
// disorienting part and the reason the table shows them as separate columns.
//
// Generated backwards, as the archetype spec requires: the answer is chosen first and the stated
// total is set from it. Forwards generation cannot hit an integer answer reliably.
//
// ---------------------------------------------------------------------------------
// Two of the archetype spec's stated parameter ranges collapse to single values under its own
// constraints. Recorded rather than reinterpreted, the same way an earlier round recorded a20's
// discount range.
//
// FIRST, profit2 is pinned to 20%. The constraint says bonus2 = profit2 / 2, warrantyPct
// runs 8 to 10% and profitPct runs 20 to 25%. So profit2 / 2 must land in [8, 10], giving
// profit2 in [16, 20], and intersecting with [20, 25] leaves exactly 20. bonus2 is therefore
// always 10%.
//
// SECOND, profit1 cannot be 20% either, or the wrong-rate distractor equals the answer, and
// it cannot be 21 or 23. That distractor is residue / (p2 * profit1), which needs
// u2 * profit2 / profit1 to be a whole number. With profit2 = 20 and the answer in a
// plausible 10 to 22 range:
//
//   profit1 21%  ->  u2 = 21 only
//   profit1 22%  ->  u2 = 11 or 22
//   profit1 23%  ->  no legal answer at all
//   profit1 24%  ->  u2 = 12 or 18
//   profit1 25%  ->  u2 = 10, 15 or 20
//
// So profit1 is drawn from {22, 24, 25} and the answer from that rate's own list. The archetype spec'
// fixture uses 25% with an answer of 15, which is consistent.
//
// The "every omittable quantity is an exact multiple of the per-unit profit" constraint is
// what makes all three omission distractors land on whole unit counts. The archetype spec's own
// correction note records why that matters: the version this came from produced 19.5 and
// 18.55, which no candidate would ever pick as a number of aircraft, so the options were
// unreachable and the item was a giveaway.
//
// Prices are multiples of 5,000, which the spec would call eyeballable. That is forced
// by the divisibility constraint above, not chosen. Same class as a04's headcounts and a05's
// capital cost, and `isRound` is a generator helper rather than a validator predicate.

const SCENARIOS = [
  { org: 'Ashdown Aviation', kind: 'aircraft', a: { s: 'Harrier', p: 'Harriers' }, b: { s: 'Kestrel', p: 'Kestrels' } },
  { org: 'Baltimore Marine', kind: 'launches', a: { s: 'Osprey', p: 'Ospreys' }, b: { s: 'Petrel', p: 'Petrels' } },
  { org: 'Craigmoor Plant', kind: 'machines', a: { s: 'Boxer', p: 'Boxers' }, b: { s: 'Drover', p: 'Drovers' } },
];

const PROFIT1_ANSWERS = { 22: [11, 22], 24: [12, 18], 25: [10, 15, 20] };

export function formula({ p1, p2, profit1, profit2, bonus1, bonus2, u1, w1, w2, statedTotal }) {
  const unitProfit1  = u1 * p1 * profit1 / 100;
  const warrantyPot1 = w1 * p1 * bonus1 / 100;
  const warrantyPot2 = w2 * p2 * bonus2 / 100;
  const known   = unitProfit1 + warrantyPot1 + warrantyPot2;
  const perUnit = p2 * profit2 / 100;
  return {
    unitProfit1, warrantyPot1, warrantyPot2, known, perUnit,
    residue: statedTotal - known,
    answer: (statedTotal - known) / perUnit,
  };
}

export default {
  id: 'a18',
  name: 'Solving backwards for unknown units',
  group: 'algebra',
  desks: [1],
  tiers: ['hard'],
  stimulus: 'table',
  answerType: 'countWithUnit',
  targetSeconds: 83,

  constraints: [
    'every omittable quantity is an exact multiple of the per-unit profit, so all three '
      + 'omission distractors land on whole unit counts',
    'the second model bonus is half its profit rate, with an even warranty count',
    'the two profit rates differ, or the wrong-rate distractor equals the answer',
    'the residue divides exactly by the other model rate, so that distractor is a whole count too',
    'all five options are distinct positive integers within a factor of four of the answer',
  ],

  errorTypes: ['wrong-rate', 'omitted-component'],

  formulaText: '(stated total − known contributions) ÷ (second model price × its profit rate)',

  formula,

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const scenario = f.scenario ?? rng.pick(SCENARIOS);
    const profit2 = 20, bonus2 = 10;                 // pinned, see the note above
    const profit1 = f.profit1 ?? rng.pick([22, 24, 25]);

    const p2 = f.p2 ?? rng.int(7, 11) * 5000;
    const perUnit = p2 * profit2 / 100;

    // The first model's warranty pot must be a whole multiple of the per-unit profit. Rather
    // than draw the price and search for a warranty count, the feasible (price, bonus, count)
    // triples are enumerated and one is taken. Drawing first and rejecting cost 3.9 attempts
    // per item, almost all of it on that one constraint.
    const triples = [];
    for (let a = 7; a <= 11; a++) {
      const price = a * 5000;
      if (price === p2) continue;
      for (let b = 8; b <= 10; b++) {
        for (let w = 5; w <= 12; w++) {
          if ((w * price * b) % (100 * perUnit) === 0) triples.push({ p1: price, bonus1: b, w1: w });
        }
      }
    }
    if (!triples.length) return reject(diag, 'no-feasible-first-model');
    const t = f.triple ?? rng.pick(triples);
    const { p1, bonus1, w1 } = t;

    const w2 = f.w2 ?? rng.pick([6, 8, 10, 12]);     // even, so the pot is a whole multiple
    const u1 = f.u1 ?? rng.int(10, 16);
    const u2 = f.u2 ?? rng.pick(PROFIT1_ANSWERS[profit1]);

    // Backwards: the answer is fixed, so the stated total follows from it.
    const parts = formula({ p1, p2, profit1, profit2, bonus1, bonus2, u1, w1, w2, statedTotal: 0 });
    const statedTotal = f.statedTotal ?? (parts.known + u2 * perUnit);
    const d = formula({ p1, p2, profit1, profit2, bonus1, bonus2, u1, w1, w2, statedTotal });

    if (d.answer !== u2) return reject(diag, 'backwards-mismatch');
    if (!Number.isInteger(d.answer) || d.answer < 1) return reject(diag, 'answer-not-a-count');

    // Distractors. Each is the same expression with one named step done wrong.
    const dRate   = d.residue / (p2 * profit1 / 100);                        // other model's rate
    const dOmit1  = (statedTotal - d.unitProfit1 - d.warrantyPot2) / perUnit; // model 1 warranties dropped
    const dOmit2  = (statedTotal - d.unitProfit1 - d.warrantyPot1) / perUnit; // model 2 warranties dropped
    const dBoth   = (statedTotal - d.unitProfit1) / perUnit;                  // both dropped
    const values = [dRate, dOmit1, dOmit2, dBoth];
    if (!values.every(Number.isInteger)) return reject(diag, 'distractor-not-a-count');
    if (values.some(v => v < 1)) return reject(diag, 'distractor-not-positive');

    const m = v => money(v, '£', 0);
    const context = { unit: scenario.b.s, unitPlural: scenario.b.p };

    let options;
    try {
      options = assemble({
        correct: { value: u2 },
        distractors: [
          { value: dRate, errorType: 'wrong-rate',
            note: `used the ${scenario.a.s} profit rate of ${profit1}% on the ${scenario.b.p} instead of ${profit2}%` },
          { value: dOmit1, errorType: 'omitted-component',
            note: `left the ${scenario.a.s} warranty bonuses, ${m(d.warrantyPot1)}, out of the known total` },
          { value: dOmit2, errorType: 'omitted-component',
            note: `left the ${scenario.b.s} warranty bonuses, ${m(d.warrantyPot2)}, out of the known total` },
          { value: dBoth, errorType: 'omitted-component',
            note: 'left both sets of warranty bonuses out of the known total' },
        ],
        answerType: 'countWithUnit',
        context,
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    // No `keys` on this table: the answer is a count, not a row, so the column-correlation
    // diagnostic has nothing to match and correctly skips this archetype.
    const table = tableSpec({
      head: ['Model', 'Sale price', 'Profit per unit', 'Warranty bonus', 'Units sold', 'Warranties sold'],
      body: [
        [scenario.a.s, m(p1), `${profit1}%`, `${bonus1}%`, String(u1), String(w1)],
        [scenario.b.s, m(p2), `${profit2}%`, `${bonus2}%`, '?', String(w2)],
      ],
    });

    return {
      id: `a18#${rng.seed}`,
      archetypeId: 'a18',
      seed: rng.seed,
      tier,
      stimulusType: 'table',
      stimulus: {
        table,
        text: `${scenario.org} books a profit on every one of its ${scenario.kind} sold, shown as a `
            + `percentage of that model's sale price. It books a further bonus on every extended `
            + `warranty sold, also as a percentage of that model's sale price. Warranties are sold `
            + `separately from the ${scenario.kind} themselves, so the two counts are unrelated.`,
      },
      questionText: `Profit for the year came to ${m(statedTotal)} in total. `
                  + `How many ${scenario.b.p} were sold?`,
      answerType: 'countWithUnit',
      correct: { value: u2, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: context,
      values: {
        unitProfit1: d.unitProfit1, warrantyPot1: d.warrantyPot1, warrantyPot2: d.warrantyPot2,
        known: d.known, residue: d.residue, perUnit: d.perUnit,
      },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `${scenario.a.p} sold: ${u1} × ${m(p1)} × ${profit1}% = ${m(d.unitProfit1)}`,
          `${scenario.a.s} warranties: ${w1} × ${m(p1)} × ${bonus1}% = ${m(d.warrantyPot1)}`,
          `${scenario.b.s} warranties: ${w2} × ${m(p2)} × ${bonus2}% = ${m(d.warrantyPot2)}`,
          `known = ${m(d.known)}`,
          `residue = ${m(statedTotal)} − ${m(d.known)} = ${m(d.residue)}`,
          `profit per ${scenario.b.s} = ${m(p2)} × ${profit2}% = ${m(perUnit)}`,
          `answer = ${m(d.residue)} ÷ ${m(perUnit)} = ${u2} ${scenario.b.p}`,
        ],
      },
      targetSeconds: 83,
      params: { scenario, p1, p2, profit1, profit2, bonus1, bonus2, u1, u2, w1, w2, statedTotal },
    };
  },
};
