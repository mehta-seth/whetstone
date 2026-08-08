import { groupDigits, roundTo, awkward } from '../lib/money.js';
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';

// d09 - Effect on a mean of adding an item
//
// The new mean is the old total plus the new value, over one more than the old count. Dividing by
// the old count is the off-by-one, and averaging the old mean with the new value is the trap.
//
// The new value sits above or below the old mean and the stem prints both, so the candidate can
// see which way the mean will move before doing anything. Visible variant, split on.
//
// DIVERGENCE, forced by that split. With the archetype spec's four distractors the pooled position reads a
// healthy 59/42 across two slots and the split reads 100% slot 2 for the above half and 100% slot
// 3 for the below half: two certainties averaged into a spread, which is the a17 midSide error
// and the whole reason the spec buckets. Every one of the four is on a fixed side within a
// half, so nothing inside the named set can move it. `reported-input`, which only repeats a
// number printed in the stem and is the weakest of the four, is replaced by a filler on a drawn
// side. Each visible half now reaches two slots, which is what the rule asks for.

const SETS = [
  { org: 'the Ashwell squad', unit: 'points', thing: 'a new player' },
  { org: 'Redmarley Kilns', unit: 'firings', thing: 'a new kiln' },
  { org: 'the Calderbank branch', unit: 'accounts', thing: 'a new adviser' },
  { org: 'Pelham Haulage', unit: 'deliveries', thing: 'a new driver' },
];

export default {
  id: 'd09',
  name: 'Effect on a mean of adding an item',
  group: 'averages',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'number',
  targetSeconds: 83,

  variants: { key: 'side', visible: true },

  constraints: [
    'the new value is far enough from the old mean that the mean shifts by at least 3 per cent',
    'the answer lands on one decimal place',
    'all five options distinct after formatting',
  ],

  errorTypes: ['unweighted-average', 'off-by-one', 'omitted-final-step', 'filler'],

  formulaText: '(old count x old mean + the new value) / (old count + 1)',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const set = f.set ?? rng.pick(SETS);
    const side = f.side ?? (rng.next() < 0.5 ? 'above' : 'below');
    const n = f.n ?? rng.int(7, 14);
    const oldMean = f.oldMean ?? Math.round(awkward(rng, 180, 640, 0));
    // Drawn on the side the stem will make visible, then the shift constraint is checked.
    const newValue = f.newValue ?? (side === 'above'
      ? Math.round(oldMean * rng.float(1.35, 2.4))
      : Math.round(oldMean * rng.float(0.15, 0.68)));
    if (newValue <= 0) return reject(diag, 'new-value-not-positive');
    if ((side === 'above') !== (newValue > oldMean)) return reject(diag, 'side-mismatch');

    const answer = roundTo((n * oldMean + newValue) / (n + 1), 1);
    if (Math.abs(answer - oldMean) < 0.03 * oldMean) return reject(diag, 'shift-too-small');

    const dAverage = roundTo((oldMean + newValue) / 2, 1);
    const dOffByOne = roundTo((n * oldMean + newValue) / n, 1);
    const fixed = [dAverage, dOffByOne, oldMean];
    const below = fixed.filter(v => v < answer).sort((a, b) => b - a);
    const above = fixed.filter(v => v > answer).sort((a, b) => a - b);
    const fillerBelow = f.fillerBelow ?? (rng.next() < 0.5);
    const lo = fillerBelow ? (below.length ? below[0] : answer * 0.82) : answer;
    const hi = fillerBelow ? answer : (above.length ? above[0] : answer * 1.18);
    if (hi - lo < 0.055 * answer) return reject(diag, 'no-room-for-filler');
    const filler = f.filler ?? roundTo(lo + (hi - lo) * rng.float(0.35, 0.65), 1);
    const gapOk = (x, y) => Math.abs(x - y) >= 0.021 * Math.max(x, y);
    if (![answer, ...fixed].every(v => gapOk(v, filler))) return reject(diag, 'filler-too-tight');
    const vals = [...fixed, filler];
    if (new Set([answer, ...vals].map(v => v.toFixed(1))).size !== 5) return reject(diag, 'option-collision');

    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dAverage, errorType: 'unweighted-average',
            note: `averaged the old mean with the new figure as though the ${n} existing values counted once between them` },
          { value: dOffByOne, errorType: 'off-by-one', note: `divided by ${n} rather than by ${n + 1}` },
          { value: oldMean, errorType: 'omitted-final-step', note: 'reported the mean as it was, so the new figure never entered' },
        ],
        filler: [{ value: filler, note: 'filler, close enough that magnitude cannot resolve the item' }],
        answerType: 'number', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d09#${rng.seed}`, archetypeId: 'd09', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `Across ${n} people, ${set.org} averaged ${groupDigits(oldMean, 0)} `
        + `${set.unit} each last season. ${set.thing[0].toUpperCase()}${set.thing.slice(1)} then `
        + `joined, with ${groupDigits(newValue, 0)} ${set.unit}.` },
      questionText: `What is the mean across all ${n + 1} of them?`,
      answerType: 'number',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: {},
      values: { n, oldMean, newValue, oldTotal: n * oldMean },
      workings: { formulaText: this.formulaText, steps: [
        `old total = ${n} x ${groupDigits(oldMean, 0)} = ${groupDigits(n * oldMean, 0)}`,
        `new total = ${groupDigits(n * oldMean, 0)} + ${groupDigits(newValue, 0)} = ${groupDigits(n * oldMean + newValue, 0)}`,
        `answer = ${groupDigits(n * oldMean + newValue, 0)} / ${n + 1} = ${answer}`,
      ] },
      targetSeconds: 83,
      params: { side, n, fillerBelow },
    };
  },
};
