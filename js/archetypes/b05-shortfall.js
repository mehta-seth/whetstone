import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { roundTo, groupDigits } from '../lib/money.js';
import { makeStimulus, stimulusFor } from '../lib/stimulus.js';
import { shortfall } from '../lib/relations.js';

// b05 - Shortfall or excess against a reference
//
// Compare a computed quantity against a reference and report the gap. The answer set mixes
// numeric options with verdict strings, which the real Desk 02 paper does.
//
// "CANNOT SAY" COULD NEVER BE CORRECT AS SPECIFIED, and an earlier round's own rule says that is a
// defect. The archetype spec asks for "Cannot Say" as an option "where the data genuinely does not
// support a figure", but its formula always computes one, so the verdict is wrong in every item
// and two hundred repetitions teach the reflex to discard the last option. That reflex is
// exactly what an earlier round's catch-all rule exists to prevent, and b05 is the archetype it names.
//
// A distractor swap cannot fix it: for the verdict to be correct the QUESTION has to be
// genuinely unanswerable. So the nutrition dataset leaves one nutrient with no printed reference
// amount, and a third of items ask about that nutrient. Nothing is ambiguous, which matters,
// because the spec rules out procedurally generated unanswerable items on the
// grounds that they come out trivial or ambiguous. This one is neither: the figure is absent
// from the stimulus and no reading of the table supplies it. Recorded as defect D5.
//
// TWO DEFECTS FROM A MANUAL AUDIT READ, both of the class only a human read finds.
//
// FIRST, the omitted-scaling note asserted the opposite of the arithmetic. It said the path "came
// out below the reference", and omitting a pack scale of under 100 g makes consumption LARGER, not
// smaller: one sampled item gave 155.70 against a reference of 78. The note is now silent about
// which side of the reference the value lands on, because the generator cannot know without
// computing it and the claim added nothing.
//
// SECOND, a negative percentage is a dead option. Nobody picks minus 185.7% for a "fell short by"
// question, so an item carrying one is a four-way choice dressed as a five-way. Every numeric
// option is now required to be non-negative, and the archetype carries a pool of derived
// procedures rather than a fixed four, so when one goes negative another takes the slot instead of
// the item shipping short.
//
// `sign-flip` IS ILL-DEFINED IN THE SHORTFALL VARIANT, the same way it is in b04. A candidate
// who reverses the direction computes (consumed - reference) / reference, whose magnitude is the
// answer, so the option collides. Replaced with `complement`: reporting the percentage achieved
// rather than the percentage missed, which is the same slip a19 punishes and a real mistake
// under time. `sign-flip` survives in the excess variant, where it is well defined.

const EXCEEDED = 'They have exceeded the recommended daily amount';
const CANNOT   = 'Cannot Say';
const VERDICT_SORT = { [EXCEEDED]: 1e6, [CANNOT]: 1e6 + 1 };

export function formula({ per100, pack, qty, reference }) {
  const consumed = per100 * (pack / 100) * qty;
  return { consumed, ...(reference === undefined ? {} : shortfall(consumed, reference)) };
}

const pctOpt = (value, errorType, note) => ({
  value: roundTo(value, 1), display: `${groupDigits(roundTo(value, 1), Number.isInteger(roundTo(value, 1)) ? 0 : 1)}%`,
  errorType, note, sortKey: value,
});
const verdictOpt = (text, errorType, note) => ({
  value: text, display: text, errorType, note, sortKey: VERDICT_SORT[text], kind: 'verdict',
});

export default {
  id: 'b05',
  name: 'Shortfall or excess against a reference',
  group: 'normalising',
  desks: [2],
  families: ['nutrition'],
  // The archetype spec's header reads "percentage . hybrid" where a tier belongs. Read as describing the
  // answer set rather than a tier, since hybrid is not one of the three. See blocker B1.
  tiers: ['standard', 'hard'],
  stimulus: 'table',
  answerType: 'verdict',
  targetSeconds: 45,
  slotsPerStimulus: [1, 3],

  // The spec's rule: an archetype with a fixed catch-all must have it correct sometimes. Two
  // verdicts are live here, and the audit reports the observed rate against this target.
  catchAllTargetRate: 0.40,

  // All three variants share a stem, but the Cannot Say half is visible in the stimulus: the caption prints references for three nutrients and the question names the fourth
  variants: { key: 'variant', visible: true },

  constraints: [
    'the numeric options are at least two percentage points apart, since the verdict answer type '
      + 'skips the numeric min-gap guard',
    'in the shortfall variant the gap is between 8 and 92 per cent, so it is neither trivial nor '
      + 'indistinguishable from a rounding',
    'the excess variant genuinely exceeds the reference and the shortfall variant genuinely falls '
      + 'short, checked against the relation rather than assumed',
    'the Cannot Say variant asks about the one nutrient with no printed reference amount, so no '
      + 'reading of the stimulus yields a figure',
    'every numeric option is non-negative: a negative shortfall is a dead option and turns a '
      + 'five-way choice into a four-way one',
  ],

  errorTypes: ['complement', 'wrong-base', 'omitted-scaling', 'omitted-component', 'wrong-verdict',
    'sign-flip', 'points-not-percent'],

  formulaText: '(reference - consumed) / reference x 100, where consumed = per 100 g x pack / 100 x packs',

  formula,

  build({ stimulus, rng, tier, forced = null, diag = null }) {
    const f = forced ?? {};
    const d = stimulus.dataset;
    if (d.family !== 'nutrition') return reject(diag, 'wrong-family');
    const meta = d.meta;
    const usableCols = d.cols.map((_, i) => i).filter(i => meta.packs[i] !== 100);
    if (!usableCols.length) return reject(diag, 'too-few-scaled-flavours');

    const variant = f.variant ?? rng.pick(['shortfall', 'shortfall', 'shortfall', 'excess', 'cannot']);
    const refRows = d.rows.map((r, i) => ({ r, i })).filter(x => meta.refs[x.r.key] !== undefined);
    const noRefRow = d.rows.findIndex(r => r.key === meta.unreferenced);

    // Enumerate legal (nutrient, flavour, quantity) triples for the chosen variant, rather than
    // drawing a quantity and hoping it lands the right side of the reference.
    const candidates = [];
    const rows = variant === 'cannot' ? [{ r: d.rows[noRefRow], i: noRefRow }] : refRows;
    for (const { r, i } of rows) {
      for (const c of usableCols) {
        for (let qty = 2; qty <= 9; qty++) {
          const reference = meta.refs[r.key];
          const D = formula({ per100: d.values[i][c], pack: meta.packs[c], qty, reference });
          if (variant === 'cannot') { candidates.push({ i, r, c, qty, D, reference: undefined }); continue; }
          if (variant === 'shortfall' && !(D.value >= 8 && D.value <= 92)) continue;
          if (variant === 'excess' && !(D.exceeded && D.value > -70)) continue;
          candidates.push({ i, r, c, qty, D, reference });
        }
      }
    }
    if (!candidates.length) return reject(diag, `no-candidate-for-${variant}`);

    let firstFailure = null;
    for (const cand of (f.candidate ? [f.candidate] : rng.shuffle(candidates)).slice(0, 14)) {
      const { i, r, c, qty, D, reference } = cand;
      const unscaled = d.values[i][c] * qty;
      const packs = `${qty} ${meta.packPlural} of ${d.cols[c].label}`;
      let correct, distractors;

      if (variant === 'cannot') {
        // The other nutrients' reference amounts are printed, so using one of them is the
        // reachable mistake: the candidate takes a figure from the note that does not belong to
        // the nutrient asked about.
        correct = verdictOpt(CANNOT, null, 'CORRECT');
        const pool = [
          ...refRows.map(o => pctOpt(100 * (meta.refs[o.r.key] - D.consumed) / meta.refs[o.r.key],
            'wrong-base', `measured against the ${o.r.label.toLowerCase()} reference of `
            + `${groupDigits(meta.refs[o.r.key], 0)} ${o.r.unit}, which is not the nutrient asked about`)),
          pctOpt(D.consumed, 'points-not-percent',
            `reported the amount consumed, ${groupDigits(roundTo(D.consumed, 1), 1)} ${r.unit}, as if it were a percentage`),
        ].filter(o => o.value >= 0);
        if (pool.length < 3) { firstFailure = firstFailure ?? 'too-few-non-negative-procedures'; continue; }
        distractors = [
          ...pool.slice(0, 3),
          verdictOpt(EXCEEDED, 'wrong-verdict', 'chose the other verdict, which the stimulus cannot support either'),
        ];
      } else if (variant === 'excess') {
        correct = verdictOpt(EXCEEDED, null, 'CORRECT');
        const onePack = d.values[i][c] * meta.packs[c] / 100;
        const pool = [
          pctOpt(-D.value, 'sign-flip',
            `computed the size of the gap and reported it without checking which way round it was`),
          pctOpt(100 * (D.consumed - reference) / D.consumed, 'wrong-base',
            `took the excess as a percentage of the amount consumed rather than of the reference`),
          // No claim about which side of the reference this lands on. Omitting a pack scale below
          // 100 g makes the total larger, so the original note asserting "below the reference" was
          // false in every excess item.
          pctOpt(100 * (reference - unscaled) / reference, 'omitted-scaling',
            `never applied the ${meta.packs[c]} g pack size`),
          pctOpt(100 * (reference - onePack) / reference, 'omitted-component',
            `scaled one ${meta.pack} correctly but never multiplied by the ${qty} ${meta.packPlural}`),
        ].filter(o => o.value >= 0);
        if (pool.length < 3) { firstFailure = firstFailure ?? 'too-few-non-negative-procedures'; continue; }
        distractors = [
          ...pool.slice(0, 3),
          verdictOpt(CANNOT, 'wrong-verdict', 'the reference for this nutrient is printed, so a figure is available'),
        ];
      } else {
        correct = pctOpt(D.value, null, 'CORRECT');
        const onePack = d.values[i][c] * meta.packs[c] / 100;
        // A pool, not a fixed four. omitted-scaling goes negative whenever the unscaled total
        // clears the reference, and a negative shortfall is an option nobody picks, so the pool is
        // filtered to non-negative values and the first three survivors take the numeric slots.
        const pool = [
          pctOpt(100 * D.consumed / reference, 'complement',
            `gave the percentage of the reference they did reach rather than the percentage they missed`),
          pctOpt(100 * (reference - D.consumed) / D.consumed, 'wrong-base',
            `divided the gap by the amount consumed instead of by the reference`),
          pctOpt(100 * (reference - unscaled) / reference, 'omitted-scaling',
            `never applied the ${meta.packs[c]} g pack size`),
          pctOpt(100 * (reference - onePack) / reference, 'omitted-component',
            `scaled one ${meta.pack} correctly but never multiplied by the ${qty} ${meta.packPlural}`),
        ].filter(o => o.value >= 0);
        if (pool.length < 3) { firstFailure = firstFailure ?? 'too-few-non-negative-procedures'; continue; }
        distractors = [
          ...pool.slice(0, 3),
          verdictOpt(EXCEEDED, 'wrong-verdict',
            `read the comparison the wrong way; the amount consumed is below the reference`),
        ];
      }

      const numeric = [correct, ...distractors].filter(o => typeof o.value === 'number').map(o => o.value);
      if (numeric.some(v => v < 0)) { firstFailure = firstFailure ?? 'negative-percentage-option'; continue; }
      const sortedNums = [...numeric].sort((a, b) => a - b);
      if (sortedNums.some((v, k) => k > 0 && v - sortedNums[k - 1] < 2)) {
        firstFailure = firstFailure ?? 'numeric-options-within-2-points'; continue;
      }
      let options;
      try {
        options = assemble({ correct, distractors, answerType: 'verdict', rng });
      } catch (e) {
        if (e instanceof OptionError) { firstFailure = firstFailure ?? 'options:' + e.failures[0]; continue; }
        throw e;
      }
      return {
        id: `b05#${rng.seed}`, archetypeId: 'b05', seed: rng.seed, tier,
        stimulusType: 'table', stimulusId: stimulus.id, stimulus: stimulusFor(stimulus),
        questionText: `By how many percent would someone eating ${packs} have fallen short of the `
          + `recommended daily amount of ${r.label.toLowerCase()}?`,
        answerType: 'verdict',
        correct: { value: correct.value, display: options.find(x => x.role === 'correct').display },
        options, optionContext: {},
        values: { per100: d.values[i][c], pack: meta.packs[c], qty,
          consumed: roundTo(D.consumed, 3), reference: reference ?? 'not printed' },
        workings: {
          formulaText: this.formulaText,
          steps: [
            `${d.cols[c].label}: ${groupDigits(d.values[i][c], r.dp)} ${r.unit} per 100 g x ${meta.packs[c]} / 100 x ${qty} = ${groupDigits(roundTo(D.consumed, 2), 2)} ${r.unit}`,
            reference === undefined
              ? `no recommended daily amount for ${r.label.toLowerCase()} appears in the stimulus, so no figure can be computed`
              : `(${groupDigits(reference, 0)} - ${groupDigits(roundTo(D.consumed, 2), 2)}) / ${groupDigits(reference, 0)} x 100 = ${roundTo(D.value, 1)}%`,
          ],
        },
        targetSeconds: 45,
        params: { variant, nutrient: i, col: c, qty },
      };
    }
    return reject(diag, firstFailure ?? 'no-assemblable-candidate');
  },

  generate(rng, tier, forced = null, diag = null) {
    const stimulus = makeStimulus({ family: 'nutrition', rng });
    if (!stimulus) return reject(diag, 'no-stimulus');
    const it = this.build({ stimulus, rng, tier, forced, diag });
    return it ? { ...it, stimulusIndex: 0, firstOnStimulus: true } : null;
  },
};
