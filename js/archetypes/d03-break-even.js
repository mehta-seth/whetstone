import { money, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// d03 - Break-even units
//
// Ceiling, not floor: you cannot break even on a fraction of a unit. The contribution margin is
// price less variable cost, and every distractor is a different thing put in the denominator.
//
// DIVERGENCE. The archetype spec's fourth distractor is "contribution margin inverted", which as written
// is fixedCost / (variableCost - price) and is negative, or (price - variableCost) / fixedCost
// and is a fraction of a unit. Neither is a number a candidate would pick as a unit count, which
// is the exact defect the archetype spec records against a18's source, where the original distractors gave
// 19.5 and 18.55 units and were therefore unreachable. The margin formed by ADDING rather
// than subtracting is the same slip and lands on a plausible count, so that is what is built.
//
// POSITION. Slots 4 and 5, and slot 5 is reached whenever the variable cost exceeds the margin,
// because then every distractor is below the answer. The library reaches slot 5 almost nowhere,
// so the side is drawn and realised rather than left to the parameter draw.

const LINES = [
  { org: 'Kelvedon Cycles', unit: 'frame', plural: 'frames', sym: '\u00a3' },
  { org: 'Marchwood Ceramics', unit: 'planter', plural: 'planters', sym: '\u00a3' },
  { org: 'Tarnbrook Audio', unit: 'speaker cabinet', plural: 'speaker cabinets', sym: '\u00a3' },
  { org: 'Elmsworth Optics', unit: 'lens housing', plural: 'lens housings', sym: '\u00a3' },
];

export default {
  id: 'd03',
  name: 'Break-even units',
  group: 'money',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'countWithUnit',
  targetSeconds: 83,

  constraints: [
    'the quotient lands between 0.2 and 0.8 above an integer, so rounding down is tempting',
    'the answer is a ceiling, because a part-built unit contributes nothing',
    'the variable cost is drawn either side of the contribution margin, which is what decides '
      + 'whether the wrong-denominator option sits above or below the answer',
    'all five options are distinct positive integers',
  ],

  errorTypes: ['omitted-component', 'wrong-denominator', 'round-down'],

  formulaText: 'ceil(fixed cost / (price - variable cost))',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const line = f.line ?? rng.pick(LINES);
    // Slot 5 needs the wrong-denominator option below the answer, which happens exactly when the
    // variable cost exceeds the contribution margin. Drawn first, then realised.
    const wantSlot = f.wantSlot ?? (rng.next() < 0.5 ? 5 : 4);
    const price = f.price ?? Math.round(awkward(rng, 4000, 12000, 0)) / 100;
    // v > m means v > price/2; v < m means v < price/2.
    const v = f.variable ?? (wantSlot === 5
      ? Math.round(awkward(rng, price * 52, price * 68, 0)) / 100
      : Math.round(awkward(rng, price * 26, price * 45, 0)) / 100);
    const margin = Math.round((price - v) * 100) / 100;
    if (margin <= 0) return reject(diag, 'margin-not-positive');

    const fixed = f.fixed ?? Math.round(awkward(rng, 18000, 70000, 0));
    const quotient = fixed / margin;
    const frac = quotient - Math.floor(quotient);
    if (frac < 0.2 || frac > 0.8) return reject(diag, 'quotient-band');
    const answer = Math.ceil(quotient);
    if (answer < 20 || answer > 4000) return reject(diag, 'answer-out-of-band');

    const dNoVariable = Math.ceil(fixed / price);
    const dWrongDen = Math.ceil(fixed / v);
    const dFloor = Math.floor(quotient);
    const dAdded = Math.ceil(fixed / (price + v));
    // THE OFF-BY-ONE IS EMITTED IN HALF OF ITEMS.
    //
    // Measured before this change: 100% of d03 items were answerable with no arithmetic. `round-down`
    // is answer - 1, nothing else sat within one unit, so one pair of consecutive integers was in
    // every set and the answer was always its HIGHER member. d03 carries the warmup tier, so it
    // rotates as often as a01 does.
    //
    // Emitting it in half of items costs half of the library's only source of `round-down`, which is
    // real and is priced. The alternative measured at 2.40x while costing 65% of the same family, so
    // this is the better trade on both axes. Five candidate designs and a battery of seven scanner
    // rules are in test/probes/s7d1designs.mjs; this one measured 28%, or 1.40x, which is below the
    // 1.6x concentration band and the only design of the five to get there.
    // Injectable, per 9.4: this draw decides the option set.
    const keepFloor = f.keepFloor ?? (rng.next() < 0.5);
    const dFloorOpt = dFloor;
    // A run of three consecutive integers puts the answer at a known position in the run and returns
    // the exploit to 100%, which an earlier round measured. The decoy is one unit from `wrong-denominator`,
    // so reject wherever that would land within two units of the answer or its floor.
    if (Math.abs(dWrongDen - answer) <= 2) return reject(diag, 'anchor-too-close');
    const vals = [dNoVariable, dWrongDen, dFloor, dAdded];
    if (new Set([answer, ...vals]).size !== 5) return reject(diag, 'option-collision');
    if ((dWrongDen > answer ? 5 : 4) !== 9 - wantSlot) return reject(diag, `slot-not-${wantSlot}`);

    const m = v2 => money(v2, line.sym, 2);
    const context = { unit: line.unit, unitPlural: line.plural };
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dNoVariable, errorType: 'omitted-component',
            note: `divided by the ${m(price)} price and ignored the ${m(v)} it costs to build one` },
          { value: dWrongDen, errorType: 'wrong-denominator',
            note: `divided by the ${m(v)} variable cost rather than by the ${m(margin)} each sale contributes` },
          ...(keepFloor
            ? [{ value: dFloorOpt, errorType: 'round-down',
                note: `rounded down, but a part-built ${line.unit} contributes nothing to the fixed cost` }]
            : [{ value: answer + 5, errorType: 'filler',
                note: `filler, a count above the answer that no single step produces` }]),
        ],
        // THE FREED SLOT, ANCHORED ON A DRAWN SIDE.
        //
        // `inverted` becomes the filler, which is what makes this repair possible at all. Every
        // second-pair design came back NOT CONSTRUCTIBLE on d03 because all four distractors were
        // derived and there was no free option to place. `inverted` is the right one to spend for two
        // reasons that are both on the record. It is already a SUBSTITUTION: README line 161 notes
        // that the distractor the archetype spec specifies, fixedCost / (variableCost - price), is negative
        // or a fraction of a unit and therefore unreachable, which is the defect the archetype spec itself
        // complains about in a18's source. And `inverted` is emitted by THREE archetypes, d03 d04 and
        // d13, whereas `round-down` is emitted by d03 alone. So this spends one of three sources of
        // one family rather than most of the only source of another.
        //
        // The anchor is `wrong-denominator` where that sits above the answer, which is the half of
        // items `wantSlot` draws, and `omitted-component` below it otherwise. That is what stops the
        // answer's own pair from always being the extreme pair in the set. Anchoring next to the
        // answer's neighbour is avoided, because two pairs sharing a value make a run of three and
        // "take the lowest of the run" then returns the exploit to 100%.
        // The anchor is `wrong-denominator` on whichever side of the answer it fell, placed on its
        // FAR side so the decoy pair cannot touch the answer's own. `wantSlot` already draws that
        // side 50/50: at wantSlot 5 the answer is the largest option and the decoy sits below it, at
        // wantSlot 4 the variable-cost figure clears the answer and the decoy sits above. So the
        // answer's pair is the highest pair in half of items and the lowest in the other half, and no
        // ordering rule survives it.
        //
        // ANCHORING ON `omitted-component` INSTEAD WAS TRIED AND REJECTED BY MEASUREMENT. That option
        // is fixedCost / price against the answer's fixedCost / margin, so it sits a factor of
        // price / margin away, which routinely exceeds the 2x ceiling 9.1 puts on a filler. The
        // below-side branch therefore rejected almost every draw, the accepted mix collapsed onto the
        // single surviving side, and the ordering cue came back at 53%. `wrong-denominator` is the
        // closest derived option to the answer on either side, which is what makes it the right
        // anchor rather than the obvious one.
        filler: [
          { value: dWrongDen > answer ? dWrongDen + 1 : dWrongDen - 1,
            note: `filler, a near miss on the ${m(v)} variable-cost figure` },
        ],
        answerType: 'countWithUnit', context, rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d03#${rng.seed}`, archetypeId: 'd03', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${line.org} sells each ${line.unit} for ${m(price)}. Materials and labour `
        + `come to ${m(v)} a ${line.unit}, and the line carries fixed costs of ${money(fixed, line.sym, 0)} a year.` },
      questionText: `How many ${line.plural} must it sell in the year to cover its fixed costs?`,
      answerType: 'countWithUnit',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: context,
      values: { price, variable: v, margin, fixed, quotient: Math.round(quotient * 10000) / 10000 },
      workings: { formulaText: this.formulaText, steps: [
        `contribution = ${m(price)} - ${m(v)} = ${m(margin)}`,
        `${money(fixed, line.sym, 0)} / ${m(margin)} = ${(Math.round(quotient * 10000) / 10000).toFixed(4)}`,
        `answer = ceil(${(Math.round(quotient * 100) / 100).toFixed(2)}) = ${answer}`,
      ] },
      targetSeconds: 83,
      params: { wantSlot, price, variable: v, margin },
    };
  },
};
