import { money, roundTo, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// d07 - Compound interest on growth
//
// Multiply by (1 + r) repeatedly. The simple-interest value is the trap.
//
// TWO OPTIONS WERE REMOVED AND THE REASON IS A PROVED STRUCTURAL BOUND, not a
// measurement that might have gone the other way. An earlier round's stem-assisted algebra sweep found
// this archetype fully solvable twice over, both attacks at 100% of 200 items against a 0.0%
// coincidence baseline:
//
//   OFFSET   the interest-only option is `answer - principal`, and the principal is the largest
//            and most distinctive number in the stem. Find the option pair separated by it and
//            take the larger. No other pair in the set is separated by any printed number, so
//            the pair is unique. Four subtractions against an exponentiation, and it needs no
//            knowledge of compound interest at all.
//   RUN      the two off-by-ones put the answer at the MIDDLE of a three-term geometric run in
//            ratio 1 + r, which the stem prints. Two multiplications and take the middle. This
//            is a05's 1:2:4 triple with the ratio supplied by the stem rather than being 2.
//
// The bound. For any answer of the form `base x factor^power` with all three printed, EVERY
// off-by-one on the power stands to the answer in ratio factor^k for small k, which is one
// keystroke. Two of them on opposite sides put the answer in the middle of a run; two on the
// same side put it at an end, which is a22's shape and equally fixed; one alone leaves a unique
// pair in a printed ratio. Drawing the side gives a coin flip after one multiplication, which
// An earlier round measured at 2.50x and rejected for a17. So `off-by-one` is not available to this
// archetype under any arrangement, and neither is the interest-only value, whose offset from the
// answer is printed. That is three of the four procedures the archetype spec names.
//
// The replacements are chosen so their ratio to the answer needs work the candidate cannot skip:
//   simple-not-compound   P(1 + rn/100)        no closed one-step form
//   omitted-final-step    P                    ratio 1/(1+r)^n, which IS the legitimate work
//   wrong-base            P/(1 - r/100)^n      ratio (1 - r^2)^-n, needs r squared then an n-th power
//   wrong-input           P(1 + r'/100)^n      ratio needs r', which is never printed
//
// Two of the three new families, `omitted-final-step` and `wrong-base`, are in the top three for
// this format and d07 emitted neither before. `off-by-one` is emitted by a11, a22, d08, d09, d17
// and d19, and `wrong-quantity` by a03, a08 and d16, so nothing is orphaned in the error index.
//
// POSITION. Simple interest and the untouched principal are always below the answer and the
// reverse-percentage value is always above it, so the wrong-rate option decides the slot and its
// side is drawn: below gives slot 4 of 5, above gives slot 3. The side is HIDDEN, since no
// candidate can tell which option used a misread rate without computing it, so the split is
// printed for information and the pooled figure is the real one. That is d17's disposition.

const FUNDS = [
  { org: 'the Ashcombe Trust', thing: 'an endowment' },
  { org: 'Halverston Mutual', thing: 'a fixed-term bond' },
  { org: 'the Ledbury Fund', thing: 'a reserve account' },
  { org: 'Northgate Savings', thing: 'a deposit' },
];

// Enumerated, not drawn and rejected, and the enumeration is exact because every option is the
// principal times a factor. The five factors, and therefore all ten pairwise gaps, are functions
// of the rate, the term and the misread rate ALONE, with the principal cancelling out. So every
// spacing condition can be settled before a principal is drawn, and none of them can reject later.
//
// The first version of this rebuilt archetype drew the misread rate at plus or minus one point
// and rejected on collision, which cost 50.5% of attempts, 29.0% of it on one condition: the
// reverse-percentage factor is about 1 + n x^2 and the misread factor about 1 + n/(100 + r), and
// those are equal near r = 9.5, so at rates either side of nine the two options land on top of
// each other whatever the term. Enumerating instead takes the smallest misread step that clears
// every gap, which keeps the misread option as close to the answer as the rules allow and so
// keeps the item hard rather than merely legal.
const LEGAL = [];
for (let r = 4; r <= 12; r++) {
  for (let n = 3; n <= 7; n++) {
    const x = r / 100, grow = Math.pow(1 + x, n);
    if (grow - (1 + r * n / 100) < 0.04 * grow) continue;      // the required simple-interest gap
    const rev = Math.pow(1 - x, -n);
    if (rev / grow < 1.02) continue;                            // the reverse-percentage gap
    for (const side of ['below', 'above']) {
      for (let d = 1; d <= 3; d++) {
        const rp = side === 'below' ? r - d : r + d;
        if (rp < 3 || rp > 15) continue;
        const wr = Math.pow(1 + rp / 100, n);
        if (Math.abs(wr - grow) / grow < 0.02) continue;
        const f = [grow, 1 + r * n / 100, 1, rev, wr].sort((a, b) => a - b);
        let ok = true;
        for (let i = 1; i < f.length; i++) if ((f[i] - f[i - 1]) / f[i] < 0.02) ok = false;
        if (ok) { LEGAL.push({ rate: r, years: n, side, wrongRate: rp }); break; }
      }
    }
  }
}

export default {
  id: 'd07',
  name: 'Compound interest on growth',
  group: 'series',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  variants: { key: 'wrongSide', visible: false },

  constraints: [
    'the simple-interest value differs from the answer by at least 4 per cent of the answer',
    'the reverse-percentage value differs from the answer by at least 2 per cent',
    'the misread rate differs from the true rate by at least 2 per cent after compounding',
    'no option stands to the answer in a ratio or at an offset the stem prints',
    'the principal is awkward and not a round figure',
    'the answer is not the only option sitting on a whole number of pounds',
  ],

  errorTypes: ['simple-not-compound', 'omitted-final-step', 'wrong-base', 'wrong-input'],

  formulaText: 'principal x (1 + rate) to the power of the number of years',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const fund = f.fund ?? rng.pick(FUNDS);
    if (!LEGAL.length) return reject(diag, 'no-legal-rate-and-term');
    // The side is drawn, not left to fall out, because everything else in the set sits on a fixed
    // side of the answer. Both sides are legal for all 22 rate-and-term pairs, so drawing the pair
    // and then the side gives an even split with nothing rejected for it.
    let pick;
    if (f.rate !== undefined) {
      const side = f.wrongSide ?? 'below';
      pick = LEGAL.find(t => t.rate === f.rate && t.years === f.years && t.side === side)
        ?? { rate: f.rate, years: f.years, side, wrongRate: side === 'below' ? f.rate - 1 : f.rate + 1 };
    } else {
      const side = rng.pick(['below', 'above']);
      const onSide = LEGAL.filter(t => t.side === side);
      if (!onSide.length) return reject(diag, 'no-legal-tuple-on-side');
      pick = rng.pick(onSide);
    }
    const { rate, years, wrongRate } = pick;
    const wrongSide = pick.side;
    // THE PRINCIPAL CARRIES PENCE, and that is not cosmetic. Drawn as a whole number it made the
    // untouched-principal option the only value in the set with an empty fractional part, so
    // "discard the one with no pence" removed it for free in 89.0% of items and the
    // `omitted-final-step` family was dead on arrival. The spec asks for awkward values
    // anyway, and a transfer of £24,169.37 is no less plausible than one of £24,169.
    const principal = f.principal ?? roundTo(awkward(rng, 8000, 46000, 2), 2);
    const x = rate / 100, g = 1 + x;

    const answer   = roundTo(principal * Math.pow(g, years), 2);
    const dSimple  = roundTo(principal * (1 + rate * years / 100), 2);
    const dNoGrowth = roundTo(principal, 2);
    const dReverse = roundTo(principal / Math.pow(1 - x, years), 2);
    const dWrongRate = roundTo(principal * Math.pow(1 + wrongRate / 100, years), 2);

    if (Math.abs(answer - dSimple) < 0.04 * answer) return reject(diag, 'simple-too-close');
    if (Math.abs(dReverse - answer) < 0.02 * answer) return reject(diag, 'reverse-too-close');
    if (Math.abs(dWrongRate - answer) < 0.02 * answer) return reject(diag, 'misread-rate-too-close');
    if (Math.abs(dReverse - dWrongRate) < 0.02 * Math.max(dReverse, dWrongRate)) {
      return reject(diag, 'reverse-collides-with-misread');
    }

    const vals = [answer, dSimple, dNoGrowth, dReverse, dWrongRate];
    if (new Set(vals.map(v => v.toFixed(2))).size !== 5) return reject(diag, 'option-collision');

    // The an earlier round rule, enforced locally so the archetype documents it. Every quantity the stem
    // prints, plus the one-keystroke derivations of each, must not link the answer to any other
    // option by a ratio or by a difference. This is what the two removed options failed.
    const printed = [principal, rate, years];
    const consts = new Set();
    for (const k of printed) {
      for (const c of [k, 1 + k / 100, 1 - k / 100, k / 100]) {
        if (c > 1e-9) { consts.add(c); consts.add(1 / c); consts.add(c * c); consts.add(1 / (c * c)); }
      }
    }
    for (const v of vals) {
      if (v === answer) continue;
      for (const c of consts) {
        if (Math.abs(Math.abs(answer - v) - c) < 0.011) return reject(diag, 'stem-known-offset');
        if (c > 1.02 && Math.abs(Math.max(answer, v) / Math.min(answer, v) - c) < 5e-5) {
          return reject(diag, 'stem-known-ratio');
        }
      }
    }

    const m = v => money(v, '\u00a3', 2);
    const isWhole = v => Math.abs(v - Math.round(v)) < 1e-9;
    if (isWhole(answer) && ![dSimple, dNoGrowth, dReverse, dWrongRate].some(isWhole)) {
      return reject(diag, 'answer-alone-on-a-whole-value');
    }

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dSimple, errorType: 'simple-not-compound',
            note: `multiplied the rate by ${years} years instead of compounding, giving ${rate * years}% on the original` },
          { value: dNoGrowth, errorType: 'omitted-final-step',
            note: 'reported what was paid in, so the growth was never applied at all' },
          { value: dReverse, errorType: 'wrong-base',
            note: `divided by ${(1 - x).toFixed(2)} each year instead of multiplying by ${g.toFixed(2)}, `
              + 'which treats the rate as a share of the later figure rather than the earlier one' },
          { value: dWrongRate, errorType: 'wrong-input',
            note: `compounded correctly but at ${wrongRate}% rather than ${rate}%` },
        ],
        answerType: 'currency', context: { currencySymbol: '\u00a3' }, rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d07#${rng.seed}`, archetypeId: 'd07', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${m(principal)} is placed in ${fund.thing} with ${fund.org}. `
        + `It grows at ${rate}% a year, and the interest is added to the account each year.` },
      questionText: `What will the account be worth after ${years} years?`,
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: { currencySymbol: '\u00a3' },
      values: { principal, rate, years, factor: roundTo(Math.pow(g, years), 6), wrongRate },
      workings: { formulaText: this.formulaText, steps: [
        `${m(principal)} x ${g.toFixed(2)} to the power ${years} = ${m(principal)} x ${Math.pow(g, years).toFixed(6)}`,
        `answer = ${m(answer)}`,
      ] },
      targetSeconds: 83,
      params: { rate, years, wrongSide },
    };
  },
};
