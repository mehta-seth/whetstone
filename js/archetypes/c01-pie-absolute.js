// c01 - Pie chart, share shown and absolute asked
//
// The pie gives percentages. The question wants an absolute value. The total is in the caption and
// nowhere else, so the item cannot be answered without reading it. The spec calls this the
// standard pie item.
//
// DECISIONS THAT SHAPE THE PARAMETER RANGES.
//
// 1. The minimum segment rises from 5% to 10%, so labels fit inside or beside every wedge.
//
// 2. `wrong-unit` is kept as a distractor, reporting the percentage where the absolute was asked,
//    because that is the classic pie error and this item exists precisely because the pie shows
//    shares while the caption holds the total. It has an exact consequence for the parameter range.
//    The option's distance from the answer is
//
//        answer / pct  =  (pct / 100 x total) / pct  =  total / 100
//
//    independent of which segment is asked. So the 200x ceiling in OPTION_RULES caps the caption
//    total at 20,000, and the archetype spec's stated range of 5,000 to 200,000 cannot be honoured while
//    that distractor exists. The range is narrowed rather than the ceiling raised, because the
//    ceiling is a library-wide invariant and the range is one archetype's parameter. Recorded as a
//    deviation.
//
// 3. `wrong-base` was considered as a fifth procedure and dropped. There is only one total in a
//    single-pie item, the item is a multiplication rather than a division, and no second base
//    exists to get wrong. Nothing defensible to derive.
//
// 4. The asked segment is at least 20%, which is what keeps `complement` inside the 4x near band:
//    complement / answer = (100 - pct) / pct, which is 4.0 at pct 20 and 9.0 at pct 10. Without
//    that bound the near band fails, since `scale-slip` and `wrong-unit` both sit well outside it
//    and only three of five may.
//
// 5. The caption total is a multiple of 100 so that every segment's absolute is a whole number, and
//    awkward in its other digits so it still forces a setup. The spec wants awkward values
//    and a countable unit wants `total x pct` divisible by 100; both hold only for a multiple of
//    100 that is not round, 13,700 rather than 15,000.
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';
import { chartSpec } from '../lib/chart.js';
import { groupDigits, isRound } from '../lib/money.js';

const MIN_SEGMENT   = 10;      // see lib/chart.js
const MIN_ASKED     = 20;      // keeps `complement` inside the 4x near band
const TOTAL_MIN     = 5000;
const TOTAL_MAX     = 19000;   // total / 100 must stay under the 200x option-spread ceiling

const SCENARIOS = [
  { org: 'Marchwood Trust', noun: 'enquiries', unitNoun: 'enquiries', period: 'last year',
    cats: ['Billing', 'Delivery', 'Product fault', 'Returns', 'Account access', 'Website', 'Other'] },
  { org: 'Penhallow Rail', noun: 'delays', unitNoun: 'delayed services', period: 'over the timetable year',
    cats: ['Signalling', 'Rolling stock', 'Weather', 'Staffing', 'Track defect', 'Trespass', 'Other'] },
  { org: 'Ashgrove Clinic', noun: 'referrals', unitNoun: 'referrals', period: 'in the last quarter',
    cats: ['Cardiology', 'Dermatology', 'Orthopaedics', 'Neurology', 'Respiratory', 'Endocrine', 'Other'] },
];

// Integer shares summing to exactly 100, none below the minimum. The spec asks for them to be drawn as
// integers summing to 100 with no rounding drift, so there is no drift to explain to the candidate.
//
// The asked share is placed FIRST at or above 20, and the remainder distributed around it. Drawing
// the whole vector and then looking for a segment at or above 20 rejected 14.5% of attempts, which
// is the pattern the decision log calls a constructive draw: solve for the constrained parameter rather
// than sampling and testing.
// The asked share may also sit ABOVE 50, and that is what opens a third sorted slot rather than two.
// The distractor set is otherwise monotone: `wrong-unit` is a bare percentage and always the
// smallest option, `scale-slip` is ten times the answer and always the largest, so slots 1 and 5 are
// unreachable by construction. `complement` sits above the answer while the asked share is under
// 50% and below it above 50%, and `adjacent` sits on either side depending on the neighbour. Those
// two together put the answer in slot 2, 3 or 4. A high share needs room for the rest, so it is only
// available at four or five segments.
const HIGH_BAND_MAX_SEGMENTS = 5;

// The tight-neighbour invariant wants one option inside 2x of the answer. `complement / answer` is
// (100 - pct) / pct, which is 2.0 at pct 33.3 and closer than that above it, so from 34% upwards the
// complement satisfies the invariant on its own and the adjacent wedge is free. Below 34% it does
// not, and a neighbouring wedge inside 2x is then required. Insisting on that neighbour at every
// share is what blocked the high band: at 55% the remaining wedges sum to 45 across three or more
// segments, so none of them can reach 27.5.
const COMPLEMENT_COVERS_ABOVE = 34;

// Which sorted slot the answer lands in is fully determined by two facts, both visible on the chart
// but neither of them decisive alone:
//
//   options below the answer = wrong-unit, always
//                            + complement, when the asked share exceeds 50%
//                            + adjacent,   when the neighbouring wedge is smaller
//   slot = 1 + that count
//
// so slot 2, 3 or 4 is the whole reachable space and the slot is DRAWN and then realised, rather
// than falling out of the share vector. Reaching for it incidentally left 91% in slot 3.
const SLOT_SHAPES = {
  2: { high: false, neighbourBigger: true  },   // only wrong-unit below
  3: { high: false, neighbourBigger: false },   // wrong-unit and adjacent below
  4: { high: true,  neighbourBigger: false },   // wrong-unit, complement and adjacent below
};

function drawShares(rng, n, targetSlot) {
  const shape = SLOT_SHAPES[targetSlot];
  const roomForRest = 100 - MIN_SEGMENT * (n - 1);
  if (roomForRest < MIN_ASKED) return null;
  if (shape.high && (n > HIGH_BAND_MAX_SEGMENTS || roomForRest < 52)) return null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const askedShare = shape.high
      ? rng.int(52, Math.min(roomForRest, 66))
      : rng.int(MIN_ASKED, Math.min(roomForRest, 44));

    const rest = new Array(n - 1).fill(MIN_SEGMENT);
    let left = 100 - askedShare - MIN_SEGMENT * (n - 1);
    if (left < 0) continue;
    while (left > 0) { rest[rng.int(0, n - 2)]++; left--; }
    if (new Set([askedShare, ...rest]).size !== n) continue;

    // The neighbour is PLACED rather than filtered. Drawing the vector and then hoping an adjacent
    // wedge fell within 2x rejected 29.8% of attempts; choosing which value sits beside the asked
    // one costs nothing and cannot fail once such a value exists in the multiset.
    // The near-band invariant wants three of five options inside 4x, so the adjacent wedge is held
    // inside 4x always, and inside 2x below 34% where the complement does not cover the tight
    // neighbour on its own.
    const band = askedShare < COMPLEMENT_COVERS_ABOVE ? 2 : 4;
    const eligible = rest.filter(v =>
      v * band >= askedShare && askedShare * band >= v
      && (shape.neighbourBigger ? v > askedShare : v < askedShare));
    if (!eligible.length) continue;
    const chosen = rng.pick(eligible);
    const remaining = (() => {
      const copy = [...rest];
      copy.splice(copy.indexOf(chosen), 1);
      return rng.shuffle(copy);
    })();

    // Asked at `at`, the chosen neighbour immediately after it, the rest around them.
    const at = rng.int(0, n - 2);
    const parts = [];
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (i === at) parts.push(askedShare);
      else if (i === at + 1) parts.push(chosen);
      else parts.push(remaining[k++]);
    }
    if (parts.reduce((a, b) => a + b, 0) !== 100) continue;
    if (parts.some(p => p < MIN_SEGMENT)) continue;
    if (new Set(parts).size !== parts.length) continue;
    return { parts, asked: at, neighbour: at + 1, targetSlot };
  }
  return null;
}

// Every absolute is computed as `pct x total / 100`, multiplying before dividing. Written the other
// way round, 23% of 13,700 evaluates to 3151.0000000000005, which is not an integer, and the value
// would either be rejected as a constraint failure or printed with the error in it.
export function formula({ shares, asked, total, neighbour }) {
  const pct = shares[asked];
  const answer = pct * total / 100;
  return {
    pct,
    answer,
    wrongUnit:  pct,
    adjacent:   shares[neighbour] * total / 100,
    complement: total - answer,
    scaleSlip:  answer * 10,
  };
}

export default {
  id: 'c01',
  name: 'Pie chart, share shown and absolute asked',
  group: 'charts',
  tiers: ['warmup', 'standard'],
  desks: [2],
  stimulus: 'chart',
  answerType: 'number',
  targetSeconds: 45,

  constraints: [
    'four to seven segments, every one at least 10 per cent',
    'shares are integers summing to exactly 100, so there is no rounding drift on the chart',
    'segments are labelled with their percentages only, never with an absolute as well',
    'the total appears in the caption and nowhere on the chart',
    'the asked segment is at least 20 per cent, which keeps the complement inside the 4x near band, '
      + 'and sometimes above 50 per cent, which is what puts the answer in a third sorted slot',
    'the caption total is a multiple of 100 that is not round, so every absolute is a whole number '
      + 'and the figure still forces a setup',
    'the caption total is under 20,000, because the wrong-unit option sits total / 100 away from '
      + 'the answer and the option spread ceiling is 200x',
    'a neighbouring segment sits within 2x of the asked one, so something is close enough that '
      + 'magnitude alone cannot resolve the item',
  ],

  errorTypes: ['wrong-unit', 'adjacent-segment', 'complement', 'scale-slip'],

  formulaText: 'segment percentage / 100 x the total stated in the caption',
  formula,


  // THE ESTIMATION ROUTE.
  //
  // 77% of c01's items resolve at one significant figure, which is what a single multiplication with
  // four widely separated distractors looks like. The `wrong-unit` option is the bare percentage, the
  // `scale-slip` is a factor of ten out, and the `complement` is the rest of the pie, so none of them
  // is within reach of a rough answer. The one that is close is the neighbouring wedge, and rounding
  // the total is enough to separate it because the asked segment is at least 20% by constraint.
  //
  // The route multiplies before dividing, which is the ordering c01's own note insists on: written the
  // other way round, 23% of 13,700 evaluates to 3151.0000000000005.
  // ROUNDING RULE, third instance and now stated generally. Round only the factors that DIFFER
  // between the answer and its distractors. The caption total is COMMON to the answer, the
  // neighbouring wedge and the complement, so rounding it scales all of them together: it adds
  // error without adding discrimination, and the route crossed onto the neighbour in 5 of 200
  // items before this. a16 failed the same way on its two prices.
  estimate(p) {
    const total = p.total;
    const value = p.askedPct * total / 100;
    return {
      value,
      text: `${p.askedPct}% of ${total} is about ${Math.round(value)}`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const sc = forced?.scenario ?? rng.pick(SCENARIOS);
    // Slot 4 needs the asked share above 50, which needs room for the rest, so it is only available
    // at four or five segments. Drawn together so the segment count does not silently veto the slot.
    const targetSlot = forced?.targetSlot ?? rng.pick([2, 3, 4]);
    const n = forced?.segments
      ?? (targetSlot === 4 ? rng.int(4, HIGH_BAND_MAX_SEGMENTS) : rng.int(4, 7));

    const drawn = forced?.shares
      ? { parts: forced.shares, asked: forced.asked ?? 0, neighbour: forced.neighbour ?? 1 }
      : drawShares(rng, n, targetSlot);
    if (!drawn) return reject(diag, `no-share-vector-for-slot-${targetSlot}`);
    const shares = drawn.parts;
    if (shares.reduce((a, b) => a + b, 0) !== 100) return reject(diag, 'shares-not-100');

    // A multiple of 100 keeps every absolute whole; `isRound` keeps it from being eyeballable.
    let total = forced?.total ?? null;
    if (total === null) {
      for (let attempt = 0; attempt < 40 && total === null; attempt++) {
        const t = rng.int(TOTAL_MIN / 100, TOTAL_MAX / 100) * 100;
        if (!isRound(t)) total = t;
      }
    }
    if (total === null) return reject(diag, 'no-awkward-total');

    // Placed at or above 20 by construction in drawShares.
    const asked = forced?.asked ?? drawn.asked;
    if (shares[asked] < MIN_ASKED) return reject(diag, 'asked-below-20');

    // Placed adjacent to the asked wedge by construction, and inside 2x of it where the complement
    // does not already cover the tight-neighbour invariant.
    const neighbour = forced?.neighbour ?? drawn.neighbour;
    if (Math.abs(neighbour - asked) !== 1) return reject(diag, 'neighbour-not-adjacent');
    if (shares[asked] < COMPLEMENT_COVERS_ABOVE
        && (shares[neighbour] * 2 < shares[asked] || shares[asked] * 2 < shares[neighbour])) {
      return reject(diag, 'neighbour-not-within-2x');
    }

    const f = formula({ shares, asked, total, neighbour });
    if (!Number.isInteger(f.answer)) return reject(diag, 'answer-not-a-whole-count');
    if (!Number.isInteger(f.adjacent)) return reject(diag, 'adjacent-not-a-whole-count');

    const chart = chartSpec({
      kind: 'pie',
      labelMode: 'percent',
      total,
      caption: `${sc.org}: ${sc.noun} by category ${sc.period}. Total ${groupDigits(total, 0)} ${sc.unitNoun}.`,
      segments: shares.map((p, i) => ({ label: sc.cats[i], value: p, display: `${p}%` })),
    });

    let options;
    try {
      options = assemble({
        correct: { value: f.answer },
        distractors: [
          { value: f.wrongUnit, errorType: 'wrong-unit',
            note: `reported the ${f.pct}% share itself where the question asks for a count of ${sc.unitNoun}` },
          { value: f.adjacent, errorType: 'adjacent-segment',
            note: `read the ${sc.cats[neighbour]} wedge at ${shares[neighbour]}% instead of ${sc.cats[asked]}` },
          { value: f.complement, errorType: 'complement',
            note: `worked out everything that was not ${sc.cats[asked].toLowerCase()}, `
              + `${100 - f.pct}% of the total` },
          { value: f.scaleSlip, errorType: 'scale-slip',
            note: `a factor of ten out, taking ${f.pct}% as ${f.pct} tenths rather than hundredths` },
        ],
        answerType: 'number', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `c01#${rng.seed}`, archetypeId: 'c01', seed: rng.seed, tier,
      stimulusType: 'chart',
      stimulus: {
        text: `${sc.org} categorised every one of its ${sc.noun} ${sc.period}.`,
        chart,
      },
      questionText: `How many ${sc.unitNoun} were recorded as ${sc.cats[asked].toLowerCase()}?`,
      answerType: 'number',
      correct: { value: f.answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: {},
      values: {
        total: groupDigits(total, 0),
        [`${sc.cats[asked]} share`]: `${f.pct}%`,
        answer: groupDigits(f.answer, 0),
      },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `the caption gives the total as ${groupDigits(total, 0)} ${sc.unitNoun}`,
          `${sc.cats[asked]} is labelled ${f.pct}%`,
          `${f.pct} / 100 x ${groupDigits(total, 0)} = ${groupDigits(f.answer, 0)}`,
        ],
      },
      targetSeconds: this.targetSeconds,
      // Desk 02 items carry the stimulus fields an earlier round added. c01 owns its chart outright, one
      // stimulus to one question, so it is always the first and only question on it.
      stimulusId: `c01s#${rng.seed}`, stimulusIndex: 0, firstOnStimulus: true,
      // `askedPct` and `total` added for the estimation route: `asked` is an INDEX, so a
      // route computed from it alone would be arithmetic on a segment number. Additive under 11.3.
      params: { scenario: sc.org, segments: shares.length, asked, targetSlot,
        askedPct: shares[asked], total },
    };
  },
};
