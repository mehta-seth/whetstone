import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { LETTER_FAMILIES, LETTER_TIERS, SHOWN, LETTER, inLetters, letterPredictions, usableLetterGrid } from '../lib/series.js';

// i02 - Letter series: the next code
//
// Letters under a hidden rule, and from standard tier upwards a number travelling with each letter
// under a rule of its own, as in "C4, F7, I10". The two parts are independent, so each is checked
// for identifiability on its own and each distractor gets exactly one part wrong, which is what makes
// such items hard: every wrong option is one careful step away from the right one.
//
// Letters run A to Z without wrapping, so no step ever has to be read across the end of the alphabet.

const tierOf = t => (LETTER_TIERS[t] ? t : 'standard');
const withNumber = t => t !== 'warmup';

export default {
  id: 'i02',
  name: 'Letter series: the next code',
  group: 'letter-series',
  desks: [4],
  tiers: ['warmup', 'standard', 'hard'],
  stimulus: 'prose',
  answerType: 'label',
  targetSeconds: 72,

  constraints: [
    'the letters stay within A to Z, with no wrap',
    'the shown letters predict exactly one next letter across the letter rule library',
    'where a number travels with the letter, its own rule is identifiable too',
    'each distractor differs from the answer in exactly one part',
    'options are ordered by a seeded shuffle, so position carries nothing',
  ],

  errorTypes: ['counted-inclusively', 'skipped-term', 'last-difference', 'missed-alternation', 'reversed-direction', 'number-slip'],

  formulaText: 'find the rule for the letters, and for the numbers where there are any, and apply each once more',

  variants: { key: 'coded', visible: true },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const family = f.family ?? rng.pick(LETTER_TIERS[tierOf(tier)]);
    const fam = LETTER_FAMILIES[family];
    const p = f.params ?? rng.pick(usableLetterGrid(family));
    const s = fam.seq(p);
    if (!inLetters(s.slice(0, SHOWN + 1))) return reject(diag, 'letter-out-of-range');
    const shown = s.slice(0, SHOWN), answer = s[SHOWN];
    const preds = letterPredictions(shown);
    if (preds.size !== 1 || !preds.has(answer)) return reject(diag, 'ambiguous-series');
    if (new Set(shown).size < SHOWN) return reject(diag, 'repeated-term');

    const coded = f.coded ?? withNumber(tier);
    // The number part is a plain arithmetic series, so its identifiability is immediate from five terms.
    const n0 = f.n0 ?? rng.int(1, 9), nd = f.nd ?? rng.pick([1, 2, 3, 4, 5]);
    const nums = [...Array(SHOWN + 2).keys()].map(i => n0 + i * nd);
    const code = (l, n) => (coded ? `${LETTER(l)}${n}` : LETTER(l));

    const step = shown[4] - shown[3];
    const letterWrong = [];
    const addL = (errorType, v, note) => {
      if (!Number.isInteger(v) || v < 1 || v > 26 || v === answer || letterWrong.some(w => w.v === v)) return;
      // A letter already in the series is not a plausible next term: whoever lands on one notices.
      if (shown.includes(v)) return;
      letterWrong.push({ errorType, v, note });
    };
    const towards = Math.sign(answer - shown[4]) || 1;
    addL('counted-inclusively', answer - towards, 'counted the starting letter as the first step, so landed one letter short');
    if (family === 'interleave') addL('missed-alternation', shown[4] + (shown[4] - shown[2]), 'continued the series the last letter belongs to, rather than switching');
    if (family === 'growing' || family === 'zigzag') addL('last-difference', shown[4] + step, 'repeated the last step rather than following how the steps change');
    addL('skipped-term', s[SHOWN + 1], 'applied the rule twice');
    addL('reversed-direction', shown[4] - (answer - shown[4]), 'moved the right number of letters in the wrong direction');
    addL('counted-inclusively', answer + towards, 'counted one letter too many');
    // Near either end of the alphabet some procedures have nowhere to land, so a letter two away
    // stands in as filler rather than losing the item.
    for (const v of [answer + 2, answer - 2, answer + 3, answer - 3]) addL('filler', v, 'not reachable by any single misreading of the rule');

    // OPTIONS ARE ORDERED BY A SEEDED SHUFFLE. In alphabetical order the answer sat in the middle slot
    // in 57% of warm-up items and 76% of coded ones, because its own number-slip neighbours share its
    // letter and the letter slips straddle it. A letter series has no natural ascending order worth
    // keeping at that price.
    const keys = rng.shuffle([0, 1, 2, 3, 4]);
    let wrong;
    if (coded) {
      // Two with the letter wrong and the number right, two with the number wrong and the letter right.
      const nAns = nums[SHOWN];
      wrong = letterWrong.filter(w => w.errorType !== 'filler').slice(0, 2).map(w => ({ value: code(w.v, nAns), errorType: w.errorType, note: w.note }));
      for (const [dv, note] of [[nd, 'got the letter right but added the number step twice'], [-nd, 'got the letter right but did not move the number on']]) {
        const v = nAns + dv;
        if (v > 0 && wrong.length < 4) wrong.push({ value: code(answer, v), errorType: 'number-slip', note });
      }
      if (wrong.length < 4) return reject(diag, 'too-few-derived');
    } else {
      wrong = letterWrong.slice(0, 4).map(w => ({ value: code(w.v), errorType: w.errorType, note: w.note }));
    }
    if (wrong.length < 4) return reject(diag, 'too-few-derived');

    const nAns = nums[SHOWN];
    let options;
    try {
      options = assemble({
        correct: { value: code(answer, nAns), display: code(answer, nAns), sortKey: keys[0] },
        distractors: wrong.filter(w => w.errorType !== 'filler').map((w, i) => ({ ...w, display: w.value, sortKey: keys[i + 1] })),
        filler: wrong.filter(w => w.errorType === 'filler').map((w, i) => ({ value: w.value, display: w.value, note: w.note,
          sortKey: keys[1 + wrong.filter(x => x.errorType !== 'filler').length + i] })),
        answerType: 'label',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const terms = shown.map((l, i) => code(l, nums[i]));
    return {
      id: `i02#${rng.seed}`,
      archetypeId: 'i02',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: { text: `${terms.join(',  ')},  ?`, series: true },
      questionText: coded ? 'Which code comes next in the series?' : 'Which letter comes next in the series?',
      answerType: 'label',
      correct: { value: code(answer, nAns), display: code(answer, nAns) },
      options,
      optionContext: {},
      values: { family, letterAnswer: answer },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `letters as positions: ${shown.join(', ')} (A = 1)`,
          `rule: ${fam.text(p)}`,
          ...(coded ? [`numbers: ${nums.slice(0, SHOWN).join(', ')}, adding ${nd} each time`] : []),
          `answer: ${code(answer, nAns)}`,
        ],
      },
      targetSeconds: 72,
      params: { family, params: p, coded, n0, nd },
    };
  },
};
