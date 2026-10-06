import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import {
  WEEKDAYS, drawNames, sequenceWorlds, consistent, SEQ_TYPES, trueSeqClue, SEQ_MISREADINGS,
  prune, misreadingAnswers, specOf, seqFromSpec, mentionCounts,
} from '../lib/logic.js';
import { SEQ_SCENARIOS, seqSentence, misreadNote, sentence, scenarioNames } from '../lib/logic-text.js';

// l01 - Sequencing: who is on which day
//
// Five people, five weekdays, one each. The clues settle one fact, and the question asks for it in
// one of two visible forms: who is on a named day, or which day a named person is on.
//
// THE CLUE SET IS MINIMAL. Clues are drawn true of a hidden order until the asked fact is settled,
// then pruned so that dropping any one clue unsettles it. Every clue is therefore needed, which is
// what makes `missed-clue` a real distractor rather than a guess, and it stops a redundant clue from
// inflating how often the answer is named.
//
// EVERY ENTITY IS AN OPTION. Five people, five options; five weekdays, five options. So the option
// set itself carries no information, and which wrong option each misreading lands on is decided by
// enumeration over the misread clue set.

const N = 5;
// Tie-break order for labelling a wrong option. The main rule is in misreadingAnswers: the misreading
// that leaves the fewest answers open explains the option best.
const ORDER = ['reversed-order', 'next-read-as-earlier', 'gap-off-by-one', 'missed-negation', 'missed-clue'];
const CLUES = { warmup: [3, 5], standard: [3, 6], hard: [4, 7] };
const tierOf = t => (CLUES[t] ? t : 'standard');

export default {
  id: 'l01',
  name: 'Sequencing: who is on which day',
  group: 'sequencing',
  desks: [3],
  tiers: ['warmup', 'standard', 'hard'],
  stimulus: 'logic',
  answerType: 'label',
  targetSeconds: 90,

  constraints: [
    'the clues are true of a hidden order and settle the asked fact in every order they allow',
    'the clue set is minimal: dropping any single clue unsettles the answer',
    'clue count within the tier band',
    'at least three of the four wrong options come from a named misreading of a clue',
  ],

  errorTypes: ['reversed-order', 'next-read-as-earlier', 'gap-off-by-one', 'missed-negation', 'missed-clue'],

  formulaText: 'enumerate the 120 orders, keep those every clue allows, read off the asked fact',

  variants: { key: 'ask', visible: true },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const band = CLUES[tierOf(tier)];
    const S = f.scenario ? SEQ_SCENARIOS.find(s => s.id === f.scenario) : rng.pick(SEQ_SCENARIOS);
    const names = f.names ?? scenarioNames(rng, S, drawNames);
    const worlds = sequenceWorlds(N);
    const hidden = f.order ?? rng.shuffle([...Array(N).keys()]);
    const truth = worlds.find(w => w.order.every((p, i) => p === hidden[i]));
    const ask = f.ask ?? (rng.next() < 0.5 ? 'who' : 'when');
    const target = f.target ?? rng.int(0, N - 1);
    const answerOf = w => (ask === 'who' ? w.order[target] : w.slot[target]);
    const answers = cl => new Set(consistent(worlds, cl).map(answerOf));
    const settled = cl => answers(cl).size === 1;

    let clues;
    if (f.clues) clues = f.clues.map(seqFromSpec);
    else {
      clues = [];
      for (let i = 0; i < 60 && !settled(clues); i++) {
        const c = trueSeqClue(rng, truth, N, SEQ_TYPES[tierOf(tier)]);
        if (c && !clues.some(x => x.key === c.key)) clues.push(c);
      }
      if (!settled(clues)) return reject(diag, 'not-settled');
      clues = prune(clues, settled);
    }
    if (!clues.every(c => c.holds(truth))) return reject(diag, 'clue-false-of-hidden-order');
    if (!settled(clues)) return reject(diag, 'not-settled');
    if (clues.length < band[0]) return reject(diag, 'too-few-clues');
    if (clues.length > band[1]) return reject(diag, 'too-many-clues');

    const correctValue = answerOf(truth);

    // THE MOST-NAMED SHORTCUT. A minimal clue set tends to circle the answer, so in the raw draw the
    // answer was the single most-named person in 35% of warm-up items against 20% by chance, which is
    // a scanning rule that needs no reasoning. Where the answer is the unique most-named entity the
    // item is kept only half the time, measured to bring that share back to chance. It is a thinning
    // of one corner of the space rather than a constraint on the logic, and the audit's Mentions
    // column is what checks it holds.
    if (!f.clues && ask === 'who') {
      const m = mentionCounts(clues, N);
      const top = Math.max(...m);
      if (m[correctValue] === top && m.filter(x => x === top).length === 1 && rng.next() < 0.5) {
        return reject(diag, 'answer-is-most-named');
      }
    }
    const wrong = misreadingAnswers({ clues, answers, correct: correctValue, misreadings: SEQ_MISREADINGS, order: ORDER });
    if (wrong.size < 3) return reject(diag, 'too-few-derived');

    const label = v => (ask === 'who' ? names[v] : WEEKDAYS[v]);
    const val = v => (ask === 'who' ? `p${v}` : `d${v}`);
    const opt = v => {
      const w = wrong.get(v);
      const base = { value: val(v), display: label(v), sortKey: v };
      if (!w) return { ...base, note: 'not reachable by any single misreading of the clues' };
      return { ...base, errorType: w.errorType, note: misreadNote(w.errorType, seqSentence(w.clue, S, names), w.clue.k) };
    };
    const others = [...Array(N).keys()].filter(v => v !== correctValue);
    let options;
    try {
      options = assemble({
        correct: { value: val(correctValue), display: label(correctValue), sortKey: correctValue },
        distractors: others.filter(v => wrong.has(v)).map(opt),
        filler: others.filter(v => !wrong.has(v)).map(opt),
        answerType: 'label',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    // Clues are shown in a shuffled order, so their order carries nothing about how they were drawn.
    const shown = rng.shuffle(clues);
    const lines = shown.map(c => sentence(seqSentence(c, S, names)));
    const allowed = consistent(worlds, clues);
    const mentions = mentionCounts(clues, N);
    const dayMentions = WEEKDAYS.map((_, d) => clues.filter(c => c.d === d || c.d1 === d || c.d2 === d).length);

    return {
      id: `l01#${rng.seed}`,
      archetypeId: 'l01',
      seed: rng.seed,
      tier,
      stimulusType: 'logic',
      stimulus: { text: S.intro(names), lines },
      questionText: ask === 'who' ? S.who(WEEKDAYS[target]) : S.when(names[target]),
      answerType: 'label',
      correct: { value: val(correctValue), display: label(correctValue) },
      options,
      optionContext: {},
      // Read by the audit's column-correlation diagnostic. Mentions are broken by alphabetical
      // order so ties still rank, which is what a scanner who picks the most-named entity does.
      correlation: ask === 'who'
        ? { keys: names.map((_, i) => `p${i}`),
            columns: { 'Alphabetical': names.map((_, i) => i), 'Mentions': mentions.map((m, i) => m + i / 10) } }
        : { keys: WEEKDAYS.map((_, i) => `d${i}`),
            columns: { 'Day': WEEKDAYS.map((_, i) => i), 'Day mentions': dayMentions.map((m, i) => m + i / 10) } },
      values: { clues: clues.length, orders: allowed.length },
      workings: {
        formulaText: this.formulaText,
        steps: [
          ...orderSummary(allowed, names),
          ask === 'who'
            ? `answer: ${names[correctValue]} on ${WEEKDAYS[target]}, in every order the clues allow`
            : `answer: ${names[target]} on ${WEEKDAYS[correctValue]}, in every order the clues allow`,
        ],
      },
      targetSeconds: 90,
      params: { scenario: S.id, names, order: hidden, ask, target, clues: clues.map(specOf) },
    };
  },
};

// The worked solution: the orders themselves when there are few, otherwise who can be on each day.
export function orderSummary(allowed, names) {
  if (allowed.length <= 4) {
    return allowed.map((w, i) => `${allowed.length > 1 ? `order ${i + 1}: ` : 'the only order: '}`
      + w.order.map((p, d) => `${WEEKDAYS[d].slice(0, 3)} ${names[p]}`).join(', '));
  }
  return [`${allowed.length} orders fit the clues; by day:`,
    ...WEEKDAYS.map((day, d) => `${day}: ${[...new Set(allowed.map(w => names[w.order[d]]))].join(' or ')}`)];
}
