import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { makeStimulus, stimulusFor, columnCorrelationView } from '../lib/stimulus.js';
import { roundTo } from '../lib/money.js';

// d13 - Per capita normalisation
//
// Which entity spends the most per head. Ranking on the raw total is wrong and so is ranking on
// population, and the whole teaching point is that per capita ordering differs from total ordering.
//
// The archetype spec had this as a `number` and an earlier round settled it as a `label`, because as a number the
// item is a single division and `headline-metric` is the grammar of a label answer: "the largest
// total" is an entity, not a quotient.
//
// FIVE ROLES ONTO FIVE DISTINCT ROWS, which the archetype spec does not state and which is the binding
// constraint. The option set is five of the labels, so the winner, the largest total, the largest
// population, the smallest population and the lowest spend per head must all be different
// entities. Measured over 200,000 draws that separates in 2.25% of them, and c02 established that
// anything near that belongs inside the builder rather than at the outer level. The clash that
// dominates is largest-total equals largest-population, at 80.4% of failures, because the total is
// population times spend per head.
//
// SIX ENTITIES, NOT FIVE, and the enumeration is in test/probes/s6d13ranks.mjs. At five the winner's
// population rank can only be 2 or 3, so the flattest achievable marginal is 50% against a 20%
// chance, which is 2.50x and above the leak band whatever the weighting does. That is c02's wall.
// Six opens rank 4 and puts the floor at 33% against 16.7%, which is 2.00x. Widening the value
// ranges does not help and a10's generalisation says why: the pin lands on the factor with the
// wider relative range, and narrowing population from 5.4x to 1.5x moved the dominant clash only
// from 75% to 63%. The lever is the entity count.
//
// EVERY OPTION IS DERIVED. There is no filler and no leftover label, because the five roles use
// five of the six rows and the sixth is not offered. So the emergent-role problem an earlier round found
// in a10 and a14 does not arise here.

const PER_HEAD = v => `\u00a3${Math.round(v * 1000)}`;

export default {
  id: 'd13',
  name: 'Per capita normalisation',
  group: 'normalising',
  desks: [2],
  tiers: ['standard'],
  stimulus: 'table',
  answerType: 'label',
  targetSeconds: 45,
  families: ['civic'],

  constraints: [
    'the entity with the largest total is not the entity with the largest figure per head',
    'the winner is neither the largest nor the smallest population, and neither the largest nor the smallest total',
    'the winning margin on the per head series is at least 2% of the winner',
    'the five option roles land on five distinct rows',
    'the winner rank pair on the two visible spending and population columns is drawn from a weighting and realised',
  ],

  errorTypes: ['headline-metric', 'checked-extremes-only', 'inverted'],

  formulaText: 'argmax(total spending / population)',

  build({ stimulus, rng, tier, forced = null, diag = null }) {
    const d = stimulus.dataset;
    if (d.family !== 'civic') return reject(diag, 'wrong-family');
    const cols = d.cols;
    if (cols.length < 5) return reject(diag, 'too-few-columns-for-a-label-set');

    const { winner, topSpend, topPop, lowPop, lowPerHead } = d.meta.roles;
    const roles = [winner, topSpend, topPop, lowPop, lowPerHead];
    if (new Set(roles).size !== 5) return reject(diag, 'roles-not-distinct');

    const per = d.meta.perHead;
    const sorted = [...per].sort((a, b) => b - a);
    if (sorted[0] < 1.02 * sorted[1]) return reject(diag, 'margin-too-thin');

    const label = i => ({ value: cols[i].key, display: cols[i].label, sortKey: i });
    const noun = d.meta.one;
    const [, y2] = d.meta.years;

    let options;
    try {
      options = assemble({
        correct: label(winner),
        distractors: [
          { ...label(topSpend), errorType: 'headline-metric',
            note: `read the largest ${y2} total instead of dividing it by the population` },
          { ...label(topPop), errorType: 'headline-metric',
            note: 'read the largest population instead of working out the figure per head' },
          { ...label(lowPop), errorType: 'checked-extremes-only',
            note: 'assumed the smallest population must give the most per head, which it often does but does not here' },
          { ...label(lowPerHead), errorType: 'inverted',
            note: 'divided population by spending rather than spending by population, so this is the LOWEST per head' },
        ],
        answerType: 'label', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    return {
      id: `d13#${rng.seed}`, archetypeId: 'd13', seed: rng.seed, tier,
      stimulusType: 'table', stimulusId: stimulus.id, stimulus: stimulusFor(stimulus),
      questionText: `Which ${noun} spent the most per ${d.meta.oneUnit} in ${y2}?`,
      answerType: 'label',
      correct: { value: cols[winner].key, display: options.find(o => o.role === 'correct').display },
      options, optionContext: {},
      values: Object.fromEntries(cols.map((c, i) => [c.key, PER_HEAD(per[i])])),
      workings: {
        formulaText: this.formulaText,
        steps: [
          ...cols.map((c, i) => `${c.label}: ${d.values[2][i]} million / ${d.values[0][i]} thousand = about ${PER_HEAD(per[i])} per ${d.meta.oneUnit}`),
          `the largest is ${cols[winner].label} at about ${PER_HEAD(per[winner])}`,
        ],
      },
      targetSeconds: 45,
      params: { spendRank: d.meta.ranks.spend, popRank: d.meta.ranks.pop, rows: cols.length },
      correlation: columnCorrelationView(d),
    };
  },

  buildSolo(rng, tier, forced = null, diag = null) {
    // The rank weighting is the builder's DEFAULT rather than something passed in here, which is
    // what an earlier round had to fix in b06: its target was drawn in buildSolo, a path only generate and
    // generateAll reach, so a real Desk 02 session got no weighting at all and the audit measured
    // the other path. Only a fixture overrides.
    const opts = forced?.want ? { want: forced.want } : {};
    const stimulus = makeStimulus({ family: 'civic', rng, opts });
    if (!stimulus) return reject(diag, 'no-civic-stimulus');
    return this.build({ stimulus, rng, tier, forced, diag });
  },

  generate(rng, tier, forced = null, diag = null) {
    return this.buildSolo(rng, tier, forced, diag);
  },

  formula({ population, spending }) {
    const per = spending.map((v, i) => roundTo(v / population[i], 6));
    const best = per.indexOf(Math.max(...per));
    return {
      perHead: per.map(v => Math.round(v * 1000)),
      answerIndex: best,
      largestTotalIndex: spending.indexOf(Math.max(...spending)),
      largestPopulationIndex: population.indexOf(Math.max(...population)),
      lowestPerHeadIndex: per.indexOf(Math.min(...per)),
    };
  },
};
