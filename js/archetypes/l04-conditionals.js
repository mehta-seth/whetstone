import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { truthWorlds, cap } from '../lib/logic.js';

// l04 - Conditional reasoning: what follows
//
// A chain of if-then statements and one stated fact. Which conclusion must be true? The four
// textbook errors are the distractors, each built by applying that error to the premises:
//   affirmed-consequent   from "if A then B" and B, concluding A
//   denied-antecedent     from "if A then B" and not A, concluding not B
//   converse-conditional  reading "if A then B" as "if B then A"
//   reversed-conclusion   following the chain and landing on the opposite of what it gives
//
// AND SOMETIMES NOTHING FOLLOWS. When the fact affirms the end of the chain or denies its start, no
// statement about the other facts is forced, and the correct option is "None of the other options
// follows". A catch-all that is never right trains the reflex to discard it, so it is right in a
// declared share of items and the audit reports the observed rate against it.
//
// Truth is decided by enumerating every assignment of true and false to the atoms, 8 or 16 rows.

const ATOMS = [
  { pos: 'the audit is signed off', neg: 'the audit is not signed off' },
  { pos: 'the report is published on time', neg: 'the report is not published on time' },
  { pos: 'the client renews the contract', neg: 'the client does not renew the contract' },
  { pos: 'the new system goes live', neg: 'the new system does not go live' },
  { pos: 'overtime is approved', neg: 'overtime is not approved' },
  { pos: 'the shipment clears customs', neg: 'the shipment does not clear customs' },
  { pos: 'the bonus pool is released', neg: 'the bonus pool is not released' },
  { pos: 'the budget is approved', neg: 'the budget is not approved' },
  { pos: 'the merger is announced', neg: 'the merger is not announced' },
];
const NONE_TEXT = 'None of the other options follows from the information given.';
const CASES = [['forward', 0.35], ['backward', 0.45], ['none', 0.2]];

const lit = (atom, val) => ({ atom, val });
const neg = l => lit(l.atom, !l.val);
const holdsLit = (l, w) => w.v[l.atom] === l.val;
const implies = (a, b) => ({ kind: 'if', a, b });
const holds = (s, w) => (s.kind === 'if' ? !holdsLit(s.a, w) || holdsLit(s.b, w) : holdsLit(s, w));
const keyOf = s => (s.kind === 'if' ? `if:${s.a.atom}${+s.a.val}:${s.b.atom}${+s.b.val}` : `l:${s.atom}${+s.val}`);

export default {
  id: 'l04',
  name: 'Conditional reasoning: what follows',
  group: 'conditionals',
  desks: [3],
  tiers: ['warmup', 'standard', 'hard'],
  stimulus: 'logic',
  answerType: 'label',
  targetSeconds: 90,
  catchAllTargetRate: 0.2,

  constraints: [
    'the premises and the fact are jointly consistent',
    'the correct statement holds in every assignment the premises and fact allow',
    'no distractor statement holds in every such assignment',
    'the catch-all is correct exactly when no statement option is forced',
  ],

  errorTypes: ['affirmed-consequent', 'denied-antecedent', 'converse-conditional', 'reversed-conclusion',
    'missed-valid-inference'],

  formulaText: 'enumerate every true/false assignment, keep those the premises and the fact allow, test each option',

  variants: { key: 'case', visible: false },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const k = f.chain?.length ?? (tier === 'hard' ? 4 : 3);
    // k chain atoms plus one side atom M, which hangs off the chain through one extra premise.
    const atoms = f.atoms ?? rng.shuffle([...ATOMS.keys()]).slice(0, k + 1);
    const M = k;
    const chain = f.chain ?? [...Array(k).keys()].map(i => lit(i, rng.next() < 0.6));
    const pickCase = () => { let t = rng.next(); for (const [c, p] of CASES) { if ((t -= p) <= 0) return c; } return 'none'; };
    const kase = f.case ?? pickCase();
    const noneBy = f.noneBy ?? (rng.next() < 0.5 ? 'affirm' : 'deny');
    const mVal = f.mVal ?? rng.next() < 0.6;
    const j = f.j ?? (kase === 'forward' ? rng.int(1, k - 1) : kase === 'backward' ? rng.int(0, k - 2) : 0);

    // WHY THE SIDE PREMISE. Once the fact settles every chain atom, any if-then statement between
    // them is true in the one remaining world, vacuously or not, so a conditional cannot serve as a
    // wrong option without becoming a second right one. The side premise supplies a literal
    // distractor that IS a fallacy rather than a truth: affirming its consequent, or denying its
    // antecedent, says something about M that nothing licenses.
    const side = kase === 'forward' ? implies(lit(M, mVal), chain[j])
      : kase === 'backward' ? implies(chain[j], lit(M, mVal))
      : noneBy === 'affirm' ? implies(lit(M, mVal), chain.at(-1))
      : implies(chain[0], lit(M, mVal));
    const premises = [...chain.slice(0, -1).map((l, i) => implies(l, chain[i + 1])), side];
    const fact = kase === 'forward' ? chain[0] : kase === 'backward' ? neg(chain.at(-1))
      : noneBy === 'affirm' ? chain.at(-1) : neg(chain[0]);

    const W = truthWorlds(k + 1).filter(w => premises.every(p => holds(p, w)) && holdsLit(fact, w));
    if (!W.length) return reject(diag, 'inconsistent');
    const must = s => W.every(w => holds(s, w));

    const forcedLits = [];
    for (let a = 0; a <= k; a++) for (const v of [true, false]) {
      const l = lit(a, v);
      if (keyOf(l) !== keyOf(fact) && must(l)) forcedLits.push(l);
    }
    if (kase !== 'none' && !forcedLits.length) return reject(diag, 'nothing-forced');
    if (kase === 'none' && forcedLits.length) return reject(diag, 'none-case-forces-something');

    const pool = [];
    const add = (s, errorType, note) => { if (!must(s) && !pool.some(p => keyOf(p.s) === keyOf(s))) pool.push({ s, errorType, note }); };
    const AC = 'affirms the consequent: knowing the "then" part tells you nothing about the "if" part';
    const DA = 'denies the antecedent: the "if" part failing tells you nothing about the "then" part';
    if (kase === 'forward') {
      add(lit(M, mVal), 'affirmed-consequent', AC);
      for (let i = 1; i < k; i++) add(neg(chain[i]), 'reversed-conclusion', 'the opposite of what the chain gives');
    }
    if (kase === 'backward') {
      add(neg(lit(M, mVal)), 'denied-antecedent', DA);
      for (let i = 0; i < k - 1; i++) add(chain[i], 'reversed-conclusion', 'the opposite of what the chain gives');
    }
    if (kase === 'none' && noneBy === 'affirm') {
      add(lit(M, mVal), 'affirmed-consequent', AC);
      for (let i = 0; i < k - 1; i++) add(chain[i], 'affirmed-consequent', AC);
    }
    if (kase === 'none' && noneBy === 'deny') {
      add(neg(lit(M, mVal)), 'denied-antecedent', DA);
      for (let i = 1; i < k; i++) add(neg(chain[i]), 'denied-antecedent', DA);
    }
    // Conditionals only where the enumeration shows they can fail, which is the none case: there the
    // chain atoms are left open, so the converse and the inverse of a premise are genuinely not forced.
    for (const p of premises) {
      add(implies(p.b, p.a), 'converse-conditional', 'the premise read backwards, which is not equivalent to it');
      add(implies(neg(p.a), neg(p.b)), 'denied-antecedent', 'both halves of the premise negated, which is not equivalent to it');
    }

    const wantStatements = kase === 'none' ? 4 : 3;
    const lits = rng.shuffle(pool.filter(p => p.s.kind !== 'if'));
    const conds = rng.shuffle(pool.filter(p => p.s.kind === 'if'));
    const chosen = [...lits, ...conds].slice(0, wantStatements);
    if (chosen.length < wantStatements) return reject(diag, 'too-few-distractors');

    const say = s => (s.kind === 'if'
      ? `If ${phrase(atoms, s.a)}, then ${phrase(atoms, s.b)}.`
      : `${cap(phrase(atoms, s))}.`);
    // The farthest forced conclusion, so the item needs the whole chain and not one step of it.
    const correctStmt = kase === 'forward' ? chain.at(-1) : kase === 'backward' ? neg(chain[0]) : null;
    if (correctStmt && !must(correctStmt)) return reject(diag, 'chain-end-not-forced');
    const order = rng.shuffle([0, 1, 2, 3]);
    let options;
    try {
      const statementDistractors = chosen.map((p, i) => ({ value: keyOf(p.s), display: say(p.s), sortKey: order[i], errorType: p.errorType, note: p.note }));
      options = assemble({
        correct: correctStmt
          ? { value: keyOf(correctStmt), display: say(correctStmt), sortKey: order[3] }
          : { value: 'none', display: NONE_TEXT, sortKey: 99, kind: 'verdict' },
        distractors: correctStmt
          ? [...statementDistractors, { value: 'none', display: NONE_TEXT, sortKey: 99, kind: 'verdict',
              errorType: 'missed-valid-inference', note: 'something does follow: the chain applies to the fact' }]
          : statementDistractors,
        answerType: 'label',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    // The fact goes last, after the rules it is applied to, and the rules are shuffled.
    const lines = [...rng.shuffle(premises).map(say), say(fact)];
    const steps = [`fact: ${say(fact)}`];
    if (kase === 'forward') steps.push('apply the rules forwards from the fact: '
      + chain.slice(1).map(l => phrase(atoms, l)).join(', so '));
    if (kase === 'backward') steps.push('apply the rules backwards, each by its contrapositive: '
      + chain.slice(0, -1).reverse().map(l => phrase(atoms, neg(l))).join(', so '));
    if (kase === 'none') steps.push(noneBy === 'affirm'
      ? 'the fact affirms the END of a rule, and nothing follows backwards from a consequent'
      : 'the fact denies the START of a rule, and nothing follows forwards from a denied antecedent');
    steps.push(correctStmt ? `answer: ${say(correctStmt)}` : 'answer: none of the statements is forced');

    return {
      id: `l04#${rng.seed}`,
      archetypeId: 'l04',
      seed: rng.seed,
      tier,
      stimulusType: 'logic',
      stimulus: { text: 'Assume all of the following statements are true.', lines },
      questionText: 'Which of the following must also be true?',
      answerType: 'label',
      correct: correctStmt ? { value: keyOf(correctStmt), display: say(correctStmt) } : { value: 'none', display: NONE_TEXT },
      options,
      optionContext: {},
      values: { atoms: k + 1, assignments: W.length },
      workings: { formulaText: this.formulaText, steps },
      targetSeconds: 90,
      params: { atoms, chain, case: kase, noneBy, mVal, j },
    };
  },
};

function phrase(atoms, l) {
  const a = ATOMS[atoms[l.atom]];
  return l.val ? a.pos : a.neg;
}
