// a17 - Grouped bar chart to group totals to a margin
//
// Sum the bars per group, difference two groups, then apply a margin. Differencing before
// applying the margin is the shortcut worth teaching, and the item is built so that doing it
// the long way and the short way agree, because they must.
//
// THE READING GEOMETRY, decided earlier.
//
// The archetype spec asks for values at 0.5 precision on a 0 to 22 axis. The spec asks for
// exact recoverability and 12.4 accepted "nonzero" reading error, which contradict: a 0.5 grid
// with an interval of 0.5 puts 45 horizontal lines on the axis, and an interval of 2 puts the
// values at unreadable quarter positions. The resolution is the amended rule in lib/chart.js:
// interval 1, values on a 0.5 grid, so every bar sits either on a line or at an exact midpoint,
// and the axis label states the precision. That buys exactness rather than compromising for
// it: an axis running 0 to 22 with gridlines every 1 and a label reading "rounded to the
// nearest 0.5 million" is exactly readable at every bar.
// The note is mandatory, not decorative. It is what licenses the half-gridline read, and
// validate.checkChart rejects a midpoint value without it.
//
// THE OPTION SET IS NOT the archetype spec', AND THE REASON IS STRUCTURAL. An earlier round, second pass.
//
// The archetype spec names three rate-omission distractors: the raw difference, and the difference with one
// of the two rates applied. All three sit on the SAME chart quantity as the answer, the difference
// between the two compared group totals, and differ from it only by factors the stem prints. That
// makes the answer recoverable without reading the chart at all. Two attacks were measured at 100%
// of 400 items:
//
//   RATIO    the four options on that quantity stand in the ratio 1 : 1-rMin : 1-rMax : 1-r1-r2,
//            computable from the printed rates. Find the four-subset matching it, take the smallest.
//   LARGEST  simpler and worse. The raw difference is the largest option in 100% of items, so:
//            take the largest option and multiply by the retained fraction. One multiplication.
//            Total four groups, sum sixteen bars, read the chart: none of it.
//
// Stated properly it is a span problem. Write each option as a vector over the chart's unknowns; a
// candidate holding only the stem may scale any option by a stem-known number and add. The answer
// leaks exactly when its vector lies in the span of the distractors', and separately, any stem-known
// linear relation among the distractors marks them as a family and leaves the answer identifiable as
// what remains. Over the three unknowns the archetype spec allows, T_early, T_mid and T_late, since it fixes
// two group totals equal, EVERY four-distractor set fails one test or the other. Enumerated:
//
//   raw gap, one-rate x2, wrong pair          answer in span     and a family
//   raw gap, wrong pair x2, wrong pair late    answer in span     and a family
//   wrong pair x2, wrong pair late, late total answer in span     and a family
//   wrong pair x3, late total                  safe span          but a family
//   wrong pair x2, late total, early total     answer in span     and a family
//
// So nothing built from group totals alone can work, and the fix has to add unknowns. Distractors
// built on PARTIAL group sums do that, because individual bars enter the space: sixteen unknowns
// rather than three. Enumerated over those, exactly one shape is sound on both tests, and it needs
// the two middle groups to carry DIFFERENT totals, which is a further deviation from the archetype spec:
//
//   two omissions of a quarter from the earlier group, plus two wrong pairs on the two middle groups
//
// `omitted-final-step` cannot appear at all. The raw difference has the answer's exact direction, so
// including it leaks by construction, whatever else is in the set.
//
// The proposal to keep it by making the giveaway ratio AMBIGUOUS rather than absent was measured and
// rejected. Adding a wrong-pair and a wrong-pair-without-deduction on the middle group does put two
// pairs at the ratio 1/retain, and the ratio attack does become ambiguous in 99.7% of items, but a
// coin flip after one multiplication is an expected hit rate of 50.0%, which is 2.50x chance and above
// the leak band. The shipped set measures 19.7%, or 0.98x, exactly baseline. Cheaper to execute and
// more accurate than the a16 narrowing that prompted the question, so it fails on its own terms.
//
// The coverage loss is also smaller than it looked: `omitted-final-step` is declared by a03 and a15
// as well, and both emit it in 100% of their items, so the family is drilled twice elsewhere. What
// a17 loses is that family ON A CHART, which is a narrower gap than losing the family.
//
// A residual shortcut remains and is a different class. The answer and the one-quarter omission
// differ by exactly one late bar times the retained fraction, so a candidate could read the four
// early bars and look for the option pair separated by one of them. That needs the chart, which is
// what the item is for, so it is not the bypass this rewrite was for.
//
// THE FIFTH OPTION.
//
// The archetype spec's own count came to four options where five are required, and the set is replaced
// wholesale for the reason above. The wrong-pair trap it designs in survives and is stronger: with
// four distinct group totals there are two wrong pairs to fall for rather than one.
//
// DEVIATION FROM the archetype spec, measured. Its constraint "the two compared group totals are a
// clean 10 apart" makes the answer `10 x retain`, a pure function of the rate pair, which the
// stem prints. Over 400 items that gave FOUR distinct answers, 6.0 / 6.3 / 6.5 / 7.0, with 7.0
// alone on 41.5%: a candidate reads the two rates, multiplies, and never looks at the chart.
// The difference is therefore drawn across the 0.5 grid instead. A calculator is permitted on
// both desks (the spec), so a clean difference buys nothing that justifies handing
// over the answer. The 10-apart case still occurs, as one draw among many.
//
// POSITION. Both omission distractors sit ABOVE the answer, since dropping a quarter from the
// earlier group makes the difference larger. The two wrong-pair options sit either side depending on
// whether each middle total exceeds the later one, so the count below the answer is the number of
// middle groups under it and slots 1, 2 and 3 are the reachable space. Slot 1 is reached when both
// middles exceed the later total, which open item 9 records as a slot almost nothing in the library
// reaches. The slot is drawn and then realised, as in a10, c01 and c02.
//
// The borderline `midSide` variant from the first pass is gone with the option set that created it.
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';
import { chartSpec } from '../lib/chart.js';
import { money, roundTo } from '../lib/money.js';
import { naturalDp } from '../lib/format.js';

const AXIS_MAX  = 22;
const INTERVAL  = 1;
const GRID      = 0.5;
const PRECISION = 'rounded to the nearest 0.5 million dollars';

// Deduction pairs. The archetype spec says "typically 10% and 20%", so the pair is drawn rather than
// fixed, and the two rates always differ so that the two omitted-component distractors are
// distinct from each other.
const RATE_PAIRS = [[10, 20], [10, 25], [12, 18], [15, 20], [8, 22], [12, 25], [10, 30], [15, 25]];

const SCENARIOS = [
  { firm: 'Halverson Freight', unit: 'sales', a: 'distribution charge', b: 'sales commission' },
  { firm: 'Torrance Marine',   unit: 'sales', a: 'port handling levy',  b: 'agency commission' },
  { firm: 'Bellamy Textiles',  unit: 'sales', a: 'shipping surcharge',  b: 'wholesaler margin' },
  { firm: 'Kastner Tooling',   unit: 'sales', a: 'freight allowance',   b: 'dealer commission' },
];

// Split a total into `n` bars on the 0.5 grid, each inside [lo, hi], drawn rather than
// solved so the quarters look like real quarters. Returns null if the total cannot be split,
// which the caller treats as a rejected parameter draw.
function splitTotal(rng, total, n, lo, hi) {
  const units = Math.round(total / GRID), loU = Math.round(lo / GRID), hiU = Math.round(hi / GRID);
  if (units < loU * n || units > hiU * n) return null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const parts = [];
    let left = units;
    for (let i = 0; i < n - 1; i++) {
      const remaining = n - 1 - i;
      const min = Math.max(loU, left - hiU * remaining);
      const max = Math.min(hiU, left - loU * remaining);
      if (min > max) { parts.length = 0; break; }
      const v = rng.int(min, max);
      parts.push(v); left -= v;
    }
    if (!parts.length && n > 1) continue;
    if (left < loU || left > hiU) continue;
    parts.push(left);
    const bars = rng.shuffle(parts).map(u => u * GRID);
    // Two identical quarters inside one group is legal but reads as a rendering error, and a
    // real chart rarely shows it. Cheap to forbid.
    if (new Set(bars).size !== bars.length) continue;
    return bars;
  }
  return null;
}

// Exported so the fixture pins the arithmetic and nothing else, per the spec.
export function formula({ earlyTotal, lateTotal, mid1Total, mid2Total, r1, r2, dropOne, dropTwo }) {
  const retain = roundTo(1 - (r1 + r2) / 100, 4);
  const rise   = roundTo(lateTotal - earlyTotal, 4);
  return {
    retain, rise,
    answer:    roundTo(rise * retain, 4),
    // Summed only three of the four earlier quarters, so the rise comes out too large.
    missOne:   roundTo((rise + dropOne) * retain, 4),
    // Summed only two of them.
    missTwo:   roundTo((rise + dropOne + dropTwo) * retain, 4),
    // Differenced the earlier group against a middle group rather than the later one.
    wrongMid1: roundTo((mid1Total - earlyTotal) * retain, 4),
    wrongMid2: roundTo((mid2Total - earlyTotal) * retain, 4),
  };
}

// The archetype spec's OWN FIXTURE PARAMETERS ARE NOW ILLEGAL, and the formula() export above
// is what keeps their arithmetic pinned, which is the spec's route and a12's precedent. The
// document's set gives an answer of 7.00 against distractors of 3.50, 9.45, 15.40 and 24.15, so
// the answer is the only option with an empty fractional part and "pick the one with no pence"
// names it with no arithmetic. An earlier round made that a central check in validate, which rejects
// these parameters at 4.2% of attempts. The arithmetic is unchanged and still verified; only the
// option set those particular parameters produce is inadmissible. The fixture moved to the
// formula level and a legal parameter set pins the generate path alongside it.

export default {
  id: 'a17',
  name: 'Grouped bar chart to group totals to a margin',
  group: 'charts',
  tiers: ['standard', 'hard'],
  desks: [1],
  stimulus: 'chart',
  answerType: 'currency',
  targetSeconds: 83,

  // Both variants are visible in the stem before any arithmetic: it names which two years to
  // compare. Declared so the audit splits its diagnostics per variant rather than pooling,
  // which is what hid b02's and b06's leaks inside their own averages.
  constraints: [
    'every bar lands on the 0.5 grid, so each sits on a gridline or at an exact midpoint',
    'the axis label states the 0.5 precision, which is what licenses a half-gridline read',
    'the compared group totals differ by 6.5 to 15.0, on the 0.5 grid',
    'all four group totals are distinct, so both middle groups are live wrong pairs and the '
      + 'distractor set spans enough chart unknowns to keep the answer out of it',
    'no option sits on the same chart quantity as the answer, so no option is a stem-known '
      + 'multiple of it and the item cannot be solved from the printed rates alone',
    'the answer lands exactly on the decimal count the option set is printed at',
    'all five options distinct, positive, and inside the spread rules',
  ],

  errorTypes: ['omitted-component', 'wrong-pair'],

  formulaText: '(later group total - earlier group total) x (1 - r1 - r2)',
  formula,


  // THE ESTIMATION ROUTE, and here it is the taught method rather than an
  // approximation of it.
  //
  // The archetype spec names the shortcut explicitly: difference the two group totals BEFORE applying the
  // margin. Every bar sits on the 0.5 grid so the two sums are read exactly, and the only rounding
  // is in the final multiplication. That is why 90% of items resolve at one significant figure while
  // the four distractors, all partial group sums, sit far enough out to be eliminated on magnitude.
  //
  // The route deliberately does NOT show the sixteen bars. Summing the earlier group's four bars and
  // the later group's four bars is the work; the route shows what to do with the two numbers once
  // you have them, which is the step candidates get wrong by applying the margin to each total
  // separately and then differencing.
  estimate(p) {
    const retain = 1 - (p.rates[0] + p.rates[1]) / 100;
    const value = p.rise * retain;
    return {
      value,
      text: `the later group clears the earlier one by about ${p.rise}, and ${p.rates[0]}% plus `
        + `${p.rates[1]}% off leaves ${retain.toFixed(2)} of it, so about ${value.toFixed(1)}`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const sc = forced?.scenario ?? rng.pick(SCENARIOS);
    const [r1, r2] = forced?.rates ?? rng.pick(RATE_PAIRS);
    const rMax = Math.max(r1, r2), rMin = Math.min(r1, r2);

    // How many middle totals sit below the later one decides the answer's sorted slot, because both
    // omission options are above it by construction. Drawn first, then realised.
    const targetSlot = forced?.targetSlot ?? rng.pick([1, 2, 3]);
    const belowCount = targetSlot - 1;

    const earlyTotal = forced?.earlyTotal ?? rng.int(88, 112) / 2;      // 44.0 to 56.0 on the grid
    const rise       = forced?.rise ?? rng.int(13, 30) / 2;            // 6.5 to 15.0 on the grid
    const lateTotal  = roundTo(earlyTotal + rise, 4);

    // Middle totals: `belowCount` of them between the compared pair, the rest above the later one.
    // All four distinct, which the archetype spec forbids and the span argument requires.
    // Injected parameters short-circuit the draw entirely, so a fixture pins the arithmetic and
    // nothing else. The spec.
    const mids = forced?.mids ? [...forced.mids] : [];
    for (let i = 0; i < 2 && !forced?.mids; i++) {
      const below = i < belowCount;
      for (let attempt = 0; attempt < 40 && mids.length === i; attempt++) {
        const v = below
          ? roundTo(earlyTotal + rng.int(2, Math.max(2, Math.round(rise * 2) - 2)) / 2, 4)
          : roundTo(lateTotal + rng.int(1, 12) / 2, 4);
        if (v === earlyTotal || v === lateTotal || mids.includes(v)) continue;
        if (below && v >= lateTotal) continue;
        if (!below && v <= lateTotal) continue;
        mids.push(v);
      }
    }
    if (mids.length !== 2) return reject(diag, `no-middle-totals-for-slot-${targetSlot}`);
    const [mid1Total, mid2Total] = forced?.mids ?? mids;

    const totals = [earlyTotal, mid1Total, mid2Total, lateTotal];
    if (new Set(totals).size !== 4) return reject(diag, 'group-totals-not-distinct');
    if (totals.some(x => x > 4 * AXIS_MAX)) return reject(diag, 'group-total-above-axis');

    // Bars, and the two earlier quarters an inattentive reader drops.
    const bars = forced?.bars ?? totals.map(x =>
      splitTotal(rng, x, 4, Math.max(6, x / 4 - 4.5), Math.min(AXIS_MAX, x / 4 + 4.5)));
    if (bars.some(b => b === null)) return reject(diag, 'no-legal-quarter-split');
    const earlyBars = [...bars[0]].sort((a, b) => a - b);
    const dropOne = forced?.dropOne ?? earlyBars[0];
    const dropTwo = forced?.dropTwo ?? earlyBars[1];

    const f = formula({ earlyTotal, lateTotal, mid1Total, mid2Total, r1, r2, dropOne, dropTwo });
    if (f.answer <= 0) return reject(diag, 'non-positive-answer');
    if (f.wrongMid1 <= 0 || f.wrongMid2 <= 0) return reject(diag, 'non-positive-wrong-pair');
    const dp = Math.max(...[f.answer, f.missOne, f.missTwo, f.wrongMid1, f.wrongMid2].map(naturalDp));
    if (dp > 2) return reject(diag, 'answer-not-exact-at-2dp');

    const years = [];
    const y0 = forced?.startYear ?? rng.int(2017, 2021);
    for (let i = 0; i < 4; i++) years.push(String(y0 + i));

    const chart = chartSpec({
      kind: 'grouped',
      interval: INTERVAL, grid: GRID, axisMax: AXIS_MAX,
      label: 'Sales in millions of dollars',
      precisionNote: PRECISION,
      caption: `${sc.firm}: quarterly ${sc.unit} by year`,
      seriesLabels: ['Q1', 'Q2', 'Q3', 'Q4'],
      groups: years.map((y, i) => ({ label: y, values: bars[i] })),
    });

    const ctx = { currencySymbol: '$', dp };
    const show = v => `${money(v, '$', dp)}m`;
    let options;
    try {
      options = assemble({
        correct: { value: f.answer, display: show(f.answer) },
        distractors: [
          { value: f.missOne, display: show(f.missOne), errorType: 'omitted-component',
            note: `summed only three quarters of ${years[0]}, missing ${show(dropOne).replace('$', '')} `
              + `worth, so the rise came out too large` },
          { value: f.missTwo, display: show(f.missTwo), errorType: 'omitted-component',
            note: `summed only two quarters of ${years[0]}, missing two of them` },
          { value: f.wrongMid1, display: show(f.wrongMid1), errorType: 'wrong-pair',
            note: `differenced ${years[0]} against ${years[1]} rather than ${years[3]}` },
          { value: f.wrongMid2, display: show(f.wrongMid2), errorType: 'wrong-pair',
            note: `differenced ${years[0]} against ${years[2]} rather than ${years[3]}` },
        ],
        answerType: 'currency', context: ctx, rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `a17#${rng.seed}`, archetypeId: 'a17', seed: rng.seed, tier,
      stimulusType: 'chart',
      stimulus: {
        text: `${sc.firm} reports quarterly ${sc.unit} for four years. Any increase in ${sc.unit} `
          + `carries a ${r1}% ${sc.a} and a ${r2}% ${sc.b}, both deducted from the increase.`,
        chart,
      },
      questionText: `What did ${sc.firm} retain from the rise in total ${sc.unit} between `
        + `${years[0]} and ${years[3]}?`,
      answerType: 'currency',
      correct: { value: f.answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: ctx,
      values: {
        [`${years[0]} total`]: earlyTotal.toFixed(1),
        [`${years[3]} total`]: lateTotal.toFixed(1),
        rise: f.rise.toFixed(1),
        retained: `${roundTo(f.retain * 100, 0)}%`,
      },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `${years[0]}: ${bars[0].map(v => v.toFixed(1)).join(' + ')} = ${earlyTotal.toFixed(1)}`,
          `${years[3]}: ${bars[3].map(v => v.toFixed(1)).join(' + ')} = ${lateTotal.toFixed(1)}`,
          `rise ${lateTotal.toFixed(1)} - ${earlyTotal.toFixed(1)} = ${f.rise.toFixed(1)}`,
          `deductions ${r1}% + ${r2}% = ${r1 + r2}%, so ${roundTo(f.retain * 100, 0)}% is retained`,
          `${f.rise.toFixed(1)} x ${f.retain.toFixed(2)} = ${show(f.answer)}`,
        ],
      },
      targetSeconds: this.targetSeconds,
      params: { scenario: sc.firm, rates: [r1, r2], rise, targetSlot, startYear: y0 },
    };
  },
};
