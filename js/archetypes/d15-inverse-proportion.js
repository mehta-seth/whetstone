import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { sig2 } from '../lib/precision.js';
import { groupDigits } from '../lib/money.js';

// d15 - Inverse proportion
//
// DIRECT PROPORTION IS DROPPED and that is a distractor-set change, approved. With the answer at
// n x t / m, the unchanged time t and the direct-proportion value t x m / n, the three form a
// three-term geometric run in exactly m / n, both counts printed, and t is its middle member. Worse,
// which way the run points is visible: the stem says whether the count went up or down. That is
// d07's second attack in a different costume and it survives any filler placement, so one of the two
// had to go. `omitted-final-step` stays because it is one of the three highest-frequency families in
// the format and is thin in the library, and the direct-proportion value goes.
//
// Its replacement is on a different quantity: the CHANGE in time rather than the new time, which is
// a real reporting slip and stands to the answer in a ratio needing the difference of the two counts
// rather than either of them.
//
// The pair that remains, the answer against the unchanged time, is in the printed ratio n / m. The
// legitimate path is one multiplication and one division, so computing the ratio costs as much as
// answering, which is d06's verdict on that shape. Measured rather than assumed.
//
// THE DIRECTION IS VISIBLE. Whether the count rose or fell is printed, and it decides which side of
// the answer the unchanged time falls, so the diagnostics split on it and the filler's side is drawn
// so that each visible half reaches two slots rather than one. That is d09's disposition.
const JOBS = [
  { org: 'Fenwick Joinery', unit: 'machines', task: 'to cut the whole order', tUnit: 'hours' },
  { org: 'Aldermoor Packing', unit: 'packers', task: 'to fill the container', tUnit: 'hours' },
  { org: 'Thurlow Groundworks', unit: 'diggers', task: 'to clear the site', tUnit: 'days' },
];

export default {
  id: 'd15',
  name: 'Inverse proportion',
  group: 'rates',
  desks: [1],
  tiers: ['standard'],
  stimulus: 'prose',
  answerType: 'number',
  targetSeconds: 83,

  variants: { key: 'direction', visible: true },

  constraints: [
    'the answer is a whole number or a clean half',
    'the linear value differs from the answer by at least 2 per cent',
    'the change-in-time value is positive and distinct from everything else',
    'the filler sits on a drawn side, so each visible half reaches two slots',
  ],

  errorTypes: ['omitted-final-step', 'linear-not-inverse', 'wrong-quantity', 'filler'],

  formulaText: 'original count x original time / new count',


  // THE ESTIMATION ROUTE.
  //
  // d15 resolves at one figure in 49% of items and at two in 98%, so it is a two-figure item and the
  // route rounds accordingly. The arithmetic is trivial; the whole difficulty is the DIRECTION, and
  // the constraint that the direct-proportion value differs by at least 40% means an estimate that
  // gets the direction right cannot then land on the wrong option.
  //
  // So the route leads with the direction rather than the number. More workers means less time, which
  // is the sentence that separates the answer from `direct-not-inverse`, the distractor that exists
  // precisely because candidates multiply where they should divide.
  estimate(p) {
    const value = p.n * p.t / p.m;
    const more = p.m > p.n;
    return {
      value,
      text: `${p.m} against ${p.n} is ${more ? 'more' : 'fewer'}, so the time must ${more ? 'FALL' : 'RISE'}: `
        + `about ${sig2(p.n * p.t)} over ${p.m} is about ${value.toFixed(1)}`,
    };
  },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const job = f.job ?? rng.pick(JOBS);
    // Enumerated, because the answer must land on a whole number or a clean half and the linear
    // value must clear 2%, and both are functions of the two counts and the time alone.
    const legal = [];
    for (let n = 3; n <= 9; n++) {
      for (let m = 2; m <= 20; m++) {
        if (m === n) continue;
        for (const t = 0; false;) break;
        for (const tt of [4, 5, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 24]) {
          const ans = n * tt / m;
          if (Math.abs(ans * 2 - Math.round(ans * 2)) > 1e-9) continue;   // whole or clean half
          if (ans < 2 || ans > 60) continue;
          const linear = tt * (2 * n - m) / n;
          if (linear <= 0) continue;
          if (Math.abs(linear - ans) < 0.02 * ans) continue;
          // THE CHANGE-IN-TIME VALUE IS THE ONLY THING THAT CAN STRADDLE, and letting it do so is
          // what gives this archetype a third slot. It is t x |n - m| / m against an answer of
          // t x n / m, so their ratio is |n - m| / n and it sits ABOVE the answer exactly when the
          // new count exceeds twice the old one. Everything else is pinned by algebra: the linear
          // value is the answer times m(2n - m) / n squared, which is below one for every m other
          // than n since n squared minus that is (n - m) squared, and the unchanged time is above
          // the answer in one visible half and below it in the other. So without m > 2n the "more"
          // half has one option above the answer and two below whatever the filler does, which
          // measured 62 / 38 across two slots, 2.73x. The old range stopped at m = 12 against n
          // from 3, which reached m > 2n only rarely; the counts are now drawn to make it common.
          const change = Math.abs(ans - tt);
          if (change < 0.5) continue;
          if (new Set([ans, tt, linear, change].map(v => v.toFixed(4))).size !== 4) continue;
          legal.push([n, m, tt]);
        }
      }
    }
    if (!legal.length) return reject(diag, 'no-legal-counts');
    const [n0, m0, t0] = f.counts ?? rng.pick(legal);
    const r2 = v => Math.round(v * 100) / 100;
    const answer = r2(n0 * t0 / m0);
    const dUnchanged = r2(t0);
    const dLinear = r2(t0 * (2 * n0 - m0) / n0);
    const dChange = r2(Math.abs(answer - t0));

    // The filler's side is drawn, since everything else sits on a fixed side within a visible half.
    const side = f.side ?? rng.pick(['below', 'above']);
    const known = [answer, dUnchanged, dLinear, dChange];
    let filler = null;
    for (let k = 0; k < 60; k++) {
      const mult = side === 'below' ? rng.float(0.70, 0.88) : rng.float(1.14, 1.34);
      const cand = Math.round(answer * mult * 2) / 2;
      if (cand <= 0) continue;
      if (known.some(v => Math.abs(v - cand) < 0.03 * Math.max(v, cand))) continue;
      if ((side === 'below') !== (cand < answer)) continue;
      filler = r2(cand);
      break;
    }
    if (filler === null) return reject(diag, 'no-filler-on-the-drawn-side');
    if (new Set([...known, filler].map(v => v.toFixed(2))).size !== 5) return reject(diag, 'option-collision');

    const fmt = v => groupDigits(v, Number.isInteger(v) ? 0 : 1);
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dUnchanged, errorType: 'omitted-final-step',
            note: 'gave the original time, so the change in the number was never applied' },
          { value: dLinear, errorType: 'linear-not-inverse',
            note: `scaled the time by the change in the count instead of inversely by the count itself` },
          { value: dChange, errorType: 'wrong-quantity',
            note: 'gave how much the time changes by rather than what the new time is' },
        ],
        filler: [{ value: filler, note: 'not reachable by any single misreading' }],
        answerType: 'number', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d15#${rng.seed}`, archetypeId: 'd15', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `At ${job.org}, ${n0} ${job.unit} take ${fmt(t0)} ${job.tUnit} ${job.task}. `
        + `All the ${job.unit} work at the same rate.` },
      questionText: `How long would ${m0} ${job.unit} take ${job.task}?`,
      answerType: 'number',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: {},
      values: { originalCount: n0, newCount: m0, originalTime: fmt(t0) },
      workings: { formulaText: this.formulaText, steps: [
        `the work is ${n0} x ${fmt(t0)} = ${fmt(n0 * t0)} ${job.unit.replace(/s$/, '')} ${job.tUnit}`,
        `answer = ${fmt(n0 * t0)} / ${m0} = ${fmt(answer)}`,
      ] },
      targetSeconds: 83,
      // The three quantities added for the estimation route: the draw carried only the
      // direction and the filler side, so nothing numeric was available to it.
      params: { direction: m0 > n0 ? 'more' : 'fewer', side, n: n0, m: m0, t: t0 },
    };
  },
};
