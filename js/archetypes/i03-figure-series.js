import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { ATTRS, ATTR_KEYS, at, predictions, figureKey, figureText, ORIENT_NAMES, SHADE_NAMES, POS_NAMES, MARK_NAMES } from '../lib/figure.js';

// i03 - Figure series: the next figure
//
// Five figures, four independent attributes (lib/figure.js), each following its own rule: constant,
// stepping round, alternating, or cycling. Which figure comes next? This is the non-verbal format
// the general-ability tests use for inductive reasoning.
//
// EVERY DISTRACTOR IS THE ANSWER WITH ONE ATTRIBUTE WRONG, and the attribute is wrong in a named way:
// the change not applied, applied the wrong way round, or applied twice. So the options cannot be
// separated by any single feature, and the review screen can say which change you lost.
//
// The checker in lib/figure.js re-derives every attribute's prediction from the rule library and
// rejects the item if any attribute admits two, which is the figural version of the identifiability
// gate on the number series.

const VARYING = { warmup: 2, standard: 3, hard: 4 };
const STEPS = { warmup: [1, 2, 6, 7], standard: [1, 2, 3, 5, 6, 7], hard: [1, 2, 3, 5, 6, 7] };
const tierOf = t => (VARYING[t] ? t : 'standard');
const NAMES = { orient: 'the arrow\'s direction', shade: 'the arrow\'s shading', pos: 'the marker\'s position', mark: 'the marker\'s shape' };
const DESCRIBE = { orient: v => ORIENT_NAMES[v], shade: v => SHADE_NAMES[v], pos: v => POS_NAMES[v], mark: v => MARK_NAMES[v] };

function drawRule(rng, attr, tier) {
  const { size, cyclic } = ATTRS[attr];
  const v = rng.int(0, size - 1);
  if (cyclic) {
    if (rng.next() < 0.8) return { kind: 'step', v, k: rng.pick(STEPS[tierOf(tier)]) };
    let w; do { w = rng.int(0, size - 1); } while (w === v);
    return { kind: 'alt', v, w };
  }
  if (rng.next() < 0.6) return { kind: 'cycle', v, dir: rng.pick([1, -1]) };
  let w; do { w = rng.int(0, size - 1); } while (w === v);
  return { kind: 'alt', v, w };
}

export default {
  id: 'i03',
  name: 'Figure series: the next figure',
  group: 'figure-series',
  desks: [4],
  tiers: ['warmup', 'standard', 'hard'],
  stimulus: 'figure',
  answerType: 'label',
  targetSeconds: 72,

  constraints: [
    'every attribute admits exactly one prediction across its rule library',
    'the number of changing attributes matches the tier',
    'each distractor differs from the answer in exactly one attribute',
  ],

  errorTypes: ['missed-change', 'reversed-change', 'doubled-change'],

  formulaText: 'split the figure into its four attributes, find each one\'s rule, and apply each once more',

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const nVary = VARYING[tierOf(tier)];
    const varying = f.varying ?? rng.shuffle(ATTR_KEYS).slice(0, nVary);
    const rules = f.rules ?? Object.fromEntries(ATTR_KEYS.map(a => [a,
      varying.includes(a) ? drawRule(rng, a, tier) : { kind: 'const', v: rng.int(0, ATTRS[a].size - 1) }]));
    const frame = t => Object.fromEntries(ATTR_KEYS.map(a => [a, at(rules[a], t, ATTRS[a].size)]));
    const frames = [0, 1, 2, 3, 4].map(frame);
    const answer = frame(5);
    for (const a of ATTR_KEYS) {
      const p = predictions(a, frames.map(fr => fr[a]));
      if (p.size !== 1 || !p.has(answer[a])) return reject(diag, 'ambiguous-attribute');
    }

    // Candidate wrong values per changing attribute, each named.
    const cands = [];
    for (const a of varying) {
      const r = rules[a], size = ATTRS[a].size, last = frames[4][a];
      const push = (errorType, v, note) => {
        v = ((v % size) + size) % size;
        if (v !== answer[a]) cands.push({ a, v, errorType, note });
      };
      push('missed-change', last, `kept ${NAMES[a]} as it was in the fifth figure`);
      if (r.kind === 'step') {
        push('reversed-change', last - r.k, `changed ${NAMES[a]} by the right amount the wrong way round`);
        push('doubled-change', last + 2 * r.k, `changed ${NAMES[a]} twice`);
      }
      if (r.kind === 'cycle') push('reversed-change', last - r.dir, `cycled ${NAMES[a]} the wrong way round`);
    }
    // Round robin over attributes, so the four distractors spread across what changes.
    const picked = [];
    const byAttr = {};
    const seen = new Set([figureKey(answer)]);
    for (let round = 0; picked.length < 4 && round < 4; round++) {
      for (const a of rng.shuffle(varying)) {
        const c = (byAttr[a] ??= rng.shuffle(cands.filter(x => x.a === a)))[round];
        if (!c || picked.length >= 4) continue;
        const fig = { ...answer, [a]: c.v };
        if (seen.has(figureKey(fig))) continue;
        seen.add(figureKey(fig));
        picked.push({ ...c, fig });
      }
    }
    if (picked.length < 4) return reject(diag, 'too-few-derived');

    const order = rng.shuffle([0, 1, 2, 3, 4]);
    const byKey = new Map([[figureKey(answer), answer], ...picked.map(p => [figureKey(p.fig), p.fig])]);
    let options;
    try {
      options = assemble({
        correct: { value: figureKey(answer), display: figureText(answer), sortKey: order[0] },
        distractors: picked.map((p, i) => ({ value: figureKey(p.fig), display: figureText(p.fig), sortKey: order[i + 1],
          errorType: p.errorType, note: `${p.note}: ${DESCRIBE[p.a](p.v)} instead of ${DESCRIBE[p.a](answer[p.a])}` })),
        answerType: 'label',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }
    for (const o of options) o.figure = byKey.get(o.value);

    const ruleText = a => {
      const r = rules[a];
      if (r.kind === 'const') return `${NAMES[a]} stays ${DESCRIBE[a](r.v)}`;
      if (r.kind === 'alt') return `${NAMES[a]} alternates between ${DESCRIBE[a](r.v)} and ${DESCRIBE[a](r.w)}`;
      if (r.kind === 'cycle') return `${NAMES[a]} cycles ${SHADE_NAMES.length === 3 && a === 'shade' ? SHADE_NAMES.join(', ') : MARK_NAMES.join(', ')} ${r.dir > 0 ? 'forwards' : 'backwards'}`;
      return a === 'orient' ? `${NAMES[a]} turns ${r.k * 45 > 180 ? `${(8 - r.k) * 45} degrees anticlockwise` : `${r.k * 45} degrees clockwise`} each time`
        : `${NAMES[a]} moves ${r.k > 4 ? `${8 - r.k} cell${8 - r.k === 1 ? '' : 's'} anticlockwise` : `${r.k} cell${r.k === 1 ? '' : 's'} clockwise`} each time`;
    };
    return {
      id: `i03#${rng.seed}`,
      archetypeId: 'i03',
      seed: rng.seed,
      tier,
      stimulusType: 'figure',
      stimulus: { text: 'Each figure follows from the one before it by the same rules.', figures: frames },
      questionText: 'Which figure comes next?',
      answerType: 'label',
      correct: { value: figureKey(answer), display: figureText(answer) },
      options,
      optionContext: {},
      values: { changing: varying.length },
      workings: { formulaText: this.formulaText, steps: [...ATTR_KEYS.map(ruleText), `answer: ${figureText(answer)}`] },
      targetSeconds: 72,
      params: { varying, rules },
    };
  },
};
