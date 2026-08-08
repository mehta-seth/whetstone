import { money, roundTo, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a22 - Compound depreciation
//
// Multiply by (1 − r) repeatedly. Never multiply r by the number of years.
//
// BOTH OFF-BY-ONES WERE REMOVED UNDER A PROVED BOUND, not a measurement. Where the
// answer has the form base times factor to a power and all three are printed, no off-by-one on
// the power is admissible: two on opposite sides put the answer in the middle of a geometric run
// in the printed factor, two on the SAME side put it at an end, one alone leaves a unique pair in
// a printed ratio, and drawing the side gives a coin flip after one multiplication, which session
// measured at 2.50x and rejected for a17. That closes the arrangement space.
//
// a22 had the same-side case. Both off-by-ones were short, so the answer sat at the BOTTOM of a
// three-term run in ratio 1/(1 - r): "find the run, take the smallest" hit 100% of 200 items
// against a 2.5% coincidence baseline, one division and two multiplications against the
// exponentiation the item exists to make you do. It had shipped since early on, and it was
// invisible to three successive versions of the an earlier round sweep, because a three-chain has two
// pairs at one ratio so the unique-pair test returns null and the chain's middle member is a
// distractor rather than the answer.
//
// The old NAMING NOTE is retained for the record: The archetype spec's distractor table called the two
// removed options "stopped one year short" and "stopped two years short" while its own fixture
// labelled the same two values the other way round. The values agreed; only the labels were
// inverted. Both are gone now.
//
// The replacements follow d07's template, chosen so the ratio to the answer needs work that
// cannot be skipped:
//   simple-not-compound   I(1 - ry/100)     no closed one-step form
//   omitted-final-step    I                 ratio 1/(1-x)^y, which IS the legitimate work
//   wrong-base            I/(1+x)^y         ratio (1-x^2)^-y, needs x squared then a y-th power
//   wrong-input           I(1-x'/100)^y     ratio needs x', which is never printed
//
// `wrong-base` is the reverse-percentage confusion and it reads the stem's own stated condition
// backwards: taking the loss against what the asset is worth at the END of the year rather than
// the start gives V_new = V_old / (1 + r). It is the highest-frequency family in this format and
// a22 did not emit it before.
//
// POSITION IS CAPPED AT TWO SLOTS AND THAT IS STRUCTURAL. The untouched initial value and the
// reverse-base value are both above the answer in every legal draw, since depreciation only ever
// falls, so the answer can never reach slot 4 or 5. Simple depreciation is always below it, so it
// can never reach slot 1. Slots 2 and 3 are the whole space and the misread rate decides which.

const ASSETS = [
  { org: 'Pemberton Haulage', item: 'a delivery van', short: 'the van' },
  { org: 'Larkfield Dental', item: 'a scanning unit', short: 'the scanner' },
  { org: 'Trewin Print', item: 'a folding machine', short: 'the machine' },
  { org: 'Castleton Farms', item: 'a combine header', short: 'the header' },
  { org: 'Aldermoor Studios', item: 'a lighting rig', short: 'the rig' },
];
const RATES = [8, 10, 12, 15];

// Enumerated up front, exactly as d07 does, and exact for the same reason: every option is the
// initial value times a factor, so all ten pairwise gaps are functions of the rate, the term and
// the misread rate alone and the initial value cancels out.
//
// THE MISREAD RATE IS A STEP, NOT A DRAW FROM RATES, and that matters. A higher rate leaves less
// value, so a misread option BELOW the answer needs a rate above the true one, and at 15% no
// higher member of RATES exists. Drawing the misread rate from RATES therefore made the side a
// stem-known function of the printed rate: see 15% and the misread option is above the answer,
// hence the answer is in slot 2. That is a16's lesson, where the accepted mix skewed on the one
// parameter the stem prints. As a step, all six surviving rate-and-term pairs carry both sides.
const LEGAL = [];
for (const r of RATES) {
  for (const y of [3, 4]) {
    const x = r / 100, keep = Math.pow(1 - x, y);
    if ((keep - (1 - x * y)) / keep < 0.05) continue;          // the required 5% simple gap
    const wb = Math.pow(1 + x, -y);
    if (wb / keep < 1.02) continue;                            // the reverse-base gap
    for (const side of ['below', 'above']) {
      for (let d = 1; d <= 3; d++) {
        const rp = side === 'below' ? r + d : r - d;
        if (rp < 5 || rp > 20) continue;
        const wi = Math.pow(1 - rp / 100, y);
        if (Math.abs(wi - keep) / keep < 0.02) continue;
        const f = [keep, 1 - x * y, 1, wb, wi].sort((a, b) => a - b);
        let ok = true;
        for (let i = 1; i < f.length; i++) if ((f[i] - f[i - 1]) / f[i] < 0.02) ok = false;
        if (ok) { LEGAL.push({ rate: r, years: y, side, wrongRate: rp }); break; }
      }
    }
  }
}

export default {
  id: 'a22',
  name: 'Compound depreciation',
  group: 'series',
  desks: [1],
  tiers: ['standard'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  variants: { key: 'wrongSide', visible: false },

  constraints: [
    'the simple-depreciation value differs from the answer by at least 5%, so estimation cannot resolve it',
    'the reverse-base value differs from the answer by at least 2%',
    'the misread rate differs from the true rate by at least 2% after compounding',
    'no option stands to the answer in a ratio or at an offset the stem prints',
    'the initial value is awkward, so the untouched-initial option is not the only round one',
    'the answer rounds to the nearest whole currency unit',
  ],

  errorTypes: ['simple-not-compound', 'omitted-final-step', 'wrong-base', 'wrong-input'],

  formulaText: 'initial value × (1 − rate) raised to the number of years',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const asset = f.asset ?? rng.pick(ASSETS);
    if (!LEGAL.length) return reject(diag, 'no-legal-rate-and-term');

    // Side first, then a tuple on that side, so the split is even and carries no information
    // about anything the stem prints.
    let pick;
    if (f.rate !== undefined) {
      const side = f.wrongSide ?? 'below';
      pick = LEGAL.find(t => t.rate === f.rate && t.years === f.years && t.side === side)
        ?? { rate: f.rate, years: f.years, side, wrongRate: side === 'below' ? f.rate + 1 : f.rate - 1 };
    } else {
      const side = rng.pick(['below', 'above']);
      const onSide = LEGAL.filter(t => t.side === side);
      if (!onSide.length) return reject(diag, 'no-legal-tuple-on-side');
      pick = rng.pick(onSide);
    }
    const { rate, years, wrongRate } = pick;
    const wrongSide = pick.side;

    // AWKWARD, NOT A MULTIPLE OF 500, and the reason is a measurement rather than taste. With the
    // untouched initial value now an option, a round initial made it the only round number in the
    // set and "discard the round one" removed it for free. d07 measured the identical defect at
    // 89.0% of items when its principal was a whole number. The archetype spec asks for the nearest 500
    // here, which contradicts the spec's own rule that values are deliberately awkward.
    const initial = f.initial ?? Math.round(awkward(rng, 12000, 30000, 0));

    const x = rate / 100, keep = 1 - x;
    const exact = initial * keep ** years;
    const answer = Math.round(exact);

    const simple = Math.round(initial * (1 - rate * years / 100));
    if (simple <= 0) return reject(diag, 'simple-not-positive');
    if (Math.abs(answer - simple) / answer < 0.05) return reject(diag, 'simple-too-close');

    const untouched = initial;
    const reverseBase = Math.round(initial / (1 + x) ** years);
    const misread = Math.round(initial * (1 - wrongRate / 100) ** years);

    const vals = [answer, simple, untouched, reverseBase, misread];
    if (new Set(vals).size !== 5) return reject(diag, 'option-collision');

    // The an earlier round rule, enforced locally so the archetype documents it. Every quantity the stem
    // prints, plus the one-keystroke derivations of each, must not link the answer to any other
    // option by a ratio or by a difference.
    const consts = new Set();
    for (const k of [initial, rate, years]) {
      for (const c of [k, 1 + k / 100, 1 - k / 100, k / 100]) {
        if (c > 1e-9) { consts.add(c); consts.add(1 / c); consts.add(c * c); consts.add(1 / (c * c)); }
      }
    }
    for (const v of vals) {
      if (v === answer) continue;
      for (const c of consts) {
        if (Math.abs(Math.abs(answer - v) - c) < 0.51) return reject(diag, 'stem-known-offset');
        if (c > 1.02 && Math.abs(Math.max(answer, v) / Math.min(answer, v) - c) < 3e-4) {
          return reject(diag, 'stem-known-ratio');
        }
      }
    }

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: simple, errorType: 'simple-not-compound',
            note: `simple depreciation, ${money(initial, '£', 0)} × (1 − ${rate}% × ${years})` },
          { value: untouched, errorType: 'omitted-final-step',
            note: 'gave what the asset cost, so the depreciation was never applied at all' },
          { value: reverseBase, errorType: 'wrong-base',
            note: `divided by ${(1 + x).toFixed(2)} each year instead of multiplying by ${keep.toFixed(2)}, `
              + 'which takes the loss against the value at the END of each year rather than the start' },
          { value: misread, errorType: 'wrong-input',
            note: `compounded correctly but at ${wrongRate}% rather than ${rate}%` },
        ],
        answerType: 'currency',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const m = v => money(v, '£', 0);
    return {
      id: `a22#${rng.seed}`,
      archetypeId: 'a22',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${asset.org} bought ${asset.item} for ${m(initial)}. `
            + `${asset.short[0].toUpperCase()}${asset.short.slice(1)} loses ${rate}% of its value `
            + `every year, measured against what it was worth at the start of that year.`,
      },
      questionText: `What will ${asset.short} be worth after ${years} years?`,
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: {},
      values: { initial, rate, years, keep: roundTo(keep ** years, 6), exact: roundTo(exact, 2), wrongRate },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `retained fraction = ${keep.toFixed(2)} ^ ${years} = ${(keep ** years).toFixed(6)}`,
          `answer = ${m(initial)} × ${(keep ** years).toFixed(6)} = ${m(answer)}`,
          `simple depreciation would give ${m(initial)} × ${(1 - rate * years / 100).toFixed(2)} = ${m(simple)}`,
        ],
      },
      targetSeconds: 83,
      params: { asset, initial, rate, years, wrongSide },
    };
  },
};
