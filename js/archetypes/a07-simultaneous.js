import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a07 - Simultaneous equations in prose
//
// Cancel common terms across the equality before substituting. Setting up three full equations
// runs out the clock.
//
// TWO THINGS the archetype spec LEAVES OPEN, both pinned here.
//
// FIRST, "drop a term while cancelling" is not a determinate procedure: which term, and dropped
// how? Left open it would produce a different value on every implementation and a meaningless
// errorType. It is pinned to one reproducible slip, the SIGN of the cancelled middle term
// reversed, so A·G + B·S = F·C becomes A·G − B·S = F·C. That keeps the result integral whenever
// the correct path is integral, which is checked, and it is the slip a candidate actually makes
// when moving a term across the equality.
//
// SECOND, generation runs backwards. The three weights are chosen first, then the coefficients
// that make the equality hold, then the two given facts. Forwards from coefficients almost never
// lands on three whole weights in range.
//
// Every combination is verified numerically at build time: both sides of the original equality
// are evaluated and compared, which is the check the archetype spec asks for.

const MARKETS = [
  { org: 'a produce market', g: { s: 'crate of grain', p: 'crates of grain' },
    s: { s: 'sack of salt', p: 'sacks of salt' }, c: { s: 'box of cocoa', p: 'boxes of cocoa' } },
  { org: 'a builders merchant', g: { s: 'bag of cement', p: 'bags of cement' },
    s: { s: 'tub of filler', p: 'tubs of filler' }, c: { s: 'roll of mesh', p: 'rolls of mesh' } },
  { org: 'a chandlery', g: { s: 'coil of rope', p: 'coils of rope' },
    s: { s: 'drum of resin', p: 'drums of resin' }, c: { s: 'crate of shackles', p: 'crates of shackles' } },
];

// Enumerated once. Keyed on (A, B, F, C) then solved for G and S, which keeps the search to
// about a hundred thousand candidates rather than two million.
const COMBOS = (() => {
  const out = [];
  for (let A = 2; A <= 6; A++) {
    for (let B = 1; B <= 4; B++) {
      for (let F = 2; F <= 7; F++) {
        for (let C = 8; C <= 25; C++) {
          const rhs = F * C;
          for (let S = 8; S <= 25; S++) {
            const num = rhs - B * S;
            if (num <= 0 || num % A !== 0) continue;
            const G = num / A;
            if (G < 8 || G > 25) continue;
            if (new Set([G, S, C]).size !== 3) continue;
            const slipNum = rhs + B * S;
            if (slipNum % A !== 0) continue;
            const slip = slipNum / A;
            if (slip < 5 || slip > 45) continue;
            if ([G, S, C].includes(slip)) continue;
            for (let p = 2; p <= 4; p++) {
              const T = p * S + C;
              if (T < 30 || T > 140) continue;
              out.push({ A, B, F, G, S, C, slip, p, T });
            }
          }
        }
      }
    }
  }
  return out;
})();

export default {
  id: 'a07',
  name: 'Simultaneous equations in prose',
  group: 'algebra',
  desks: [1],
  tiers: ['hard'],
  stimulus: 'prose',
  answerType: 'number',
  targetSeconds: 83,

  constraints: [
    'cancellation leaves whole coefficients and all three weights are whole numbers between 8 and 25',
    'both sides of the original equality are verified numerically to be equal',
    'the sign-reversed cancellation also lands on a whole number, so that distractor is reachable',
    'the two filler weights bracket the answer and sit within twice it',
  ],

  errorTypes: ['reported-input', 'algebra-slip'],

  formulaText: 'cancel the common terms across the equality, then substitute the two given facts',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const market = f.market ?? rng.pick(MARKETS);
    if (!COMBOS.length) return reject(diag, 'no-legal-combination');
    const k = f.combo ?? rng.pick(COMBOS);
    const { A, B, F, G, S, C, slip, p, T } = k;

    // The printed equality. Common terms on both sides are what the candidate must cancel.
    const d = 1, e = 1, cc = 1;
    const a = A + d, b = B + e, ff = F + cc;
    const left  = a * G + b * S + cc * C;
    const right = d * G + e * S + ff * C;
    if (left !== right) return reject(diag, 'equality-fails');

    // The nearer of the two given weights, so the reported-input distractor is a tight neighbour.
    const reported = Math.abs(S - G) <= Math.abs(C - G) ? S : C;
    const reportedName = reported === S ? market.s.s : market.c.s;

    // Two fillers bracketing the answer, both within twice it, neither colliding.
    const taken = new Set([G, slip, reported]);
    const below = [], above = [];
    for (let v = Math.max(4, Math.ceil(G / 2)); v <= Math.floor(G * 2); v++) {
      if (taken.has(v)) continue;
      (v < G ? below : above).push(v);
    }
    if (!below.length || !above.length) return reject(diag, 'no-bracketing-fillers');
    const fLow  = below[below.length - 1 - Math.min(below.length - 1, rng.int(0, 1))];
    const fHigh = above[Math.min(above.length - 1, rng.int(0, 1))];
    if (fLow === fHigh) return reject(diag, 'filler-collision');

    let options;
    try {
      options = assemble({
        correct: { value: G },
        distractors: [
          { value: reported, errorType: 'reported-input',
            note: `reported the weight of a ${reportedName}, which the question gives directly` },
          { value: slip, errorType: 'algebra-slip',
            note: `reversed the sign of the ${market.s.s} term when cancelling, giving `
                + `${A} × weight − ${B} × ${S} = ${F} × ${C}` },
        ],
        filler: [
          { value: fLow, note: 'filler, brackets the answer from below' },
          { value: fHigh, note: 'filler, brackets the answer from above' },
        ],
        answerType: 'number',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const term = (n, noun) => `${n} ${n === 1 ? noun.s : noun.p}`;
    return {
      id: `a07#${rng.seed}`,
      archetypeId: 'a07',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `At ${market.org}, ${term(a, market.g)}, ${term(b, market.s)} and ${term(cc, market.c)} `
            + `together balance exactly against ${term(d, market.g)}, ${term(e, market.s)} and `
            + `${term(ff, market.c)}. Separately, ${term(p, market.s)} and ${term(1, market.c)} `
            + `weigh ${T} kilograms in total, and one ${market.s.s} weighs ${S} kilograms.`,
      },
      questionText: `How many kilograms does one ${market.g.s} weigh?`,
      answerType: 'number',
      correct: { value: G, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: {},
      values: { cancelled: `${A}G + ${B}S = ${F}C`, third: C, second: S, left, right },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `cancel across the equality: ${A} × ${market.g.s} + ${B} × ${market.s.s} = ${F} × ${market.c.s}`,
          `${term(p, market.s)} + 1 ${market.c.s} = ${T}, so one ${market.c.s} = ${T} − ${p} × ${S} = ${C} kg`,
          `${A} × ${market.g.s} = ${F} × ${C} − ${B} × ${S} = ${F * C - B * S}`,
          `answer = ${F * C - B * S} ÷ ${A} = ${G} kg`,
          `check: ${a}(${G}) + ${b}(${S}) + ${C} = ${left} and ${G} + ${S} + ${ff}(${C}) = ${right}`,
        ],
      },
      targetSeconds: 83,
      params: { market, combo: k },
    };
  },
};
