import { roundTo } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// a03 - "X percent faster" on a composite task
//
// Build the composite old time first, then multiply by (1 − X). Faster means less time.
//
// answerType is `number` and the unit lives in the question stem rather than in the options,
// which is the convention for elapsed times in this format.

const TASKS = [
  { org: 'a warehouse picker', a: { s: 'a pallet label', p: 'pallet labels' }, b: { s: 'a shelf tag', p: 'shelf tags' } },
  { org: 'a lab technician',   a: { s: 'a culture plate', p: 'culture plates' }, b: { s: 'a slide mount', p: 'slide mounts' } },
  { org: 'a bindery operator', a: { s: 'a hardback cover', p: 'hardback covers' }, b: { s: 'an endpaper', p: 'endpapers' } },
  { org: 'a kitchen porter',   a: { s: 'a stockpot', p: 'stockpots' }, b: { s: 'a service tray', p: 'service trays' } },
];
const SPEEDUPS = [15, 18, 20, 22, 25];

export default {
  id: 'a03',
  name: '"X percent faster" on a composite task',
  group: 'rates',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'number',
  targetSeconds: 83,

  constraints: [
    'the composite old time is at least 100 seconds, so the time-saved distractor is well separated',
    'the answer lands on two decimal places',
    'the filler uses a neighbouring speedup rate and still clears the minimum gap',
  ],

  errorTypes: ['sign-flip', 'omitted-final-step', 'wrong-quantity'],

  formulaText: 'composite old time × (1 − speedup)',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const task    = f.task    ?? rng.pick(TASKS);
    const tA      = f.tA      ?? rng.int(20, 40);
    const tB      = f.tB      ?? rng.int(8, 15);
    const qtyA    = f.qtyA    ?? rng.int(2, 4);
    const qtyB    = f.qtyB    ?? rng.int(1, 4);
    const speedup = f.speedup ?? rng.pick(SPEEDUPS);

    const oldTotal = qtyA * tA + qtyB * tB;
    if (oldTotal < 100) return reject(diag, 'old-total-floor');

    const answer  = roundTo(oldTotal * (1 - speedup / 100), 2);
    const slower  = roundTo(oldTotal * (1 + speedup / 100), 2);
    const saved   = roundTo(oldTotal * speedup / 100, 2);

    // Filler: a neighbouring rate applied. The neighbour that leaves the widest minimum gap is
    // taken, because adjacent rates in the set can be as little as two points apart.
    const fixedSet = [answer, slower, oldTotal, saved];
    const near = SPEEDUPS.filter(r => r !== speedup).map(r => ({
      r, value: roundTo(oldTotal * (1 - r / 100), 2),
    })).map(c => ({ ...c, gap: Math.min(...fixedSet.map(v => Math.abs(v - c.value))) }))
      .sort((a, b) => b.gap - a.gap)[0];
    if (!near || near.gap < 2) return reject(diag, 'no-clean-filler');

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: slower, errorType: 'sign-flip',
            note: `treated faster as more time, ${oldTotal} × ${(1 + speedup / 100).toFixed(2)}` },
          { value: oldTotal, errorType: 'omitted-final-step',
            note: 'reported the old time, the change was never applied' },
          { value: saved, errorType: 'wrong-quantity',
            note: 'reported the time saved rather than the new time' },
        ],
        filler: [
          { value: near.value, note: `filler, ${near.r}% applied instead of ${speedup}%` },
        ],
        answerType: 'number',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `a03#${rng.seed}`,
      archetypeId: 'a03',
      seed: rng.seed,
      tier,
      stimulusType: 'prose',
      stimulus: {
        text: `${task.org[0].toUpperCase()}${task.org.slice(1)} takes ${tA} seconds to prepare `
            + `${task.a.s} and ${tB} seconds to prepare ${task.b.s}. `
            + `After training, the same worker completes the whole job ${speedup}% faster.`,
      },
      questionText: `How many seconds will it take to prepare ${qtyA} ${task.a.p} and ${qtyB} ${task.b.p} after the training?`,
      answerType: 'number',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options,
      optionContext: {},
      values: { oldTotal, saved },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `old total = ${qtyA} × ${tA} + ${qtyB} × ${tB} = ${oldTotal} seconds`,
          `answer = ${oldTotal} × ${(1 - speedup / 100).toFixed(2)} = ${answer} seconds`,
        ],
      },
      targetSeconds: 83,
      params: { task, tA, tB, qtyA, qtyB, speedup },
    };
  },
};
