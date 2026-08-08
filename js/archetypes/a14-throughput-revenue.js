import { money, roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { tableSpec } from '../lib/table.js';

// a14 - Throughput times sell-through times price
//
// Units producible per period, then two multipliers. The slowest model to manufacture wins.
//
// ---------------------------------------------------------------------------------
// STRUCTURAL CHANGE, blocker B2. The archetype spec's third distractor is impossible.
//
// It asks for "price times sell-through without dividing by manufacture time", that is
// argmax(s_i · p_i). But revenue is r_i = (M / m_i) · s_i · p_i and the archetype's own
// constraint requires the winner w to be the slowest, m_w = max_i m_i. For w to win,
//
//     s_w p_w / m_w  >  s_i p_i / m_i    =>    s_w p_w  >  s_i p_i · (m_w / m_i)  >=  s_i p_i
//
// since m_w / m_i >= 1. So argmax(s · p) IS the winner, always. Confirmed empirically:
// equal to the winner in 1,670 of 1,670 legal draws, 100.0%. The archetype spec's own fixture shows
// it, model D winning revenue and also holding the highest s · p at 80.75.
//
// Replaced with SELL-THROUGH IGNORED, argmax(units × price) = argmax(p_i / m_i), which is
// not forced. Measured over legal draws, of the three candidates that are not forced:
//
//   argmax(price)           clean in  0.0% of legal draws   the winner needs a high price to win at all
//   argmax(sellThrough)     clean in 25.0%
//   argmax(units × price)   clean in 75.0%                  used
//
// errorType stays `omitted-component`: the omitted component is now the sell-through
// proportion rather than the manufacture time.
//
// SECOND COLLISION, also present in the archetype spec. The `headline-metric` distractor (fastest
// to manufacture) and the `partial-product` distractor (highest units actually sold) land
// on the same model in almost every random draw, because units = M / m varies by a factor
// of 2.2 across the 9 to 20 range while sell-through only varies by 1.48 across 64 to 95%,
// so the unit count dominates the product. In the archetype spec's fixture both are model C, which
// its own note records without noticing that it collapses the option set. Separating them
// requires the fastest model to carry a low sell-through and a near-rival to carry a high
// one, which is a construction, not a draw.
//
// Note also that "fastest to manufacture" and "highest unit count" are the same quantity,
// since units = M / m. They are one distractor, not two.
//
// ---------------------------------------------------------------------------------
// So the five models are built to roles rather than sampled, winner first:
//
//   W  slowest, high sell-through, high price               the answer
//   F  fastest, low sell-through and low price              headline-metric
//   S  second fastest, high sell-through                    partial-product
//   X  third, high price and low sell-through               omitted-component
//   spare   placed 2 to 8% behind W on revenue               pins the margin band
//
// THE SPARE MODEL IS NOT FILLER AND WAS MISLABELLED AS SUCH. Because its revenue rate
// is set just below the winner's, it is the RUNNER-UP on revenue in 53% of items and third in a
// further 30%, and its note read "filler, no shortcut lands on this model". The runner-up is the
// most reachable wrong answer in the set, since one slip on the winning model lands there, so
// calling it filler recorded a near-miss as noise on the dashboard. The construction is unchanged,
// because placing it close behind W is what pins the margin band. Only the label follows the
// arithmetic now.
//
// The winner's revenue rate R = s_w p_w / m_w is fixed first and becomes a per-model cap on
// s_i p_i, so every other model is drawn inside a feasible box instead of drawn freely and
// rejected. Drawing the winner last instead rejected 38.8% of attempts on its price alone.
//
// Role assignment is shuffled across the model letters and the table is listed by letter, so
// the answer's row position is uniform rather than always last.
//
// ---------------------------------------------------------------------------------
// STRUCTURAL CHANGE 2: the winner is at no column extreme.
//
// The archetype spec pins the winner to the slowest manufacture time outright, so argmax(mfg time)
// equals the answer in 100% of items. That is a zero-arithmetic heuristic: notice it once and
// score forever without reading a price. The source has it too, D slowest and D correct, and
// the drill-set note calls the inversion "the entire item". But the source is one item seen
// once, and generating hundreds converts a design feature into an exploit.
//
// The audit's column-correlation diagnostic also caught two more that were nobody's stated
// constraint: the winner held the highest sell-through in 54% of items and the highest price
// in 69%, against a 20% chance rate. Both follow from drawing the winner's sell-through and
// price at the top of their ranges, which it needed in order to overcome being the slowest.
//
// So the winner now sits in the slower half without being the slowest, mfg rank 3 or 4 of 5,
// and is required to be at neither extreme of any of the three visible columns. The inversion
// survives as a strong tendency, the fastest model still loses, and none of the three columns
// answers the question on its own.

const SCENARIOS = [
  { org: 'Kessler Instruments', line: 'assembly line', unit: 'meter', units: 'meters' },
  { org: 'Bridgeforth Ceramics', line: 'kiln line', unit: 'planter', units: 'planters' },
  { org: 'Ostrava Tooling', line: 'machining cell', unit: 'clamp', units: 'clamps' },
  { org: 'Lindqvist Optics', line: 'polishing line', unit: 'lens', units: 'lenses' },
];

const LETTER_SETS = [['A', 'B', 'C', 'D', 'E'], ['J', 'K', 'L', 'M', 'N'], ['P', 'Q', 'R', 'S', 'T']];

// Exported so the fixture harness can pin the arithmetic independently of the parameter
// draw, per the spec. This is what keeps the archetype spec's machine-verified five-model
// figures as a live test even though its parameters are rejected by the constraints above.
export function formula({ models, hoursPerDay, daysPerWeek }) {
  const minutes = hoursPerDay * 60 * daysPerWeek;
  const rows = models.map(m => {
    const units = minutes / m.mfgTime;
    return { key: m.key, units, sold: units * m.sellThrough, revenue: units * m.sellThrough * m.price };
  });
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const out = { minutes, winner: sorted[0].key,
    margin: roundTo((sorted[0].revenue - sorted[1].revenue) / sorted[0].revenue * 100, 2) };
  for (const r of rows) out['revenue_' + r.key] = roundTo(r.revenue, 2);
  return out;
}

export default {
  id: 'a14',
  name: 'Throughput times sell-through times price',
  group: 'comparison',
  desks: [1],
  tiers: ['hard'],
  stimulus: 'table',
  answerType: 'label',
  targetSeconds: 83,

  constraints: [
    'the fastest to manufacture loses, and the winner sits in the slower half but is not the slowest',
    'the winner is at neither extreme of manufacture time, sell-through or price',
    'no two models tie on revenue',
    'at least one model produces a non-integer unit count, discouraging exhaustive computation',
    'the winning margin is between 1% and 8% of the winner, so it is decidable but not visible',
    'the fastest model, the highest units-sold model and the highest units-times-price model '
      + 'are three distinct models, none of them the winner',
  ],

  errorTypes: ['headline-metric', 'partial-product', 'omitted-component', 'runner-up'],

  formulaText: '(minutes available ÷ minutes per unit) × proportion sold × price, highest wins',

  formula,

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const scenario    = f.scenario    ?? rng.pick(SCENARIOS);
    const letters     = f.letters     ?? rng.pick(LETTER_SETS);
    const hoursPerDay = f.hoursPerDay ?? rng.int(8, 10);
    const daysPerWeek = f.daysPerWeek ?? rng.int(5, 6);
    const minutes = hoursPerDay * 60 * daysPerWeek;

    let models = f.models ?? null;
    if (!models) {
      const times = new Set();
      while (times.size < 5) times.add(rng.int(9, 20));
      const sorted = [...times].sort((a, b) => a - b);
      if (sorted[4] - sorted[0] < 6) return reject(diag, 'time-spread');

      // Winner in the slower half but not the slowest: rank 3 or 4 of 5.
      const wRank = rng.pick([2, 3]);
      const mW = sorted[wRank];
      const rest = sorted.filter((_, i) => i !== wRank);
      const mF = rest[0];                       // fastest, always a distractor
      const [mS, mX, mFil] = rest.slice(1);

      // Winner's sell-through and price drawn away from the tops of their ranges, which it can
      // afford now that it is not the slowest. The extreme checks below enforce it.
      const stW = rng.int(72, 90) / 100, pW = rng.int(58, 80);
      const R = stW * pW / mW;
      const cap = m => R * m / 1.02;

      const stF = rng.int(64, 70) / 100;
      const pFhi = Math.min(50, Math.floor(cap(mF) / stF));
      if (pFhi < 37) return reject(diag, 'fastest-box-empty');
      const pF = rng.int(37, pFhi);

      const stSlo = Math.ceil(100 * stF * mS / mF) + 1;
      const stShi = Math.min(95, Math.floor(100 * cap(mS) / 37));
      if (stSlo > stShi) return reject(diag, 'sold-box-empty');
      const stS = rng.int(stSlo, stShi) / 100;
      const pShi = Math.min(60, Math.floor(cap(mS) / stS));
      if (pShi < 37) return reject(diag, 'sold-price-box-empty');
      const pS = rng.int(37, pShi);

      const pXlo = Math.max(Math.floor(pF * mX / mF), Math.floor(pS * mX / mS)) + 1;
      if (pXlo > 85) return reject(diag, 'price-box-empty');
      const pX = rng.int(pXlo, 85);
      const stXhi = Math.min(80, Math.floor(100 * cap(mX) / pX));
      if (stXhi < 64) return reject(diag, 'price-sell-box-empty');
      const stX = rng.int(64, stXhi) / 100;

      const sp = R * mFil / rng.float(1.02, 1.08);
      const stLo = Math.max(64, Math.ceil(100 * sp / 85));
      const stHi = Math.min(95, Math.floor(100 * sp / 37));
      if (stLo > stHi) return reject(diag, 'filler-box-empty');
      const stFil = rng.int(stLo, stHi) / 100;
      const pFil = Math.round(sp / stFil);
      if (pFil < 37 || pFil > 85) return reject(diag, 'filler-price-range');

      models = rng.shuffle([
        { mfgTime: mW,   sellThrough: stW,   price: pW },
        { mfgTime: mF,   sellThrough: stF,   price: pF },
        { mfgTime: mS,   sellThrough: stS,   price: pS },
        { mfgTime: mX,   sellThrough: stX,   price: pX },
        { mfgTime: mFil, sellThrough: stFil, price: pFil },
      ]).map((m, i) => ({ ...m, key: letters[i] }));
    }
    if (models.length !== 5) return reject(diag, 'model-count');

    // Every constraint re-checked against the finished numbers, whatever their origin, so a
    // forced fixture is held to exactly the same bar as a generated item.
    const d = formula({ models, hoursPerDay, daysPerWeek });
    const units = models.map(m => minutes / m.mfgTime);
    const revenue = models.map(m => d['revenue_' + m.key]);
    if (new Set(revenue.map(r => r.toFixed(4))).size !== 5) return reject(diag, 'revenue-tie');
    if (!units.some(u => !Number.isInteger(u))) return reject(diag, 'all-unit-counts-integer');

    const argmax = vals => {
      const hi = Math.max(...vals);
      return vals.filter(v => v === hi).length === 1 ? vals.indexOf(hi) : -1;
    };
    const w = argmax(revenue);
    if (w < 0) return reject(diag, 'revenue-tie');
    if (d.margin < 1 || d.margin > 8) return reject(diag, 'margin-band');

    // The winner at either extreme of any visible column is a shortcut that needs no
    // arithmetic. It must still be in the slower half, so the inversion the item teaches
    // survives, but it must not be the slowest.
    const extreme = vals => vals[w] === Math.max(...vals) || vals[w] === Math.min(...vals);
    const times = models.map(m => m.mfgTime);
    if (extreme(times)) return reject(diag, 'mfg-extreme');
    if (extreme(models.map(m => m.sellThrough))) return reject(diag, 'sellthrough-extreme');
    if (extreme(models.map(m => m.price))) return reject(diag, 'price-extreme');
    const mfgRank = [...times].sort((a, b) => a - b).indexOf(times[w]) + 1;
    if (mfgRank < 3) return reject(diag, 'winner-too-fast');

    const pFast = argmax(units);                                        // = argmin(mfgTime)
    const pSold = argmax(units.map((u, i) => u * models[i].sellThrough));
    const pPrice = argmax(units.map((u, i) => u * models[i].price));
    const picks = [pFast, pSold, pPrice];
    if (picks.some(i => i < 0)) return reject(diag, 'distractor-tie');
    if (new Set(picks).size !== 3) return reject(diag, 'distractor-collision');
    if (picks.includes(w)) return reject(diag, 'distractor-is-answer');

    const spare = [0, 1, 2, 3, 4].find(i => !picks.includes(i) && i !== w);
    if (spare === undefined) return reject(diag, 'no-spare-label');

    // What the spare model turns out to be on the correct calculation, which decides its label.
    // Revenue is units x sell-through x price, the same series the answer is the argmax of.
    const rev = units.map((u, i) => u * models[i].sellThrough * models[i].price);
    const spareRank = [...rev].sort((a, b) => b - a).indexOf(rev[spare]) + 1;

    const label = i => `Model ${models[i].key}`;
    const n0 = v => v.toLocaleString('en-GB', { maximumFractionDigits: 0 });

    let options;
    try {
      options = assemble({
        correct: { value: models[w].key, display: label(w), sortKey: w },
        distractors: [
          { value: models[pFast].key, display: label(pFast), sortKey: pFast, errorType: 'headline-metric',
            note: `took the highest unit count, ${n0(units[pFast])} a week, without pricing it` },
          { value: models[pSold].key, display: label(pSold), sortKey: pSold, errorType: 'partial-product',
            note: `took the highest number of ${scenario.units} actually sold, `
                + `${n0(units[pSold] * models[pSold].sellThrough)}, without pricing them` },
          { value: models[pPrice].key, display: label(pPrice), sortKey: pPrice, errorType: 'omitted-component',
            note: `priced everything produced but ignored the proportion that sells` },
          ...(spareRank === 2 ? [{ value: models[spare].key, display: label(spare), sortKey: spare,
            errorType: 'runner-up',
            note: `second highest on revenue at ${n0(rev[spare])} against ${n0(rev[w])}, `
                + `so one slip on the winning model lands here` }] : []),
        ],
        filler: spareRank === 2 ? [] : [
          { value: models[spare].key, display: label(spare), sortKey: spare,
            note: `${spareRank}${spareRank === 3 ? 'rd' : 'th'} on revenue, so no shortcut and no near miss lands on it` },
        ],
        answerType: 'label',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const table = tableSpec({
      head: ['Model', 'Minutes to make one', 'Proportion sold', 'Price each'],
      keys: models.map(m => m.key),
      body: models.map(m => [`Model ${m.key}`, String(m.mfgTime),
        `${Math.round(m.sellThrough * 100)}%`, money(m.price, '£', 0)]),
    });

    const values = { minutes, margin: d.margin, winnerMfgRank: mfgRank };
    for (const m of models) values['revenue_' + m.key] = d['revenue_' + m.key];

    return {
      id: `a14#${rng.seed}`,
      archetypeId: 'a14',
      seed: rng.seed,
      tier,
      stimulusType: 'table',
      stimulus: {
        table,
        text: `${scenario.org} runs one ${scenario.line} for ${hoursPerDay} hours a day, `
            + `${daysPerWeek} days a week. Each model takes the number of minutes shown to make. `
            + `The proportion shown is the share of everything produced that sells. `
            + `Whatever does not sell brings in nothing.`,
      },
      // The line can only run one model at a time, so the question has to say so. Without
      // that the stem admits a second reading in which the models share the week.
      questionText: `If the ${scenario.line} produced nothing but one model for a whole week, `
                  + `which model would bring in the most money?`,
      answerType: 'label',
      correct: { value: models[w].key, display: label(w) },
      options,
      optionContext: {},
      values,
      workings: {
        formulaText: this.formulaText,
        steps: [
          `minutes available = ${hoursPerDay} × 60 × ${daysPerWeek} = ${n0(minutes)}`,
          ...models.map((m, i) => `${label(i)} = ${n0(minutes)} ÷ ${m.mfgTime} `
            + `× ${Math.round(m.sellThrough * 100)}% × ${money(m.price, '£', 0)} `
            + `= ${units[i].toFixed(2)} × ${Math.round(m.sellThrough * 100)}% × ${money(m.price, '£', 0)} `
            + `= ${money(revenue[i], '£', 2)}`),
          `highest is ${label(w)} at ${money(revenue[w], '£', 2)}, ahead of the next by ${d.margin}%`,
        ],
      },
      targetSeconds: 83,
      params: { scenario, letters, hoursPerDay, daysPerWeek, models },
    };
  },
};
