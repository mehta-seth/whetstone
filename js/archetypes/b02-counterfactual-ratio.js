import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';
import { simpleRatio } from '../lib/fraction.js';
import { makeStimulus, stimulusFor } from '../lib/stimulus.js';
import { counterfactual, rowTotal } from '../lib/dataset.js';
import { roundTo } from '../lib/money.js';

// b02 - Counterfactual on a single cell
//
// Perturb one cell, then evaluate a ratio on the modified data.
//
// The archetype spec ASKS FOR AN APPROXIMATE ANSWER, WHICH SECTION 4 FORBIDS. Its observed example is a
// 63% reduction, and 0.37 times a plausible count is not a whole number, which is why the real
// stem says "approximate ratio". But an answer chosen by rounding is not defined by a formula,
// and the spec's first rule is that the answer must be. So the generator searches the dataset
// for a (cell, percentage, denominator) triple whose ratio is EXACTLY a simple ratio, and the
// stem asks for the ratio rather than an approximation to it. Recorded as defect D2.
//
// PERCENTAGES NARROWED TO 25, 40 AND 50. The archetype spec gives no range for the perturbation. Each
// of the five options is the answer times a function of k = 1 +/- pct/100:
//
//     answer  A = cell.k / den          ignored-counterfactual  A / k
//     sign-flip  A(2 - k) / k           wrong denominator cell  A / k^2
//     inverted   1 / A
//
// so at 75% the spread is 16x and the option set fails the near-band rule. At 50% and below the
// multipliers are 1, 2, 3 and 4 and every option sits inside it. Better to narrow a range
// The archetype spec never stated than to weaken a validator guard.
//
// THE DENOMINATOR-PERTURBATION DISTRACTOR IS DROPPED, AND THIS IS THE MOST IMPORTANT DECISION IN
// THE ARCHETYPE. The archetype spec names four: ignored-counterfactual, sign-flip, adjacent-cell and
// inverted-ratio. Written that way the archetype is a 62% giveaway, proven forced rather than
// sampled, and a manual audit read caught it. Three of the four are the answer times a
// function of k alone:
//
//     ignored-counterfactual  A / k          above the answer for every reduction
//     sign-flip               A(2 - k) / k   above the answer for every reduction
//     adjacent-cell           A / k^2        above the answer for every reduction
//     inverted-ratio          1 / A          straddles, on whether A exceeds 1
//
// So on a reduction the answer is the smallest ratio in the set unless the inversion happens to
// fall below it, and on an increase it is the largest. "Pick the smallest ratio" scores 62% with
// no arithmetic at all. That is worse than any of the Desk 01 cases in open item 9, because Desk
// 02's exam preset orders options ascending rather than realistically, so there is no shuffle
// diluting it and the order default is not up for negotiation: the observed GF paper was
// ascending in all twenty items.
//
// Adding a fifth distractor is not available, so one of the three had to go, and which one is
// forced: all three are same-direction, so the geometry is identical whichever is dropped, and
// `adjacent-cell` is the least natural slip of the three. Its replacement straddles on a
// PARAMETER rather than on the perturbation direction:
//
//     raw arithmetic   (cell -/+ pct) / den, the percentage read as a bare number
//
// which sits below the answer on a reduction when the cell is under 100 and above it when the
// cell is over, and the other way round on an increase. So the count of distractors below the
// answer becomes
//
//     reduce    [cell < 100] + [A > 1]                  0 to 2, so slots 1, 2 and 3
//     increase  2 + [cell > 100] + [A > 1]              2 to 4, so slots 3, 4 and 5
//
// and the answer's slot now varies with the parameters inside each direction rather than being
// pinned by it. All five slots reachable, and no single-slot heuristic beats picking slot 2.

// 20 and 30 added when the raw-arithmetic distractor raised the exactness burden from four values
// to five. Both keep every multiplier inside the near band: at 20% they are 1.25 and 1.5, at 30%
// they are 1.43 and 1.86, against the 4x limit. 60% and above are still excluded, since 1/k^2
// reaches 6.25 there.
const PCTS = [20, 25, 30, 40, 50];

export function formula({ cell, den, pct, direction }) {
  const k = direction === 'increase' ? 1 + pct / 100 : 1 - pct / 100;
  const modified = cell * k;
  // The raw-arithmetic path: the stated percentage subtracted or added as a bare number rather
  // than taken as a proportion of the cell. See the position note above for why this one and not
  // the denominator perturbation.
  const raw = direction === 'increase' ? cell + pct : cell - pct;
  return { k, modified, raw, value: modified / den,
    ignored: cell / den, signFlip: cell * (2 - k) / den,
    rawArith: raw / den, inverted: den / (cell * k) };
}

export default {
  id: 'b02',
  name: 'Counterfactual on a single cell',
  group: 'comparison',
  desks: [2],
  families: ['regional'],
  // PROBLEM 3. Warm-up declared, and the reason is that nothing declared it.
  //
  // The archetype spec states no tier at all for b01 to b08 except b04 and b08 as hard, so an earlier round's
  // default left almost the whole family at standard and Desk 02 warm-up with two members, b01 and
  // c01. At a 20-item length the cap relaxes to ceil(20/2) = 10, a 50 per cent share of the session
  // for one archetype, which the 25 per cent rule in 13.3 exists to prevent. Fixing the pool fixes
  // the cap as a side effect.
  //
  // This one earns warm-up on its own terms rather than to pad the pool: perturb one printed cell by a printed percentage, then read a ratio
  // off two cells. One multiplication and one division, and the direction is stated in the stem.
  tiers: ['warmup', 'standard'],
  stimulus: 'table',
  answerType: 'ratio',
  targetSeconds: 45,
  slotsPerStimulus: [1, 2],

  // The stem says increased or reduced, so the perturbation direction is visible
  variants: { key: 'direction', visible: true },

  constraints: [
    'the perturbed ratio is exactly a simple ratio with both terms at most 24 and a denominator '
      + 'at most 12, so the answer is a formula and not a rounding',
    'all five options are exact simple ratios, or the correct answer is the only tidy one and '
      + 'that is a formatting tell',
    'the two terms of the answer differ, or the inverted-ratio distractor equals the answer',
    'the perturbation is 25, 40 or 50 per cent, which keeps every option inside the near band',
    'the raw-arithmetic value is positive, since a cell below the stated percentage subtracts to '
      + 'nothing',
    'an increased cell stays below three times the largest cell in the table',
  ],

  errorTypes: ['ignored-counterfactual', 'sign-flip', 'points-not-percent', 'inverted-ratio'],

  formulaText: 'perturbed cell : comparison quantity, in lowest terms',

  formula,

  build({ stimulus, rng, tier, forced = null, diag = null }) {
    const f = forced ?? {};
    const d = stimulus.dataset;
    const numericRow = d.family === 'retail' ? d.rows.findIndex(r => r.additive) : null;
    const rows = numericRow === null ? d.rows.map((_, i) => i) : [numericRow];
    const nCols = d.cols.length;
    const biggest = Math.max(...d.values.flat());

    // Enumerate every legal instantiation rather than sampling and rejecting. The exactness
    // condition rejects the large majority of triples, so sampling would need hundreds of
    // attempts per item.
    const candidates = [];
    for (const r of rows) {
      for (let c = 0; c < nCols; c++) {
        const dens = [];
        for (let o = 0; o < nCols; o++) if (o !== c) dens.push({ cols: [o], label: d.cols[o].label });
        for (let o = 0; o < nCols; o++) {
          for (let o2 = o + 1; o2 < nCols; o2++) {
            if (o === c || o2 === c) continue;
            dens.push({ cols: [o, o2], label: `${d.cols[o].label} and ${d.cols[o2].label} combined` });
          }
        }
        if (d.family === 'regional') {
          dens.push({ cols: null, label: 'all categories combined' });
          // Triples too. Every extra denominator shape is another chance that all five values land
          // on exact rationals, and "lions, tigers and zebras combined" is as natural a comparison
          // quantity as any pair.
          for (let o = 0; o < nCols; o++) {
            for (let o2 = o + 1; o2 < nCols; o2++) {
              for (let o3 = o2 + 1; o3 < nCols; o3++) {
                if ([o, o2, o3].includes(c)) continue;
                dens.push({ cols: [o, o2, o3],
                  label: `${d.cols[o].label}, ${d.cols[o2].label} and ${d.cols[o3].label} combined` });
              }
            }
          }
        }
        for (const den of dens) {
          const denValue = den.cols === null ? rowTotal(d, r) : den.cols.reduce((s, o) => s + d.values[r][o], 0);
          for (const pct of PCTS) {
            for (const direction of ['reduce', 'increase']) {
              const D = formula({ cell: d.values[r][c], den: denValue, pct, direction });
              if (!(D.modified > 0) || D.modified > 3 * biggest) continue;
              if (!(D.raw > 0)) continue;                  // a raw subtraction can go negative
              // The ANSWER keeps the archetype spec's stated bound of a denominator at most 12. The four
              // distractors are allowed up to 20, which nearly doubles the proportion of datasets
              // that can host the archetype at all. Measured before committing: with the loose
              // bound the answer is the strictly tidiest ratio in 18% of items against a 20%
              // chance rate, so "pick the simplest ratio" is not a shortcut. At the tight bound it
              // was 8%, which is a tell in the opposite direction.
              const all = [simpleRatio(D.value, 12, 24),
                ...[D.ignored, D.signFlip, D.rawArith, D.inverted].map(v => simpleRatio(v, 20, 40))];
              if (all.some(x => x === null)) continue;
              if (all[0].a === all[0].b) continue;               // 1:1 inverts onto itself
              if (new Set(all.map(x => x.display)).size !== 5) continue;
              candidates.push({ r, c, den, denValue, pct, direction, D, all });
            }
          }
        }
      }
    }
    if (!candidates.length) return reject(diag, 'no-exact-ratio-available');

    let firstFailure = null;
    for (const cand of (f.candidate ? [f.candidate] : rng.shuffle(candidates)).slice(0, 12)) {
      const { r, c, den, pct, direction, D, all } = cand;
      const [aR, igR, sfR, rawR, invR] = all;
      const verb = direction === 'increase' ? 'increased' : 'reduced';
      const cellName = `${d.cols[c].label} at ${d.rows[r].label}`;
      const opt = (rat, errorType, note) => ({ value: rat.value, display: rat.display, errorType, note });
      let options;
      try {
        options = assemble({
          correct: { value: aR.value, display: aR.display },
          distractors: [
            opt(igR, 'ignored-counterfactual', `read the ratio straight off the table and never applied the ${pct}% change`),
            opt(sfR, 'sign-flip', `${direction === 'increase' ? 'reduced' : 'increased'} the cell by ${pct}% instead of ${direction === 'increase' ? 'increasing' : 'reducing'} it`),
            opt(rawR, 'points-not-percent', `${direction === 'increase' ? 'added' : 'subtracted'} ${pct} as a bare number instead of taking ${pct}% of ${d.values[r][c]}`),
            opt(invR, 'inverted-ratio', 'gave the ratio the other way round'),
          ],
          answerType: 'ratio', rng,
        });
      } catch (e) {
        if (e instanceof OptionError) { firstFailure = firstFailure ?? 'options:' + e.failures[0]; continue; }
        throw e;
      }
      const dNew = counterfactual(d, { r, c, pct: direction === 'increase' ? pct : -pct });
      void dNew;
      return {
        id: `b02#${rng.seed}`, archetypeId: 'b02', seed: rng.seed, tier,
        stimulusType: 'table', stimulusId: stimulus.id, stimulus: stimulusFor(stimulus),
        questionText: `If the number of ${d.cols[c].label} at ${d.rows[r].label} were ${verb} by `
          + `${pct}%, what would the ratio of ${d.cols[c].label} to ${den.label} at `
          + `${d.rows[r].label} then be?`,
        answerType: 'ratio',
        correct: { value: aR.value, display: aR.display },
        options, optionContext: {},
        values: { cell: d.values[r][c], modified: roundTo(D.modified, 4),
          comparison: cand.denValue, raw: D.raw, k: D.k },
        workings: {
          formulaText: this.formulaText,
          steps: [
            `${cellName} = ${d.values[r][c]}`,
            `${verb} by ${pct}%: ${d.values[r][c]} x ${D.k} = ${roundTo(D.modified, 4)}`,
            `${den.label} = ${cand.denValue}`,
            `${roundTo(D.modified, 4)} : ${cand.denValue} = ${aR.display}`,
          ],
        },
        targetSeconds: 45,
        params: { r, c, pct, direction, den: den.label },
        // No correlation block: the answer is a ratio, not a row or column label, so there is
        // nothing for the column-correlation diagnostic to match. Supplying one made it report
        // 200 items as "a verdict answer with no row", which was true of none of them.
      };
    }
    return reject(diag, firstFailure ?? 'no-assemblable-candidate');
  },


  // THE ESTIMATION ROUTE, on a ratio answer type.
  //
  // b02 resolves at one figure in 53% of items and at two in 99%. The quantities come from `v`, the
  // same block the worked solution reads, because the parameter draw carries row and column INDICES
  // rather than cell values.
  //
  // The route works in decimals and then names the ratio, which is the fast path: the option set
  // reduces to a denominator of 12 or less, so a two-figure decimal picks one option uniquely and is
  // far quicker than reducing a fraction. The trap it still has to respect is the counterfactual
  // itself, so the route prints the MODIFIED cell rather than the printed one, which is what separates
  // the answer from `ignored-counterfactual`.
  estimate(p, v) {
    const value = v.modified / v.comparison;
    return {
      value,
      text: `the cell becomes about ${sig2(v.modified)} against ${v.comparison}, `
        + `so about ${value.toFixed(2)} to 1`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const family = forced?.family ?? rng.pick(this.families);
    const stimulus = makeStimulus({ family, rng });
    if (!stimulus) return reject(diag, 'no-stimulus');
    const it = this.build({ stimulus, rng, tier, forced, diag });
    return it ? { ...it, stimulusIndex: 0, firstOnStimulus: true } : null;
  },
};
