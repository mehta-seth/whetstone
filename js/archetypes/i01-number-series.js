import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { NUMBER_FAMILIES, NUMBER_TIERS, SHOWN, numberPredictions, wrongProcedures, usableNumberGrid } from '../lib/series.js';

// i01 - Number series: the next term
//
// Five terms under a hidden rule; which comes next? The rule families are the ones aptitude tests
// use: a growing difference, two interleaved series, Fibonacci, multiply-then-add, alternating
// operations, offset squares, geometric growth.
//
// The answer is the rule's sixth term, and the item is shown only if no other rule in the library
// fits the same five terms and predicts something else (lib/series.js). Each distractor is a named
// wrong procedure applied to those five terms: assuming the last difference repeats, missing the
// alternation, applying the rule twice.

const tierOf = t => (NUMBER_TIERS[t] ? t : 'standard');

export default {
  id: 'i01',
  name: 'Number series: the next term',
  group: 'number-series',
  desks: [4],
  tiers: ['warmup', 'standard', 'hard'],
  stimulus: 'prose',
  answerType: 'number',
  targetSeconds: 72,

  constraints: [
    'the five shown terms predict exactly one next term across the whole rule library',
    'every term is a positive whole number no larger than 999',
    'at least two of the four distractors are named wrong procedures',
    'the number of options below the answer is drawn first and realised',
  ],

  errorTypes: ['missed-alternation', 'wrong-pair', 'dropped-step', 'repeated-operation', 'last-difference',
    'first-difference', 'skipped-term', 'last-ratio'],

  formulaText: 'find the rule that generates all five terms, and apply it once more',

  variants: { key: 'family', visible: false },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const family = f.family ?? rng.pick(NUMBER_TIERS[tierOf(tier)]);
    const fam = NUMBER_FAMILIES[family];
    const p = f.params ?? rng.pick(usableNumberGrid(family));
    const s = fam.seq(p);
    if (!s.slice(0, SHOWN + 1).every(v => Number.isInteger(v) && v > 0 && v <= 999)) return reject(diag, 'term-out-of-range');
    const shown = s.slice(0, SHOWN), answer = s[SHOWN];
    const preds = numberPredictions(shown);
    if (preds.size !== 1 || !preds.has(answer)) return reject(diag, 'ambiguous-series');
    // A series with a repeated term reads as a pattern of its own.
    if (new Set(shown).size < SHOWN) return reject(diag, 'repeated-term');

    const seen = new Set([answer]);
    const derived = [];
    for (const w of wrongProcedures(family, p, s)) {
      if (!Number.isInteger(w.value) || w.value <= 0 || seen.has(w.value)) continue;
      seen.add(w.value);
      derived.push(w);
    }
    if (derived.length < 2) return reject(diag, 'too-few-derived');

    // THE SLOT IS DRAWN, THEN REALISED. Left to itself the option set put the answer in the middle
    // sorted slot in 84% of warm-up items, because the named procedures straddle it: the repeated
    // difference undershoots a growing series and the skipped term overshoots it. Options read in
    // ascending order, so that was a free answer. A target count of options below the answer is drawn
    // first, named procedures fill each side as far as they reach, and filler completes the side
    // that is short. The audit's position table is what checks it.
    const below = derived.filter(w => w.value < answer), above = derived.filter(w => w.value > answer);
    // Slot 1 fails most often, since four options above a small answer must all clear the near-band
    // rules, so it is drawn more often to land the accepted mix near even. Measured: 6% before.
    const k = f.slot ?? (rng.next() < 0.3 ? 0 : rng.int(1, 4));
    const step = Math.max(1, Math.round(Math.abs(answer - shown[4]) / 3));
    const fillSide = (dir, need, have) => {
      const out = [];
      for (let m = 1; out.length < need && m < 40; m++) {
        const v = answer + dir * m * step;
        if (v > 0 && !seen.has(v)) { seen.add(v); out.push({ value: v, note: 'not reachable by any single misreading of the rule' }); }
      }
      return out.length === need ? out : null;
    };
    const lo = rng.shuffle(below).slice(0, k), hi = rng.shuffle(above).slice(0, 4 - k);
    const loFill = fillSide(-1, k - lo.length), hiFill = fillSide(1, 4 - k - hi.length);
    if (!loFill || !hiFill) return reject(diag, 'slot-unreachable');
    const distractors = [...lo, ...hi];
    const filler = [...loFill, ...hiFill];
    if (distractors.length < 2) return reject(diag, 'too-few-derived');

    let options;
    try {
      options = assemble({ correct: { value: answer }, distractors, filler, answerType: 'number', rng });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `i01#${rng.seed}`,
      archetypeId: 'i01',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: { text: `${shown.join(',  ')},  ?`, series: true },
      questionText: 'Which number comes next in the series?',
      answerType: 'number',
      correct: { value: answer, display: String(answer) },
      options,
      optionContext: {},
      values: { family, ...p },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `rule: ${fam.text(p)}`,
          `differences: ${shown.slice(1).map((v, i) => v - shown[i]).join(', ')}`,
          `answer: ${answer}`,
        ],
      },
      targetSeconds: 72,
      params: { family, params: p },
    };
  },
};
