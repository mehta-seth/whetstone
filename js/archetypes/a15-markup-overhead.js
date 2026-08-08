import { money } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';

// a15 - Markup minus fixed overhead
//
// Integer throughout. unitCost is a multiple of 100 and the markup is an integer
// percentage, so with c = unitCost/100 every quantity below is an exact integer:
//   gross  = units * c * markup
//   answer = gross - overhead
//
// NEAR COVER. The original fourth distractor was wrong-base at
// units*unitCost*(1+markup) - overhead, which lands around 15x the answer. That
// option is eliminable on sight and earns nothing. The distractor that does earn
// something, at 0.522x, is gross * markup: the markup rate applied a second
// time — a wrong method a solver plausibly reaches for. That is this
// archetype's natural near cover, so it is preferred whenever the parameters
// place it clear of the answer.
//
// Its ratio to the answer is markup/(1-f) where f = overhead/gross, so it
// collides with the answer whenever f approaches 1-markup. When that happens the
// fallback is filler built from one of the other listed markup rates, which is
// the same construction the archetype spec already uses for a20's filler ("divided by a
// nearby wrong complement"). Filler is anchored on the stated inputs, never on
// the answer, because the spec forbids perturbing the answer and because an
// answer-anchored filler would put a fixed ratio between two options in every
// item, which is learnable over a few hundred repetitions.

const FIRMS = [
  { name: 'Vance Marine',       s: 'survey drone',   p: 'survey drones',   period: 'quarter' },
  { name: 'Kestrel Rail',       s: 'signal cabinet', p: 'signal cabinets', period: 'quarter' },
  { name: 'Ardenne Optics',     s: 'scanning head',  p: 'scanning heads',  period: 'month' },
  { name: 'Follet Diagnostics', s: 'analyser',       p: 'analysers',       period: 'quarter' },
];

const MARKUPS = [18, 20, 22, 25, 27];

// Admissible ratio windows for the near-cover option, either side of the answer.
// Both sides are allowed on purpose: if near cover only ever sat below the
// answer, two options would always be above it and two below, pinning the answer
// to the third slot in every single item.
const DOUBLE_BANDS = [[0.35, 0.85], [1.18, 2.00]];
const FILLER_BANDS = [[0.60, 0.80], [1.25, 1.67]];
const inBands = (r, bands) => bands.some(([lo, hi]) => r >= lo && r <= hi);

export default {
  id: 'a15',
  name: 'Markup minus fixed overhead',
  group: 'money',
  desks: [1],
  tiers: ['standard', 'hard'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  constraints: [
    'answer is positive and smaller than gross, so both the forgot and added distractors sit on the correct side',
    'overhead is between 40% and 80% of gross',
    'a near-cover option exists within 2x of the answer, on either side',
    'all options distinct to the nearest pound',
  ],

  errorTypes: ['omitted-final-step', 'sign-flip', 'single-unit', 'double-application'],

  formulaText: 'units × unit cost × markup − fixed overhead',


  // THE ESTIMATION ROUTE.
  //
  // 82% of a15's items resolve at one significant figure. The gross figure is a three-number
  // product and the overhead is drawn in units of 500, so rounding both to one figure leaves the
  // subtraction unambiguous. The error family this archetype exists to punish is
  // `omitted-final-step`, which the estimate exposes faster than the exact chain does: the gross
  // is visibly one of the options and visibly not the answer.
  estimate(p) {
    const units = p.units, cost = sig2(p.unitCost / 100), over = sig2(p.overhead);
    const gross = units * cost * p.markup;
    const value = gross - over;
    return {
      value,
      text: `${units} x ${cost} x ${p.markup} = about ${Math.round(gross)}, less overhead of about `
        + `${Math.round(over)}, leaves about ${Math.round(value)}`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const p = {
      units:    f.units    ?? rng.int(6, 16),
      unitCost: f.unitCost ?? rng.int(200, 450) * 100,
      markup:   f.markup   ?? rng.pick(MARKUPS),
      firm:     f.firm     ?? rng.pick(FIRMS),
    };

    const c     = p.unitCost / 100;
    const gross = p.units * c * p.markup;

    // Overhead is drawn last, in units of 500, from the intersection of its
    // stated 40,000 to 80,000 range with the 40% to 80% of gross the constraint
    // allows. Same trade as a01's budget: the constraint holds by construction,
    // the stated range is untouched, and answer > 0 follows for free. Empty
    // intersections are rejected, never clamped.
    if (f.overhead !== undefined) {
      p.overhead = f.overhead;
    } else {
      const lo = Math.ceil(Math.max(40000, 0.40 * gross) / 500);
      const hi = Math.floor(Math.min(80000, 0.80 * gross) / 500);
      if (lo > hi) return reject(diag, 'overhead-infeasible');
      p.overhead = rng.int(lo, hi) * 500;
    }

    const answer = gross - p.overhead;
    if (answer <= 0) return reject(diag, 'answer-positive');
    if (100 * p.overhead < 40 * gross) return reject(diag, 'overhead-share-low');
    if (100 * p.overhead > 80 * gross) return reject(diag, 'overhead-share-high');

    const dGross  = gross;                              // overhead never deducted
    const dAdded  = gross + p.overhead;                 // sign reversed
    const dSingle = c * p.markup;                       // one unit only

    // Near cover, preferred first, drawn at random among whatever is admissible
    // so that the option's side of the answer is not fixed.
    const candidates = [];
    const dDouble = Math.round(gross * p.markup / 100);
    if (inBands(dDouble / answer, DOUBLE_BANDS)) {
      candidates.push({
        value: dDouble, role: 'distractor', errorType: 'double-application',
        note: `applied the markup rate a second time, to the gross margin: ${money(gross)} × ${p.markup}%`,
      });
    }
    for (const alt of MARKUPS) {
      if (alt === p.markup) continue;
      const v = p.units * c * alt - p.overhead;
      if (v > 0 && inBands(v / answer, FILLER_BANDS)) {
        candidates.push({
          value: v, role: 'filler', errorType: 'filler',
          note: `filler, the same calculation at a nearby wrong markup rate of ${alt}%`,
        });
      }
    }
    if (!candidates.length) return reject(diag, 'no-near-cover');
    const cover = rng.pick(candidates);

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dGross,  errorType: 'omitted-final-step', note: 'reported the gross margin, overhead never deducted' },
          { value: dAdded,  errorType: 'sign-flip',          note: 'added the overhead instead of subtracting it' },
          { value: dSingle, errorType: 'single-unit',        note: 'margin on one unit only, never multiplied by the unit count' },
          ...(cover.role === 'distractor' ? [cover] : []),
        ],
        filler: cover.role === 'filler' ? [cover] : [],
        answerType: 'currency',
        context: { currencySymbol: '£' },
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const fm = v => money(v, '£', 0);
    return {
      id: `a15#${rng.seed}`,
      archetypeId: 'a15',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${p.firm.name} builds ${p.firm.p}. Each ${p.firm.s} costs ${fm(p.unitCost)} to build `
            + `and is sold at a markup of ${p.markup}% on that cost. Fixed overheads for the `
            + `${p.firm.period} are ${fm(p.overhead)}.`,
      },
      questionText: `If ${p.firm.name} builds and sells ${p.units} ${p.firm.p} in the ${p.firm.period}, `
                  + `what is its profit for the ${p.firm.period}?`,
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: { currencySymbol: '£' },
      values: { gross, overheadShareOfGross: Math.round(1000 * p.overhead / gross) / 10 },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `margin per ${p.firm.s} = ${fm(p.unitCost)} × ${p.markup}% = ${fm(dSingle)}`,
          `gross = ${p.units} × ${fm(dSingle)} = ${fm(gross)}`,
          `answer = ${fm(gross)} − ${fm(p.overhead)} = ${fm(answer)}`,
        ],
      },
      targetSeconds: 83,
      params: p,
    };
  },
};
