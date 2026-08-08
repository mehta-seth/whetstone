// a10 - Single bar chart with per-bar loss rates
//
// Compute survivors per bar. The tallest bar is not the answer and neither is the lowest loss
// rate. That inversion is the item, and the spec states it as the rule for any bar chart
// whose caption supplies per-bar rates.
//
// WHY THE RATE RANGE IS 5 TO 40 AND NOT the archetype spec's 5 TO 22.
//
// The winner must beat the tallest bar, so
//
//     h_win / h_tall  >  (1 - r_tall) / (1 - r_win)  >=  (1 - rMax) / (1 - rMin)
//
// With rates in 5 to 22% that floor is 0.78 / 0.95 = 0.8211, so the winner is always within
// 17.9% of the tallest bar. On a 500 grid with a tallest bar between 4000 and 5500, exactly one
// gridline value clears the floor, which is why the winner is not merely concentrated at height
// rank 2 but PINNED there. Measured over every legal tuple: 100% at rank 2, and 100% still after
// dropping the tallest-has-worst-rate pairing, after adding a sixth and seventh bar, and after
// tightening the height band to a 250 grid.
//
// The pin is a property of the item type rather than something this build introduced.
// Items of this shape draw loss rates from a plausible narrow band, and within that band
// the winner lands at rank 2 for essentially every legal tuple: a chart where the tallest
// bar also carried the worst rate would be a different question.
//
// That the pin is intrinsic is a real defence and it is not sufficient. The argument is the
// same one a14 raised: a solver who reaches for "second tallest" on a single item of this
// type gets it right, so the heuristic transfers rather than misleading. But a single test
// carries one such item and Whetstone would carry hundreds, and repetition turns a
// legitimate one-off shortcut into a reflex that then fires on a14 and b06 where it fails.
// So the certainty is not shipped.
//
// Widening the rate range to 5 to 40% moves the floor to 0.632, so the winner sits within 37% of
// the tallest rather than 18%. That degrades the leak rather than removing it, and it is the only
// route that keeps the item's teaching point intact. The scenario changed with it, because a 40%
// loss is implausible for manufacturing defects and entirely ordinary for a recruitment funnel.
//
// WIDENING THE RANGE IS NOT ENOUGH ON ITS OWN, and the diagnostic said so. The first build drew
// five rates from the wide pool and then picked uniformly among the legal assignments, which put
// the winner at height rank 2 in 78% of items, worse than the 55% an enumeration over all legal
// tuples predicted. The reason is that a draw whose five realised rates happen to be narrow, say
// 5 / 6 / 8 / 10 / 12, has the tight floor back and only rank 2 is reachable, and such draws are
// as likely as wide ones.
//
// So the winner's height rank is drawn FIRST and the rates are then found to realise it. Ranks 1
// and 5 are barred by the item's own inversion, the tallest bar and the best-rate bar both being
// wrong, so ranks 2 to 4 are the whole reachable space and an even split across them is the
// structural floor: 33%, which is 1.67x chance and reports as concentrated rather than as a leak.
// That floor is irreducible, in the sense the decision log already records for concentration, because
// "never the tallest" is itself a pattern.
//
// Three routes were rejected. Shipping the pin with a note is indefensible, since "pick the
// second tallest" would answer every item. Replacing the rate with a wide-range multiplier
// relocates the same size of leak onto a column that sits in the caption rather than the chart,
// which is easier to scan, so it is worse. Dropping a10 loses the single-bar form, which the real
// paper contains and which a17 does not cover.
//
// NO STEM VARIANT. Varying the stem between most and fewest, as b06 does, is ruled out by the
// visible-split rule: argmax puts the winner at height rank 2 and argmin at rank 5, the stem says
// which, so each half stays pinned and pooling the two would look like a fix without being one.
//
// THE GENERALISATION, recorded because it will recur. For an argmax over a product where the
// winner is barred from being the argmax of either factor, the factor with the narrower relative
// range bounds how far the other can deviate, and the pin lands on the factor with the wider
// range. a10 and b06 share the symptom through different mechanisms, bounded range here and rank
// correlation there, so the fixes do not transfer. Any future product-argmax archetype needs both
// checks.
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { chartSpec } from '../lib/chart.js';
import { groupDigits, roundTo } from '../lib/money.js';

const INTERVAL = 500;               // gridline interval, and the grid, so no midpoints arise
const AXIS_MAX = 6000;
const HEIGHTS  = [3000, 3500, 4000, 4500, 5000, 5500, 6000];
// Rates a recruitment funnel plausibly shows, spread widely enough that a shorter bar can win.
const RATES    = [5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 35, 40];
const MARGIN   = [200, 400];

// Which (height rank, rate rank) the winner may occupy, and how often. Rank 1 is the tallest bar
// and the best rate; both are barred by the item's own inversion, and rank 5 is barred too because
// the shortest bar carries the best rate. So ranks 2 to 4 on each axis is the whole space, and a
// full enumeration over the parameter ranges above shows only SIX of those nine pairs are
// reachable, in a triangle: h4 only with r2, h3 with r2 or r3, h2 with r2, r3 or r4. The deeper a
// bar sits on height, the better its rate has to be for it to win at all.
//
// The weights are the solution to minimising the worse of the two marginals subject to every
// reachable pair carrying at least 8%, so that the allocation is not itself a pattern. It puts both
// marginals at 40% or below against a 48% leak bar, which is as flat as this item's geometry
// allows. Drawing pairs evenly instead gives 56% on height, and drawing height evenly and then
// rate gives 47% and 52%: neither works, because a rank appearing in three pairs carries three
// times the weight of one appearing in a single pair.
// (4,2) is over-weighted against its solved share because it is the rarest pair in the space, 86
// realising assignments against 12,575 in total, so a share of its draws fail to find one and are
// rejected. Weighting it at its solved 22% delivered 17%. This is the only pair that needs the
// compensation.
const RANK_PAIR_WEIGHTS = [
  { h: 2, r: 2, w: 8 }, { h: 2, r: 3, w: 8 }, { h: 2, r: 4, w: 20 },
  { h: 3, r: 2, w: 8 }, { h: 3, r: 3, w: 24 },
  { h: 4, r: 2, w: 34 },
];

const SCENARIOS = [
  { org: 'Aldermay Group', unit: 'applications', pass: 'cleared first-round screening',
    channels: ['Job board', 'Recruitment agency', 'Employee referral', 'Careers site', 'Campus fair'] },
  { org: 'Nyeholt Partners', unit: 'applications', pass: 'passed the online assessment',
    channels: ['Open advert', 'Search firm', 'Alumni network', 'Direct approach', 'Insight day'] },
  { org: 'Craymoor Bank', unit: 'applications', pass: 'reached the assessment centre',
    channels: ['Graduate portal', 'Agency panel', 'Referral scheme', 'University fair', 'Spring week'] },
];

const permute3 = ([a, b, c]) => [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];

// Exported so the archetype spec's machine-verified arithmetic is pinned through the formula rather than
// through a parameter draw, per the spec.
export function formula({ heights, rates }) {
  const through = heights.map((h, i) => roundTo(h * (1 - rates[i] / 100), 4));
  const order = through.map((v, i) => i).sort((a, b) => through[b] - through[a]);
  return {
    through,
    winner: order[0],
    second: order[1],
    third: order[2],
    margin: roundTo(through[order[0]] - through[order[1]], 4),
    tallest: heights.indexOf(Math.max(...heights)),
    bestRate: rates.indexOf(Math.min(...rates)),
  };
}

// Collect legal assignments across many height and rate draws, filed by the winner's rank on BOTH
// visible columns, then let the caller pick a rank pair evenly. Doing this for the height rank
// alone left the rate column leaking at 54%: constraining one factor of a product pushes the pin
// onto the other, which is the generalisation recorded in this file's header. The two have to be
// decorrelated together or not at all.
//
// The archetype spec fixes the worst rate to the tallest bar and the best to the shortest, so only the
// middle three rates permute and each draw yields six candidate assignments.
function findAtRankPair(rng, target, budget = 200) {
  for (let attempt = 0; attempt < budget; attempt++) {
    const heights = rng.shuffle(HEIGHTS).slice(0, 5);
    const tallest = heights.indexOf(Math.max(...heights));
    const shortest = heights.indexOf(Math.min(...heights));
    const middleBars = heights.map((_, i) => i).filter(i => i !== tallest && i !== shortest);
    const hDesc = [...heights].sort((a, b) => b - a);
    const pool = rng.shuffle(RATES).slice(0, 5).sort((a, b) => a - b);
    const worst = pool[4], best = pool[0], mids = [pool[1], pool[2], pool[3]];
    const rAsc = [...pool].sort((a, b) => a - b);
    for (const p of permute3(mids)) {
      const rates = new Array(5);
      rates[tallest] = worst;
      rates[shortest] = best;
      middleBars.forEach((b, k) => { rates[b] = p[k]; });
      const f = formula({ heights, rates });
      if (f.winner === tallest || f.winner === shortest) continue;   // shortest holds the best rate
      if (f.winner === f.bestRate) continue;
      if (f.margin < MARGIN[0] || f.margin > MARGIN[1]) continue;
      if (new Set([f.winner, f.tallest, f.bestRate, f.third]).size !== 4) continue;
      const hRank = hDesc.indexOf(heights[f.winner]) + 1;            // 1 is the tallest
      const rRank = rAsc.indexOf(rates[f.winner]) + 1;               // 1 is the best rate
      if (hRank !== target.h || rRank !== target.r) continue;
      return { heights, rates, f };
    }
  }
  return null;
}

// Weighted draw over the rank pairs, from the seeded rng so the item stays reproducible.
function drawRankPair(rng) {
  const total = RANK_PAIR_WEIGHTS.reduce((a, x) => a + x.w, 0);
  let n = rng.int(1, total);
  for (const p of RANK_PAIR_WEIGHTS) { n -= p.w; if (n <= 0) return p; }
  return RANK_PAIR_WEIGHTS.at(-1);
}

export default {
  id: 'a10',
  name: 'Single bar chart with per-bar loss rates',
  group: 'charts',
  tiers: ['warmup', 'standard'],
  desks: [1],
  stimulus: 'chart',
  answerType: 'label',
  targetSeconds: 83,

  constraints: [
    'every bar height is a multiple of the 500 gridline interval, without exception',
    'the tallest bar carries the worst loss rate and the shortest carries the best',
    'the winner is neither the tallest bar nor the bar with the best rate, and its rank on '
      + 'each is left free rather than pinned to second',
    'the winning margin is 200 to 400, resolvable by calculation but not by eye',
    'the four bars the option set needs, winner and tallest and best-rate and third-on-product, '
      + 'are four distinct bars, leaving one for the filler',
  ],

  // `runner-up` is not in the archetype spec's error type index and needs adding, the same gap as
  // `multiply-back` in open item 11. See the note on the leftover bar in generate.
  errorTypes: ['headline-metric', 'partial-check', 'runner-up', 'filler'],

  formulaText: 'argmax over bar height x (1 - that bar\'s loss rate)',
  formula,

  generate(rng, tier, forced = null, diag = null) {
    const sc = forced?.scenario ?? rng.pick(SCENARIOS);

    let heights = forced?.heights ?? null;
    let chosen = (forced?.heights && forced?.rates)
      ? { rates: forced.rates, f: formula({ heights: forced.heights, rates: forced.rates }) }
      : null;

    if (!chosen) {
      // The rank pair is drawn from the declared weights and then realised, rather than falling
      // out of whatever the parameter draw happened to allow.
      const target = forced?.rankPair ?? drawRankPair(rng);
      const found = findAtRankPair(rng, target);
      if (!found) return reject(diag, `no-assignment-at-${target.h},${target.r}`);
      heights = found.heights;
      chosen = { rates: found.rates, f: found.f };
    }

    const tallest = heights.indexOf(Math.max(...heights));
    const shortest = heights.indexOf(Math.min(...heights));



    const { rates, f } = chosen;
    if (f.winner === f.tallest || f.winner === f.bestRate) return reject(diag, 'winner-is-a-headline');
    if (f.margin < MARGIN[0] || f.margin > MARGIN[1]) return reject(diag, 'margin-out-of-band');
    if (new Set([f.winner, f.tallest, f.bestRate, f.third]).size !== 4) return reject(diag, 'option-bars-collide');

    const labels = sc.channels;
    const leftover = heights.map((_, i) => i).find(i => ![f.winner, f.tallest, f.bestRate, f.third].includes(i));
    if (leftover === undefined) return reject(diag, 'no-bar-left-for-filler');

    // With five bars every label is an option, so the fifth is whatever remains after the answer,
    // the tallest, the best rate and the third-highest are assigned, and its role is emergent
    // rather than chosen. Measured over 200 items it is the RUNNER-UP on survivors in 32% of them,
    // fourth in 56% and last in 13%. The runner-up is the single most reachable wrong answer in the
    // whole set, because one slip on the winning bar lands there, so labelling it "reachable only
    // by guessing" records a near-miss as noise and is a diagnostic error rather than a cosmetic
    // one. The label therefore follows the arithmetic.
    const survivorRank = [...f.through].sort((a, b) => b - a).indexOf(f.through[leftover]) + 1;
    const leftoverIsNearMiss = survivorRank === 2;

    const opt = (i, errorType, note) => ({ value: `c${i}`, display: labels[i], sortKey: i, errorType, note });

    const chart = chartSpec({
      kind: 'bar',
      interval: INTERVAL, grid: INTERVAL, axisMax: AXIS_MAX,
      label: `${sc.unit[0].toUpperCase()}${sc.unit.slice(1)} received`,
      caption: `${sc.org}: ${sc.unit} by source`,
      bars: labels.map((l, i) => ({ label: l, value: heights[i] })),
      // 12.3 puts the per-bar rates in a caption rather than on the chart, so they are text and
      // the grid rule does not apply to them. checkChart only reads `bars`.
      note: 'Percentage rejected at screening: '
        + labels.map((l, i) => `${l} ${rates[i]}%`).join(', ') + '.',
    });

    let options;
    try {
      options = assemble({
        correct: opt(f.winner, null, 'CORRECT'),
        distractors: [
          opt(f.tallest, 'headline-metric',
            `read the tallest bar, the most ${sc.unit}, without applying the rejection rates`),
          opt(f.bestRate, 'headline-metric',
            `read the lowest rejection rate at ${rates[f.bestRate]}% without applying it to a bar`),
          opt(f.third, 'partial-check',
            `worked out the survivors for some bars but not all, and settled on the third highest`),
          ...(leftoverIsNearMiss ? [opt(leftover, 'runner-up',
            `second highest on survivors at ${groupDigits(f.through[leftover], 0)} against `
            + `${groupDigits(f.through[f.winner], 0)}, so one slip on the winning bar lands here`)] : []),
        ],
        filler: leftoverIsNearMiss ? [] : [opt(leftover, 'filler',
          `${survivorRank === 5 ? 'lowest' : 'fourth'} on survivors, so no shortcut and no near miss lands on it`)],
        answerType: 'label', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `a10#${rng.seed}`, archetypeId: 'a10', seed: rng.seed, tier,
      stimulusType: 'chart',
      stimulus: {
        text: `${sc.org} recorded how many ${sc.unit} came from each source this cycle, and what `
          + `percentage of each was rejected at screening.`,
        chart,
      },
      questionText: `Which source produced the most ${sc.unit} that ${sc.pass}?`,
      answerType: 'label',
      correct: { value: `c${f.winner}`, display: labels[f.winner] },
      options, optionContext: {},
      // Read by the audit's column-correlation diagnostic, which otherwise only sees tables.
      // Both columns are visible to the candidate: the heights off the chart, the rates off the
      // caption. This is the diagnostic that decided the rate range, so it is not optional here.
      correlation: {
        keys: labels.map((_, i) => `c${i}`),
        columns: { [`${sc.unit} received`]: heights.slice(), 'Rejected at screening': rates.slice() },
      },
      values: Object.fromEntries(labels.map((l, i) =>
        [l, `${groupDigits(heights[i], 0)} less ${rates[i]}% = ${groupDigits(f.through[i], 0)}`])),
      workings: {
        formulaText: this.formulaText,
        steps: [
          ...labels.map((l, i) =>
            `${l}: ${groupDigits(heights[i], 0)} x (1 - ${rates[i]}%) = ${groupDigits(f.through[i], 0)}`),
          `highest is ${labels[f.winner]} at ${groupDigits(f.through[f.winner], 0)}, `
            + `ahead of ${labels[f.second]} at ${groupDigits(f.through[f.second], 0)} by ${groupDigits(f.margin, 0)}`,
        ],
      },
      targetSeconds: this.targetSeconds,
      params: { scenario: sc.org },
    };
  },
};
