import { frac, subFrac, mulFrac, addFrac } from '../lib/fraction.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';

// a08 - Fraction sequence against the original baseline
//
// Track the remaining volume, but the target is a multiple of the ORIGINAL, not of the
// remainder. That baseline is the highest-yield trap in this archetype and the
// "percent more than the remainder" distractor is mandatory.
//
// ONE CONSTRAINT ADDED that the archetype spec does not state: EVERY option's denominator must be at
// most 12, not just the answer's. A 40% uplift multiplies by 7/5 and a 60% uplift by 8/5, so
// the wrong-base option picks up a factor of five and lands on values like 7/15 beside an answer
// over sixths. That is a formatting tell, and it singles out the one option the archetype most
// wants a candidate to consider. The archetype spec's own fixture satisfies the tighter rule already,
// because pouring away two fifths cancels the five.

const VESSELS = [
  { org: 'a cider press', vessel: 'vat', liquid: 'juice', unit: 'of a vat' },
  { org: 'a paint shop', vessel: 'drum', liquid: 'tint base', unit: 'of a drum' },
  { org: 'a brewery', vessel: 'tank', liquid: 'wort', unit: 'of a tank' },
  { org: 'a syrup works', vessel: 'kettle', liquid: 'syrup', unit: 'of a kettle' },
];

const STARTS = [[5, 6], [5, 8], [7, 8], [7, 12], [11, 12]];
const POURS  = [[1, 2], [2, 5], [1, 3]];
const SPILLS = [[1, 6], [1, 8], [1, 12], [1, 16], [1, 24]];
const UPLIFTS = [40, 50, 60];

// Every legal combination, enumerated once. The denominator rule kills most draws, so
// enumerating beats rejecting.
const COMBOS = (() => {
  const out = [];
  for (const [sn, sd] of STARTS) {
    const start = frac(sn, sd);
    if (start.value <= 0.5 || start.value > 1) continue;
    for (const [pn, pd] of POURS) {
      for (const [xn, xd] of SPILLS) {
        for (const up of UPLIFTS) {
          const remaining = subFrac(mulFrac(start, frac(pd - pn, pd)), frac(xn, xd));
          const target    = mulFrac(start, frac(100 + up, 100));
          const answer    = subFrac(target, remaining);
          const wrongBase = mulFrac(remaining, frac(100 + up, 100));
          if (remaining.value <= 0 || answer.value <= 0) continue;
          const dens = [remaining.d, target.d, answer.d, wrongBase.d];
          if (Math.max(...dens) > 12) continue;
          const vals = [answer.value, target.value, remaining.value, wrongBase.value];
          if (new Set(vals.map(v => v.toFixed(6))).size !== 4) continue;
          out.push({ start: [sn, sd], pour: [pn, pd], spill: [xn, xd], uplift: up });
        }
      }
    }
  }
  return out;
})();

export default {
  id: 'a08',
  name: 'Fraction sequence against the original baseline',
  group: 'fractions',
  desks: [1],
  tiers: ['standard', 'hard'],
  stimulus: 'prose',
  answerType: 'fraction',
  targetSeconds: 83,

  constraints: [
    'every intermediate value is an exact fraction',
    'every option, not only the answer, has a denominator of at most 12',
    'the answer is positive and in lowest terms',
    'the filler sits strictly between two of the derived options',
  ],

  errorTypes: ['wrong-quantity', 'wrong-base'],

  formulaText: 'original × (1 + uplift) − (original × (1 − poured) − spilled)',


  // THE ESTIMATION ROUTE, and on a fraction answer type it is the whole point.
  //
  // 68% of a08's items resolve at one significant figure once the options are read as decimals, and
  // converting to decimals IS the fast route: exact arithmetic over a common denominator of 24 is
  // several times slower than four divisions and a subtraction, and the option set is in lowest terms
  // with a denominator no greater than 12, so a two-figure decimal names one option uniquely.
  //
  // The trap the estimate still has to respect is the baseline. The uplift applies to the ORIGINAL
  // volume and not to the remainder, so the route prints both numbers separately: candidates who take
  // the percentage off the wrong base land on a real distractor, and no amount of decimal accuracy
  // rescues that.
  estimate(p) {
    const dec = a => a[0] / a[1];
    const start = dec(p.combo.start);
    const remaining = start * (1 - dec(p.combo.pour)) - dec(p.combo.spill);
    const target = start * (1 + p.combo.uplift / 100);
    const value = target - remaining;
    return {
      value,
      text: `as decimals, ${remaining.toFixed(2)} left against a target of ${target.toFixed(2)} on the `
        + `ORIGINAL ${start.toFixed(2)}, so about ${value.toFixed(2)}`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const vessel = f.vessel ?? rng.pick(VESSELS);
    if (!COMBOS.length) return reject(diag, 'no-legal-combination');
    const combo = f.combo ?? rng.pick(COMBOS);

    const start     = frac(combo.start[0], combo.start[1]);
    const pour      = frac(combo.pour[0], combo.pour[1]);
    const spill     = frac(combo.spill[0], combo.spill[1]);
    const up        = combo.uplift;
    const remaining = subFrac(mulFrac(start, frac(pour.d - pour.n, pour.d)), spill);
    const target    = mulFrac(start, frac(100 + up, 100));
    const answer    = subFrac(target, remaining);
    const wrongBase = mulFrac(remaining, frac(100 + up, 100));

    if (answer.value <= 0 || remaining.value <= 0) return reject(diag, 'value-not-positive');
    if (Math.max(answer.d, target.d, remaining.d, wrongBase.d) > 12) return reject(diag, 'denominator-band');

    // The filler sits strictly between two adjacent derived values, so it cannot be eliminated
    // by magnitude. Searched over denominators up to 12 rather than invented.
    // Intervals adjacent to the answer are searched first, because the filler must also sit
    // within twice the answer and a gap at the far end of the set often does not.
    //
    // POSITION. `remaining` and `wrongBase` are both below the answer and `target` is the
    // only thing above it, so the sorted slot is decided entirely by which side of the answer the
    // filler lands on: below gives slot 4, above gives slot 3. The tie-break in the interval ordering
    // resolved to the interval just BELOW the answer, so the filler went there in 94% of items and
    // a08 was a one-slot archetype in practice. That is what the position-skew flag added earlier
    // caught. The side is now drawn, and it is hidden from the candidate, who cannot tell which of
    // five options is the filler, so it carries no severity flag under the visible-split rule.
    const derived = [answer, target, remaining, wrongBase].sort((a, b) => a.value - b.value);
    const ai = derived.findIndex(x => Math.abs(x.value - answer.value) < 1e-9);
    const fillerSide = forced?.fillerSide ?? rng.pick(['above', 'below']);
    const preferred = fillerSide === 'above' ? ai + 1 : ai;      // interval indices are 1-based
    const order = [...Array(derived.length - 1).keys()].map(i => i + 1)
      .sort((x, y) => (x === preferred ? -1 : y === preferred ? 1 : 0)
        || Math.abs(x - 0.5 - ai) - Math.abs(y - 0.5 - ai));
    let filler = null;
    for (const i of order) {
      if (filler) break;
      const lo = derived[i - 1].value, hi = derived[i].value;
      for (let d = 2; d <= 12 && !filler; d++) {
        for (let n = 1; n < d * 2; n++) {
          const cand = frac(n, d);
          if (cand.value > lo + 1e-9 && cand.value < hi - 1e-9
              && cand.value <= answer.value * 2 && cand.value >= answer.value / 2
              && derived.every(x => Math.abs(x.value - cand.value) > 1e-9)) { filler = cand; break; }
        }
      }
    }
    if (!filler) return reject(diag, 'no-filler-between');

    let options;
    try {
      options = assemble({
        correct: { value: answer.value, display: answer.display },
        distractors: [
          { value: target.value, display: target.display, errorType: 'wrong-quantity',
            note: `reported the target level of ${target.display}, not the amount to add` },
          { value: remaining.value, display: remaining.display, errorType: 'wrong-quantity',
            note: `reported what is left, ${remaining.display}, not the amount to add` },
          { value: wrongBase.value, display: wrongBase.display, errorType: 'wrong-base',
            note: `took ${up}% more than the remainder rather than ${up}% more than the original` },
        ],
        filler: [
          { value: filler.value, display: filler.display, note: 'filler, sits between two of the derived values' },
        ],
        answerType: 'fraction',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `a08#${rng.seed}`,
      archetypeId: 'a08',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `At ${vessel.org} a ${vessel.vessel} of ${vessel.liquid} is ${start.display} full. `
            + `${pour.display === '1/2' ? 'Half' : pour.display} of the ${vessel.liquid} in it is drawn off, `
            + `and a further ${spill.display} ${vessel.unit} is lost to a spill. `
            + `The ${vessel.vessel} must end up holding ${up}% more ${vessel.liquid} than it held to begin with.`,
      },
      questionText: `How much ${vessel.liquid}, as a fraction ${vessel.unit}, must be added?`,
      answerType: 'fraction',
      correct: { value: answer.value, display: answer.display },
      options,
      optionContext: {},
      values: { remaining: remaining.display, target: target.display, answer: answer.display },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `remaining = ${start.display} × ${frac(pour.d - pour.n, pour.d).display} − ${spill.display} = ${remaining.display}`,
          `target = ${start.display} × ${frac(100 + up, 100).display} = ${target.display}`,
          `answer = ${target.display} − ${remaining.display} = ${answer.display}`,
          `${up}% more than the remainder would give ${wrongBase.display}, which is the wrong baseline`,
        ],
      },
      targetSeconds: 83,
      params: { vessel, combo },
    };
  },
};
