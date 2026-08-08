import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { groupDigits } from '../lib/money.js';

// d14 - Average speed over two legs, with a unit change
//
// THE INVERTED DISTRACTOR IS GONE AND IT WAS UNBUILDABLE, not merely ugly. The archetype spec names "formula
// inverted", which is time over distance, so its ratio to the answer is one over the answer squared.
// validate's spread guard is symmetric, so clearing the 200x ceiling would need an answer under
// 14.14 in whatever unit, which rules out every km/h item. It is the same defect the archetype spec records
// against a18's source and an earlier round found in d03's inverted margin: a value no candidate would pick.
//
// Its replacement is the arithmetic mean of the two leg speeds, which is the single highest-frequency
// error in speed problems and needs the item to have two legs. That also makes the archetype spec's dangling
// "where a rest stop is mentioned" clause coherent, since the rest is now what the fourth distractor
// turns on.
//
// THE LEG SPEEDS MUST DIFFER BY A THIRD. With equal leg distances the answer is the harmonic mean and
// the distractor the arithmetic mean, so their ratio is (a+b)^2 / 4ab, and clearing the 2% minimum
// option gap means solving r^2 - 2.08r + 1 >= 0, which gives a leg ratio at or beyond 1.326.
//
// DOUBLE APPLICATION CANNOT APPEAR, under the same bound that emptied d07. The conversion factor is
// 3.6 and a candidate knows it, so `omitted-conversion` is the answer over 3.6 and applying the
// factor twice is the answer times 3.6. Both present puts the answer in the MIDDLE of a
// three-term geometric run in a known ratio, which is exactly the arrangement the off-by-one bound
// closes. Only the omission is kept, and the pair it leaves is measured rather than assumed: the
// legitimate path is two divisions, a sum and a multiplication against one multiplication for the
// attack, so this is the cost case that d06 documents and the sweep is the arbiter.
const RACES = [
  { org: 'the Hallmoor eight', legUnit: 'metres', act: 'rowed', split: 'half of the course' },
  { org: 'the Redcastle relay squad', legUnit: 'metres', act: 'ran', split: 'half of the route' },
  { org: 'the Kelsmoor swimmers', legUnit: 'metres', act: 'swam', split: 'half of the distance' },
];

export default {
  id: 'd14',
  name: 'Average speed over two legs, with a unit change',
  group: 'rates',
  desks: [1],
  tiers: ['warmup', 'standard'],
  stimulus: 'prose',
  answerType: 'number',
  targetSeconds: 83,

  constraints: [
    'the conversion is necessary, since the data is metres and seconds and the answer is km/h',
    'the two leg speeds differ by at least a third, so the arithmetic mean clears the 2% option gap',
    'the answer lands on one decimal place',
    'the rest stop makes moving time and total time differ',
  ],

  errorTypes: ['unweighted-average', 'omitted-conversion', 'reported-input', 'wrong-input'],

  formulaText: 'total distance / total moving time, converted from metres per second to km/h',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const race = f.race ?? rng.pick(RACES);
    const K = 3.6;
    const r1 = v => Math.round(v * 10) / 10;

    // ENUMERATED, NOT DRAWN AND REJECTED, and the first version cost 98.3% of attempts. The answer
    // is 7.2 x legM / moving and must land on one decimal place, so 72 x legM has to be divisible by
    // the moving time: a condition on a single derived integer that a free draw of two leg times hits
    // by luck. At 59 attempts an item that is past the spec's fifty-attempt loop, so d14 would
    // have returned null in a real session and the caller would have silently picked another
    // archetype. Enumerating the legal (leg distance, moving time, first leg) triples costs nothing,
    // because every condition below is a function of those three alone.
    const legal = [];
    for (const legM of [400, 500, 600, 750, 800]) {
      for (let moving = 130; moving <= 400; moving++) {
        if ((72 * legM) % moving !== 0) continue;
        const ans = K * (2 * legM) / moving;
        if (ans < 6 || ans > 30) continue;
        // A WHOLE ANSWER IS EXCLUDED AT THE ENUMERATION. The other four options carry a decimal, so
        // a whole answer makes it the only value with an empty fractional part and the central check
        // rejects it: 35.6% of attempts before this line. The spec wants awkward values anyway.
        if (Math.abs(ans - Math.round(ans)) < 1e-9) continue;
        for (let a = 55; a <= moving - 55; a++) {
          const b = moving - a;
          if (a === b) continue;
          const r = Math.max(legM / a, legM / b) / Math.min(legM / a, legM / b);
          if (r < 1.326 || r > 2.2) continue;
          legal.push([legM, a, b]);
        }
      }
    }
    if (!legal.length) return reject(diag, 'no-legal-times');
    const [legM, t1, t2] = f.t1 !== undefined ? [f.legM, f.t1, f.t2] : rng.pick(legal);
    const rest = f.rest ?? rng.int(20, 70);

    const v1 = legM / t1, v2 = legM / t2;
    const ratio = Math.max(v1, v2) / Math.min(v1, v2);
    const moving = t1 + t2;
    const answer = r1(K * (2 * legM) / moving);

    const dMean = r1(K * (v1 + v2) / 2);
    const dNoConvert = r1((2 * legM) / moving);
    const side = f.side ?? rng.pick(['below', 'above']);
    const dLeg = r1(K * (side === 'above' ? Math.max(v1, v2) : Math.min(v1, v2)));
    const dRest = r1(K * (2 * legM) / (moving + rest));

    const vals = [answer, dMean, dNoConvert, dLeg, dRest];
    if (new Set(vals.map(v => v.toFixed(1))).size !== 5) return reject(diag, 'option-collision');
    if (Math.abs(dMean - answer) < 0.02 * answer) return reject(diag, 'mean-too-close');
    if (Math.abs(dLeg - answer) < 0.02 * answer) return reject(diag, 'leg-too-close');
    if (Math.abs(dRest - answer) < 0.02 * answer) return reject(diag, 'rest-too-close');
    if (Math.abs(dRest - dLeg) < 0.02 * Math.max(dRest, dLeg)) return reject(diag, 'rest-collides-with-leg');
    if ((side === 'above') !== (dLeg > answer)) return reject(diag, 'leg-on-the-wrong-side');

    const fmt = v => groupDigits(v, Number.isInteger(v) ? 0 : 1);
    let options;
    try {
      options = assemble({
        correct: { value: answer },
        distractors: [
          { value: dMean, errorType: 'unweighted-average',
            note: 'averaged the two leg speeds instead of dividing the whole distance by the whole time' },
          { value: dNoConvert, errorType: 'omitted-conversion',
            note: 'left the answer in metres per second, so the conversion to km/h was never applied' },
          { value: dLeg, errorType: 'reported-input',
            note: `gave the ${side === 'above' ? 'faster' : 'slower'} leg's speed rather than the average over both` },
          { value: dRest, errorType: 'wrong-input',
            note: `divided by the total elapsed time including the ${rest} second rest rather than by the moving time` },
        ],
        answerType: 'number', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d14#${rng.seed}`, archetypeId: 'd14', seed: rng.seed, tier,
      stimulusType: 'prose',
      stimulus: { text: `${race.org} ${race.act} the first ${legM} ${race.legUnit} in ${t1} seconds, `
        + `rested for ${rest} seconds, then ${race.act} the second ${legM} ${race.legUnit} in ${t2} seconds.` },
      questionText: 'What was their average speed while moving, in kilometres per hour?',
      answerType: 'number',
      correct: { value: answer, display: options.find(o => o.role === 'correct').display },
      options, optionContext: {},
      values: { movingSeconds: moving, totalMetres: 2 * legM, metresPerSecond: r1(dNoConvert) },
      workings: { formulaText: this.formulaText, steps: [
        `moving time = ${t1} + ${t2} = ${moving} seconds, distance = ${2 * legM} ${race.legUnit}`,
        `${2 * legM} / ${moving} = ${fmt(dNoConvert)} metres per second`,
        `answer = ${fmt(dNoConvert)} x 3.6 = ${fmt(answer)} km/h`,
      ] },
      targetSeconds: 83,
      params: { side, legRatio: Math.round(ratio * 100) / 100 },
    };
  },
};
