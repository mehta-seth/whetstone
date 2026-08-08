import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { roundTo, groupDigits } from '../lib/money.js';
import { makeStimulus, stimulusFor } from '../lib/stimulus.js';
import { derivedSeries } from '../lib/dataset.js';

// b01 - Stimulus-level unit scaling
//
// The table gives values per 100 g and the question asks about actual pack sizes, so every
// item off this stimulus needs the scale factor. The whole archetype is one multiplication
// that a candidate in a hurry does not do.
//
// This is the first Desk 02 archetype, so it is also where the shared-stimulus contract is
// established. Three things are new against Desk 01 and all three are recorded in the decision log:
//
//   1. `build({ stimulus, ... })` is the real entry point. `generate(rng, tier, forced, diag)`
//      remains and mints a solo stimulus, which is what keeps the earlier audit harness and
//      the earlier fixture harness working on Desk 02 archetypes with no change at all.
//   2. `families` declares which dataset shapes this can run off. b01 needs pack sizes, which
//      only the nutrition family has.
//   3. The item carries `stimulusId`. `stimulusIndex` and `firstOnStimulus` are set by the
//      session loop, because they depend on fill order and generate cannot see it.
//
// ---------------------------------------------------------------------------------------
// TWO VARIANTS, and the second one is not decoration. The archetype spec states the formula for a
// single product, then gives an observed example that needs two: "How much energy would 3
// packets of BBQ and 2 packets of Pickled Onion produce?" requires two different scale
// factors in one item. So both are built.
//
// The variants also carry different option geometry, which is the first real progress on
// Open item 9. The single-product variant puts one distractor below the answer and
// two above, so the answer sits 2nd or 3rd of five. The pair variant drops one product at a
// time, so two distractors sit below and the answer sits 3rd or 4th. Together b01 reaches
// three of the five sorted slots, against two for sixteen of the twenty Desk 01 archetypes.
// Not a fix for the library-wide leak, but it is the geometry doing the work rather than an
// accident, and it needed no distractor the archetype spec does not name.
//
// ROUNDING. Options are rounded to two decimal places, and the correct answer is required to
// be exact at two, so the answer is never itself a rounding. That asymmetry is deliberate:
// inverting a pack factor of 30 g gives 100/30, which does not terminate, and an item
// prints the rounded figure. A candidate who inverts the factor computes 2,406.67 and finds
// 2,406.67 in the option list.
// ---------------------------------------------------------------------------------------

const QUESTION_WORDS = {
  energy: 'energy, in kJ,',
  fat:    'fat, in grams,',
  fibre:  'fibre, in grams,',
  salt:   'salt, in grams,',
};

// The scaled series, exported so the fixture pins the arithmetic through the same code the
// item uses. The spec: injecting parameters pins the arithmetic and nothing else.
export function formula({ values, packs, picks }) {
  const terms = picks.map(p => ({
    col: p.col, qty: p.qty, per100: values[p.col], pack: packs[p.col],
    scale: packs[p.col] / 100,
    value: values[p.col] * (packs[p.col] / 100) * p.qty,
  }));
  return { terms, answer: terms.reduce((s, t) => s + t.value, 0) };
}

const r2 = v => roundTo(v, 2);
const exactAt2dp = v => Math.abs(v - roundTo(v, 2)) < 1e-9;

export default {
  id: 'b01',
  name: 'Stimulus-level unit scaling',
  group: 'normalising',
  desks: [2],
  families: ['nutrition'],
  // The archetype spec declares no tier for b01. Assigned here: it is one multiplication with one
  // trap, which is a warm-up item, and it stays live at standard because the trap is the
  // highest-frequency one in the format. Recorded in the decision log as blocker B1.
  tiers: ['warmup', 'standard'],
  stimulus: 'table',
  answerType: 'number',
  targetSeconds: 45,

  // How many questions this archetype can contribute to one stimulus. A nutrition stimulus
  // carries five questions and supports only b01 and b05, so b01 has to be able to fill
  // three of them without repeating a question.
  slotsPerStimulus: [1, 3],

  // The stem names one product or two, so the candidate sees which half before scaling anything
  variants: { key: 'variant', visible: true },

  constraints: [
    'every flavour used in the item has a pack size other than 100 g, or the omitted-scaling '
      + 'distractor equals the answer',
    'the correct answer is exact at two decimal places, so it is never itself a rounding',
    'the misread column is physically adjacent and within a factor of two of the asked one, '
      + 'so the option set has a tight neighbour',
    'in the pair variant the two products differ by at least 10% of the larger, so the two '
      + 'drop-one-product distractors separate',
    'all five options distinct after formatting, and within the standard option rules',
  ],

  errorTypes: ['omitted-scaling', 'inverted-scaling', 'adjacent-column', 'omitted-component'],

  formulaText: 'sum over products of (per 100 g value x pack size / 100 x number of packs)',

  formula,

  // The real entry point. Takes a stimulus rather than building one.
  build({ stimulus, rng, tier, forced = null, diag = null }) {
    const f = forced ?? {};
    const d = stimulus.dataset;
    if (d.family !== 'nutrition') return reject(diag, 'wrong-family');

    const meta = d.meta;
    const nRows = d.rows.length, nCols = d.cols.length;

    // Which nutrient row the question is about.
    const nutrient = f.nutrient ?? rng.int(0, nRows - 1);
    const row = d.rows[nutrient];
    const values = d.values[nutrient];

    // Only flavours whose pack is not 100 g are usable, because at 100 g the scale factor is
    // 1 and both the omitted and the inverted distractor collapse onto the answer.
    const usable = d.cols.map((_, i) => i).filter(i => meta.packs[i] !== 100);
    if (usable.length < 2) return reject(diag, 'too-few-scaled-flavours');

    // The misread column has to be physically adjacent to the asked one, because that is the
    // slip being modelled: the eye lands one column over. It also has to sit within a factor
    // of two, or the option set has no tight neighbour and the validator throws it out.
    //
    // Drawing the asked column first and then looking for a legal neighbour rejected 19.2% of
    // attempts, almost all of it on the fat row, whose values span 8 to 38 g. So the legal
    // (asked, misread) pairs are enumerated and one is taken, which is an earlier round's
    // constructive-draw rule. The stated parameter ranges are untouched; only the draw order
    // changes.
    const legalPairs = [];
    for (const target of usable) {
      for (const other of [target - 1, target + 1]) {
        if (other < 0 || other >= nCols) continue;
        const hi = Math.max(values[other], values[target]);
        const lo = Math.min(values[other], values[target]);
        if (lo > 0 && hi / lo <= 2 && Math.abs(values[other] - values[target]) / values[target] >= 0.06) {
          legalPairs.push({ target, misread: other });
        }
      }
    }
    if (!legalPairs.length) return reject(diag, 'no-legal-adjacent-column');
    const pair = f.pair ?? rng.pick(legalPairs);

    const variant = f.variant ?? (rng.next() < 0.5 ? 'single' : 'pair');
    const picks = f.picks ?? (variant === 'single'
      ? [{ col: pair.target, qty: rng.int(2, 5) }]
      : (() => {
          const second = rng.pick(usable.filter(i => i !== pair.target));
          return [{ col: pair.target, qty: rng.int(1, 4) }, { col: second, qty: rng.int(1, 4) }];
        })());

    const D = formula({ values, packs: meta.packs, picks });
    if (!(D.answer > 0)) return reject(diag, 'non-positive-answer');
    if (!exactAt2dp(D.answer)) return reject(diag, 'answer-not-exact-at-2dp');

    if (variant === 'pair') {
      const [t1, t2] = D.terms;
      const gap = Math.abs(t1.value - t2.value) / Math.max(t1.value, t2.value);
      if (gap < 0.10) return reject(diag, 'pair-terms-too-close');
    }

    const target = picks[0].col;
    const misread = f.misread ?? pair.misread;
    if (misread === target) return reject(diag, 'misread-equals-target');

    // Distractors, each the same expression with one named step done wrong.
    const noScale  = picks.reduce((s, p) => s + values[p.col] * p.qty, 0);
    const inverted = picks.reduce((s, p) => s + values[p.col] * (100 / meta.packs[p.col]) * p.qty, 0);
    const adjacent = D.answer - D.terms[0].value
      + values[misread] * (meta.packs[target] / 100) * picks[0].qty;

    const distractors = [];
    if (variant === 'single') {
      const onePack = values[target] * (meta.packs[target] / 100);
      distractors.push(
        { value: r2(noScale), errorType: 'omitted-scaling',
          note: `read the per 100 g figure straight off the table and never applied the `
              + `${meta.packs[target]} g pack size` },
        { value: r2(inverted), errorType: 'inverted-scaling',
          note: `multiplied by 100 / ${meta.packs[target]} instead of ${meta.packs[target]} / 100, `
              + `so the scale factor is upside down` },
        { value: r2(adjacent), errorType: 'adjacent-column',
          note: `took the ${row.label.toLowerCase()} figure from ${d.cols[misread].label} instead of `
              + `${d.cols[target].label}` },
        { value: r2(onePack), errorType: 'omitted-component',
          note: `scaled one ${meta.pack} correctly but never multiplied by the ${picks[0].qty} `
              + `${meta.packPlural} asked for` },
      );
    } else {
      distractors.push(
        { value: r2(noScale), errorType: 'omitted-scaling',
          note: `read both per 100 g figures straight off the table and never applied either pack size` },
        { value: r2(D.terms[0].value), errorType: 'omitted-component',
          note: `counted only the ${d.cols[picks[0].col].label} ${meta.packPlural} and dropped the `
              + `${d.cols[picks[1].col].label} ones` },
        { value: r2(D.terms[1].value), errorType: 'omitted-component',
          note: `counted only the ${d.cols[picks[1].col].label} ${meta.packPlural} and dropped the `
              + `${d.cols[picks[0].col].label} ones` },
        { value: r2(adjacent), errorType: 'adjacent-column',
          note: `took the ${row.label.toLowerCase()} figure from ${d.cols[misread].label} instead of `
              + `${d.cols[target].label}` },
      );
    }

    if (distractors.some(x => !Number.isFinite(x.value) || x.value <= 0)) {
      return reject(diag, 'distractor-not-positive');
    }

    let options;
    try {
      options = assemble({
        correct: { value: r2(D.answer) },
        distractors,
        answerType: 'number',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const phrase = picks.map(p =>
      `${p.qty} ${p.qty === 1 ? meta.pack : meta.packPlural} of ${d.cols[p.col].label}`).join(' and ');
    const questionText = variant === 'single'
      ? `How much ${QUESTION_WORDS[row.key]} is contained in ${phrase}?`
      : `How much ${QUESTION_WORDS[row.key]} would ${phrase} provide in total?`;

    const scaled = derivedSeries(d, {
      op: 'scaled', a: nutrient, factors: meta.packs.map(p => p / 100),
      label: `${row.label} per ${meta.pack}`,
    });

    return {
      id: `b01#${rng.seed}`,
      archetypeId: 'b01',
      seed: rng.seed,
      tier,
      stimulusType: 'table',
      stimulusId: stimulus.id,
      stimulus: stimulusFor(stimulus),
      questionText,
      answerType: 'number',
      correct: { value: r2(D.answer), display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: {},
      values: Object.fromEntries([
        ...D.terms.flatMap((t, i) => [
          [`per100_${i + 1}`, t.per100],
          [`scale_${i + 1}`, t.scale],
          [`term_${i + 1}`, r2(t.value)],
        ]),
        ['answer', r2(D.answer)],
      ]),
      workings: {
        formulaText: this.formulaText,
        steps: [
          ...D.terms.map(t =>
            `${d.cols[t.col].label}: ${groupDigits(t.per100, row.dp)} ${row.unit} per 100 g `
            + `x ${t.pack} / 100 x ${t.qty} = ${groupDigits(r2(t.value), 2)} ${row.unit}`),
          `answer = ${groupDigits(r2(D.answer), 2)} ${row.unit}`,
        ],
      },
      targetSeconds: 45,
      params: { nutrient, variant, picks, misread },
      // Recorded for the audit only. b01's answer is a number rather than a row or column
      // label, so the column-correlation diagnostic has nothing to match and correctly skips
      // this archetype, exactly as it skips a18.
      scaledSeriesLabel: scaled.label,
    };
  },

  // Compatibility wrapper. Mints a stimulus of its own, so every harness written in sessions
  // 1 and 2 works on this archetype unchanged.
  generate(rng, tier, forced = null, diag = null) {
    const stimulus = makeStimulus({ family: 'nutrition', rng });
    if (!stimulus) return reject(diag, 'no-stimulus');
    const it = this.build({ stimulus, rng, tier, forced, diag });
    if (!it) return null;
    return { ...it, stimulusIndex: 0, firstOnStimulus: true };
  },
};
