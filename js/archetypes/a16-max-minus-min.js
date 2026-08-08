import { money, roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';

// a16 - Multi-seller maximum minus minimum
//
// Compute all three fully. Neither category leader wins.
//
// Constructed, not sampled. Over 268,072 random draws only 804 satisfied every stated
// constraint at once, 0.30%: the leadership pattern, all three totals within 6%, and both
// adjacent-pair gaps differing from the answer. So the third seller's counts are drawn first,
// the two category leaders are built to lead their own product, and their second counts are
// solved from a target total rather than drawn.

const MARKETS = [
  { org: 'a garden centre', sellers: ['Ravi', 'Delphine', 'Toma'],
    x: { s: 'shrub', p: 'shrubs' }, y: { s: 'planter', p: 'planters' } },
  { org: 'a craft fair', sellers: ['Nuala', 'Bertrand', 'Sasha'],
    x: { s: 'wall hanging', p: 'wall hangings' }, y: { s: 'ceramic bowl', p: 'ceramic bowls' } },
  { org: 'a farm shop', sellers: ['Emeka', 'Fenella', 'Janusz'],
    x: { s: 'cheese wheel', p: 'cheese wheels' }, y: { s: 'cured ham', p: 'cured hams' } },
];

// Slot 4 is over-weighted against an even draw because it survives the enumeration far less
// often than slot 3 does, and an even draw over targets does not give an even accepted mix when
// the targets fail at different rates. The spec. Solved for a roughly even accepted mix.
const SLOT_4_SHARE = 0.53;

// Every cheap predicate in one place, returning the sorted slot the assignment would produce or
// null where the assignment is not legal at all. Called once per candidate inside the search, so
// it does no allocation beyond the three totals.
function slotOf(counts, priceX, priceY) {
  const x0 = counts[0].x, x1 = counts[1].x, x2 = counts[2].x;
  const y0 = counts[0].y, y1 = counts[1].y, y2 = counts[2].y;
  if (!(x0 > x1 && x0 > x2)) return null;          // seller one leads the first product, strictly
  if (!(y1 > y0 && y1 > y2)) return null;          // seller two leads the second product, strictly
  const t = [roundTo(x0 * priceX + y0 * priceY, 2),
             roundTo(x1 * priceX + y1 * priceY, 2),
             roundTo(x2 * priceX + y2 * priceY, 2)];
  if (!(t[2] > t[0] && t[2] > t[1])) return null;  // seller three leads on neither yet totals most
  const lo = Math.min(t[0], t[1]);
  if (t[0] === t[1]) return null;                  // a tie makes one pairwise gap zero
  if (t[2] / lo > 1.06) return null;               // no ordering guessable from the counts
  const answer = roundTo(t[2] - lo, 2);
  if (answer <= 0) return null;
  const sw = counts.map(c => c.x * priceY + c.y * priceX);
  const ox = counts.map(c => c.x * priceX);
  const dSwapped = roundTo(Math.max(...sw) - Math.min(...sw), 2);
  const dOnlyX = roundTo(Math.max(...ox) - Math.min(...ox), 2);

  // The option-set spacing rules, checked here rather than left to assemble. They are properties
  // of the same five numbers the search is already computing, and leaving them to the outer loop
  // put 30% of attempts on options:duplicate-display and options:near-band alone. Mirrors
  // validate.js's currency path: 2dp distinctness, 2% adjacent gap, three of five within 4x, and
  // one non-correct within 2x.
  const mid = t.slice().sort((a, b) => a - b);
  const vals = [answer, roundTo(mid[1] - mid[0], 2), roundTo(mid[2] - mid[1], 2), dSwapped, dOnlyX];
  if (new Set(vals.map(v => v.toFixed(2))).size !== 5) return null;
  const asc = [...vals].sort((a, b) => a - b);
  for (let i = 1; i < 5; i++) if (asc[i] - asc[i - 1] < 0.02 * Math.abs(asc[i]) - 1e-9) return null;
  const ratio = v => Math.max(Math.abs(v / answer), Math.abs(answer / v));
  if (vals.some(v => ratio(v) > 200)) return null;
  if (vals.filter(v => ratio(v) <= 4).length < 3) return null;
  if (!vals.slice(1).some(v => ratio(v) <= 2)) return null;

  // Both pairwise gaps are components of the answer and so always below it. Only the two spread
  // distractors are free to fall either side.
  return 3 + (dSwapped < answer ? 1 : 0) + (dOnlyX < answer ? 1 : 0);
}

export default {
  id: 'a16',
  name: 'Multi-seller maximum minus minimum',
  group: 'comparison',
  desks: [1],
  tiers: ['standard'],
  stimulus: 'prose',
  answerType: 'currency',
  targetSeconds: 83,

  constraints: [
    'seller one leads on the first product, seller two on the second, and seller three on '
      + 'neither yet totals the highest',
    'all three totals sit within 6% of each other, so no ordering is guessable from the counts',
    'both adjacent-pair gaps differ from the answer',
    'the two prices differ by at least 5',
  ],

  errorTypes: ['wrong-pair', 'swapped-inputs', 'omitted-component'],

  formulaText: 'highest seller total − lowest seller total',


  // THE ESTIMATION ROUTE.
  //
  // 90% of a16's items resolve at one significant figure. All three seller totals sit within 6% of
  // each other by constraint, so the item looks like it demands precision and does not: the two
  // pairwise-gap distractors are COMPONENTS of the answer and therefore always smaller than it, and
  // the price-swapped and single-product options are unconstrained and therefore much larger. A
  // two-figure estimate of the three totals separates the answer from all four without resolving the
  // 6% band at all. What the item actually tests is that you compute all three totals rather than
  // reading a category leader, which the estimate does not let you skip.
  // THE PRICES ARE NOT ROUNDED, and that is a measured decision rather than an omission. The answer
  // is the SPREAD across three totals the constraints hold within 6% of each other, so a two-figure
  // price moves each total by enough to reorder them, and the route landed on a distractor in 1 item
  // in 120. There is nothing to round here: the prices are printed to the penny and a candidate with
  // a calculator uses them as given. What makes a16 a one-figure item is that once the spread is in
  // hand, no precision is needed to pick it, which is a property of the option set rather than of
  // the inputs.
  estimate(p) {
    const px = p.priceX, py = p.priceY;
    const totals = p.counts.map(c => c.x * px + c.y * py);
    const hi = Math.max(...totals), lo = Math.min(...totals);
    return {
      value: hi - lo,
      text: `at ${px} and ${py} the three totals are about `
        + `${totals.map(t => Math.round(t)).join(', ')}, so the spread is about ${Math.round(hi - lo)}`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const market = f.market ?? rng.pick(MARKETS);

    // Prices. The old draw picked the low or the high branch on a coin flip and then rejected
    // when the chosen branch was degenerate: at priceX 36 the low branch can only return 35, and
    // at priceX 48 the high branch can only return 50. That alone rejected 33.3% of attempts for
    // nothing. The branch is now chosen from the ones that are actually feasible.
    const priceX = f.priceX ?? roundTo(rng.float(35, 50), 2);
    let priceY = f.priceY;
    if (priceY === undefined) {
      const canLow = priceX - 5 >= 35 + 0.5;
      const canHigh = priceX + 5 <= 50 - 0.5;
      const low = canLow && (!canHigh || rng.next() < 0.5);
      priceY = low ? roundTo(rng.float(35, priceX - 5), 2)
                   : roundTo(rng.float(priceX + 5, 50), 2);
    }
    if (Math.abs(priceX - priceY) < 5) return reject(diag, 'prices-too-close');

    // POSITION. Both pairwise gaps are components of the answer, so both are always
    // below it, and the sorted slot is 3 plus however many of the two spread distractors fall
    // under the answer.
    //
    // MEASURED, NOT PROVED, and the distinction matters because the bound below does not close.
    // Over 99,874 draws reaching the leadership pattern, slot 4 arrives through dSwapped < answer
    // in 5,008 of 5,008 cases and through dOnlyX < answer in NONE. The tempting argument is that
    // dOnlyX is priceX times the first-product count spread, which is at least the winning lead
    // of 2, so dOnlyX >= 2 x priceX >= 70. But the 6% closeness constraint lets the answer reach
    // about 99 on totals near 1,650, so the two ranges OVERLAP and the algebra proves nothing.
    // What rules slot 5 out is the measurement: 0 in 99,874 across the full space, on top of
    // An earlier round's 0 in 40,000. Strong evidence, not a theorem. Do not rely on the bound.
    //
    // An earlier round drew the slot and rejected until the draw happened to realise it, which cost 19
    // attempts an item. The two free integers are y1 and x2, and the two leads are small ranges,
    // so the whole admissible set is enumerable: 6 x 6 x 21 x 21 candidates per outer draw. The
    // search now returns every assignment that realises the wanted slot and picks among them, so
    // the outer loop rejects only when the wanted slot is genuinely unreachable for the prices and
    // the third seller drawn.
    const targetSlot = f.targetSlot ?? (rng.next() < SLOT_4_SHARE ? 4 : 3);

    let counts = f.counts ?? null;
    if (!counts) {
      const x3 = rng.int(16, 24), y3 = rng.int(16, 24);
      const admissible = [];
      for (let d1 = 2; d1 <= 7; d1++) {
        const x1 = x3 + d1;
        for (let d2 = 2; d2 <= 7; d2++) {
          const y2 = y3 + d2;
          for (let y1 = 10; y1 <= 30; y1++) {
            if (y1 >= y2) continue;                       // seller two must lead the second product
            for (let x2 = 10; x2 <= 30; x2++) {
              if (x2 >= x1) continue;                     // seller one must lead the first product
              const cand = [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }];
              const slot = slotOf(cand, priceX, priceY);
              if (slot === targetSlot) admissible.push(cand);
            }
          }
        }
      }
      if (!admissible.length) return reject(diag, `no-assignment-at-slot-${targetSlot}`);
      counts = rng.pick(admissible);
    }

    const totals = counts.map(c => roundTo(c.x * priceX + c.y * priceY, 2));
    const xs = counts.map(c => c.x), ys = counts.map(c => c.y);

    // Leadership pattern, re-checked against the finished counts.
    if (xs.indexOf(Math.max(...xs)) !== 0 || xs.filter(v => v === Math.max(...xs)).length > 1)
      return reject(diag, 'first-not-leading-x');
    if (ys.indexOf(Math.max(...ys)) !== 1 || ys.filter(v => v === Math.max(...ys)).length > 1)
      return reject(diag, 'second-not-leading-y');
    const hi = totals.indexOf(Math.max(...totals));
    if (hi !== 2) return reject(diag, 'third-not-highest');
    const lo = totals.indexOf(Math.min(...totals));
    if (lo === hi) return reject(diag, 'total-tie');
    if (Math.max(...totals) / Math.min(...totals) > 1.06) return reject(diag, 'totals-too-far');

    const answer = roundTo(totals[hi] - totals[lo], 2);
    if (answer <= 0) return reject(diag, 'answer-not-positive');

    const sorted = [...totals].sort((a, b) => a - b);
    const gapLow  = roundTo(sorted[1] - sorted[0], 2);
    const gapHigh = roundTo(sorted[2] - sorted[1], 2);
    if (Math.abs(gapLow - answer) < 0.01 || Math.abs(gapHigh - answer) < 0.01)
      return reject(diag, 'gap-equals-answer');

    // Prices swapped between the two products.
    const swapped = counts.map(c => c.x * priceY + c.y * priceX);
    const dSwapped = roundTo(Math.max(...swapped) - Math.min(...swapped), 2);
    // First product only.
    const onlyX = counts.map(c => c.x * priceX);
    const dOnlyX = roundTo(Math.max(...onlyX) - Math.min(...onlyX), 2);

    // A guard rather than a filter. The search only returns assignments already at the wanted
    // slot, so this cannot fire on a constructed draw; it stays because a forced fixture bypasses
    // the search entirely and must still be checked against its declared slot.
    const belowCount = [dSwapped, dOnlyX].filter(v => v < answer).length;
    const wantSlot = f.targetSlot ?? targetSlot;
    if (3 + belowCount !== wantSlot) return reject(diag, `spreads-do-not-give-slot-${wantSlot}`);

    const m = v => money(v, '£', 2);
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: gapLow, errorType: 'wrong-pair', note: 'gap between the bottom two sellers' },
          { value: gapHigh, errorType: 'wrong-pair', note: 'gap between the top two sellers' },
          { value: dSwapped, errorType: 'swapped-inputs',
            note: `used ${m(priceY)} for ${market.x.p} and ${m(priceX)} for ${market.y.p}` },
          { value: dOnlyX, errorType: 'omitted-component',
            note: `counted ${market.x.p} only and ignored the ${market.y.p}` },
        ],
        answerType: 'currency',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const [s1, s2, s3] = market.sellers;
    return {
      id: `a16#${rng.seed}`,
      archetypeId: 'a16',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `Three traders at ${market.org} sell the same two lines. `
            + `${market.x.p[0].toUpperCase()}${market.x.p.slice(1)} go for ${m(priceX)} each and `
            + `${market.y.p} for ${m(priceY)}. Last month ${s1} sold ${counts[0].x} ${market.x.p} `
            + `and ${counts[0].y} ${market.y.p}, ${s2} sold ${counts[1].x} and ${counts[1].y}, `
            + `and ${s3} sold ${counts[2].x} and ${counts[2].y}.`,
      },
      questionText: 'What is the difference between the highest and the lowest total takings?',
      answerType: 'currency',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: {},
      values: { total1: totals[0], total2: totals[1], total3: totals[2] },
      workings: {
        formulaText: this.formulaText,
        steps: [
          ...counts.map((c, i) => `${market.sellers[i]} = ${c.x} × ${m(priceX)} + ${c.y} × ${m(priceY)} = ${m(totals[i])}`),
          `answer = ${m(totals[hi])} − ${m(totals[lo])} = ${m(answer)}`,
        ],
      },
      targetSeconds: 83,
      params: { market, priceX, priceY, counts, targetSlot: wantSlot },
    };
  },
};
