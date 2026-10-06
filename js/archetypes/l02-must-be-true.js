import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import {
  drawNames, sequenceWorlds, consistent, SEQ_TYPES, trueSeqClue, seq, prune, specOf, seqFromSpec,
} from '../lib/logic.js';
import { SEQ_SCENARIOS, seqSentence, sentence, scenarioNames } from '../lib/logic-text.js';
import { orderSummary } from './l01-sequencing.js';

// l02 - Sequencing: what must be true, or what cannot be
//
// The clues do NOT settle the whole order. Between two and six orders survive, and the question asks
// which statement holds in all of them, or in none. This is the necessity-against-possibility
// judgement that deductive tests are built on, and the error it exists to catch is the commonest one
// in the format: taking a statement that fits one arrangement you happened to find as one that must
// hold.
//
// THE ANSWER IS NEVER GIVEN AWAY BY ONE CLUE. A necessary statement that a single clue already entails
// on its own, or an impossible one that a single clue already rules out, is excluded from the answer
// pool, so the item always needs clues combined.
//
// Options are statements, so they are ordered by a seeded shuffle and carry no position information.
// The audit reads their lengths as a visible column, because "pick the longest statement" is the
// scanning rule a statement set invites.

const N = 5;
const WORLDS_BAND = [2, 6];
const tierOf = t => (SEQ_TYPES[t] ? t : 'standard');

// Every statement the option set can draw on, as clues, so truth is evaluated by the same semantics.
function candidates() {
  const out = [];
  for (let a = 0; a < N; a++) {
    for (let d = 0; d < N; d++) { out.push(seq.on(a, d)); out.push(seq.notOn(a, d)); }
    for (let b = 0; b < N; b++) {
      if (a === b) continue;
      out.push(seq.before(a, b));
      out.push(seq.dayBefore(a, b));
      if (a < b) out.push(seq.adjacent(a, b));
    }
  }
  return out;
}
const CANDIDATES = candidates();
const POSITIVE = new Set(['on', 'before', 'dayBefore', 'adjacent']);

export default {
  id: 'l02',
  name: 'Sequencing: what must or cannot be true',
  group: 'sequencing',
  desks: [3],
  tiers: ['standard', 'hard'],
  stimulus: 'logic',
  answerType: 'label',
  targetSeconds: 90,

  constraints: [
    'between two and six orders fit the clues, so the order is not fully settled',
    'no clue can be dropped without letting in another order',
    'the answer is not entailed, or ruled out, by any single clue alone',
    'every wrong option is a statement that holds in at least one allowed order (must) or in none of them need not hold (cannot), as named',
  ],

  errorTypes: ['possible-not-necessary', 'reversed-order', 'overstated-order', 'contradicts-clues',
    'missed-arrangement', 'answered-must-for-cannot'],

  formulaText: 'enumerate the orders the clues allow, and test each statement in every one of them',

  variants: { key: 'ask', visible: true },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const S = f.scenario ? SEQ_SCENARIOS.find(s => s.id === f.scenario) : rng.pick(SEQ_SCENARIOS);
    const names = f.names ?? scenarioNames(rng, S, drawNames);
    const worlds = sequenceWorlds(N);
    const hidden = f.order ?? rng.shuffle([...Array(N).keys()]);
    const truth = worlds.find(w => w.order.every((p, i) => p === hidden[i]));
    const ask = f.ask ?? (rng.next() < 0.6 ? 'must' : 'cannot');

    let clues;
    if (f.clues) clues = f.clues.map(seqFromSpec);
    else {
      clues = [];
      for (let i = 0; i < 60; i++) {
        const n = consistent(worlds, clues).length;
        if (n <= WORLDS_BAND[1]) break;
        const c = trueSeqClue(rng, truth, N, SEQ_TYPES[tierOf(tier)]);
        if (!c || clues.some(x => x.key === c.key)) continue;
        if (consistent(worlds, [...clues, c]).length < WORLDS_BAND[0]) continue;   // would settle it
        clues.push(c);
      }
      const n = consistent(worlds, clues).length;
      clues = prune(clues, cl => consistent(worlds, cl).length === n);
    }
    const W = consistent(worlds, clues);
    if (!clues.every(c => c.holds(truth))) return reject(diag, 'clue-false-of-hidden-order');
    if (W.length < WORLDS_BAND[0] || W.length > WORLDS_BAND[1]) return reject(diag, 'worlds-out-of-band');
    if (clues.length < 3) return reject(diag, 'too-few-clues');

    const clueKeys = new Set(clues.map(c => c.key));
    const count = s => W.filter(w => s.holds(w)).length;
    // True in every world one clue allows on its own: the statement follows from that clue alone.
    const entailedAlone = s => clues.some(c => worlds.every(w => !c.holds(w) || s.holds(w)));
    const excludedAlone = s => clues.some(c => worlds.every(w => !c.holds(w) || !s.holds(w)));
    const scored = CANDIDATES.map(s => ({ s, n: count(s) }));
    const necessary = scored.filter(x => x.n === W.length);
    const possible = scored.filter(x => x.n > 0 && x.n < W.length);
    const impossible = scored.filter(x => x.n === 0);

    const pickOne = (list, pref) => {
      const best = list.filter(pref);
      return (best.length ? rng.pick(best) : list.length ? rng.pick(list) : null);
    };
    let answer;
    if (ask === 'must') {
      const pool = necessary.filter(x => !clueKeys.has(x.s.key) && !entailedAlone(x.s));
      answer = pickOne(pool, x => POSITIVE.has(x.s.type));
    } else {
      const pool = impossible.filter(x => !excludedAlone(x.s));
      answer = pickOne(pool, x => POSITIVE.has(x.s.type));
    }
    if (!answer) return reject(diag, 'no-nontrivial-answer');

    const used = new Set([answer.s.key]);
    const take = (list, errorType, note, k = 1) => {
      const out = [];
      for (const x of rng.shuffle(list)) {
        if (out.length >= k) break;
        if (used.has(x.s.key)) continue;
        used.add(x.s.key);
        out.push({ x, errorType, note: note(x) });
      }
      return out;
    };
    const of = x => `${x.n} of the ${W.length} orders`;
    let wrong;
    if (ask === 'must') {
      // The two most tempting possibles: those true in the most allowed orders.
      const tempting = possible.filter(x => x.n >= W.length / 2 && POSITIVE.has(x.s.type));
      const reversals = impossible.filter(x => (x.s.type === 'before' || x.s.type === 'dayBefore')
        && necessary.some(y => y.s.type === 'before' && y.s.a === x.s.b && y.s.b === x.s.a));
      const overstated = scored.filter(x => x.s.type === 'dayBefore' && x.n < W.length
        && necessary.some(y => y.s.type === 'before' && y.s.a === x.s.a && y.s.b === x.s.b));
      wrong = [
        ...take(tempting.length >= 2 ? tempting : possible, 'possible-not-necessary',
          x => `true in ${of(x)}, so it could be true but need not be`, 2),
        ...take(reversals, 'reversed-order', () => 'the reverse of an order the clues force'),
        ...take(overstated, 'overstated-order',
          x => `the clues force an earlier day, not the day immediately before; true in ${of(x)}`),
      ];
      if (wrong.length < 4) wrong.push(...take(impossible.filter(x => POSITIVE.has(x.s.type)), 'contradicts-clues',
        () => 'false in every order the clues allow', 4 - wrong.length));
    } else {
      const necessaryNonTrivial = necessary.filter(x => !clueKeys.has(x.s.key) && POSITIVE.has(x.s.type));
      wrong = [
        ...take(possible.filter(x => POSITIVE.has(x.s.type)), 'missed-arrangement',
          x => `true in ${of(x)}, so it can be true`, 2),
        ...take(necessaryNonTrivial.length ? necessaryNonTrivial : necessary.filter(x => POSITIVE.has(x.s.type)),
          'answered-must-for-cannot', () => 'this one MUST be true; the question asks for one that cannot be'),
      ];
      if (wrong.length < 4) wrong.push(...take(possible, 'missed-arrangement',
        x => `true in ${of(x)}, so it can be true`, 4 - wrong.length));
    }
    if (wrong.length < 4) return reject(diag, 'too-few-distractors');
    wrong = wrong.slice(0, 4);

    const text = s => sentence(seqSentence(s, S, names));
    // THE LENGTH SHORTCUT. Statements that must hold tend to be relations between two people, which
    // read longer, and statements that cannot hold tend to be single placements, which read shorter.
    // The audit's Statement length column measured the answer as the longest option in 31% of "must"
    // items and the shortest in 32% of "cannot" items, against 20% by chance. Where the answer sits
    // at the telling end it is kept with probability 0.6, which brings both back near chance.
    if (!f.clues) {
      const lens = [answer, ...wrong.map(w => w.x)].map(x => text(x.s).length);
      const telling = ask === 'must' ? lens[0] === Math.max(...lens) : lens[0] === Math.min(...lens);
      if (telling && rng.next() < 0.4) return reject(diag, 'answer-length-tells');
    }
    const order = rng.shuffle([0, 1, 2, 3, 4]);
    let options;
    try {
      options = assemble({
        correct: { value: answer.s.key, display: text(answer.s), sortKey: order[0] },
        distractors: wrong.map((w, i) => ({ value: w.x.s.key, display: text(w.x.s), sortKey: order[i + 1],
          errorType: w.errorType, note: w.note })),
        answerType: 'label',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const lines = rng.shuffle(clues).map(c => sentence(seqSentence(c, S, names)));
    return {
      id: `l02#${rng.seed}`,
      archetypeId: 'l02',
      seed: rng.seed,
      tier,
      stimulusType: 'logic',
      stimulus: { text: S.intro(names), lines },
      questionText: ask === 'must' ? 'Which of the following must be true?' : 'Which of the following cannot be true?',
      answerType: 'label',
      correct: { value: answer.s.key, display: text(answer.s) },
      options,
      optionContext: {},
      correlation: {
        keys: options.map(o => o.value),
        columns: { 'Statement length': options.map((o, i) => o.display.length + i / 10) },
      },
      values: { clues: clues.length, orders: W.length },
      workings: {
        formulaText: this.formulaText,
        steps: [
          ...orderSummary(W, names),
          `answer: "${text(answer.s)}" holds in ${answer.n} of the ${W.length} orders`,
        ],
      },
      targetSeconds: 90,
      params: { scenario: S.id, names, order: hidden, ask, clues: clues.map(specOf) },
    };
  },
};
