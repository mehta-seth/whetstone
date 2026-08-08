import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { makeStimulus, stimulusFor } from '../lib/stimulus.js';
import { rowTotal, colTotal, grandTotal } from '../lib/dataset.js';

// b07 - Row share against column share
//
// Two questions with almost identical wording, one asking for a share along the row and one along
// the column. The archetype spec: "Both values must appear in both option sets, so reading the axis
// carelessly lands on a real distractor." That is a cross-item constraint, so build() emits the
// pair together. See blocker B3.
//
// The filler is the share of a neighbouring cell along the same axis, which is a real quantity
// read off the table rather than a perturbation of the answer. The spec forbids the latter.

export default {
  id: 'b07',
  name: 'Row share against column share',
  group: 'normalising',
  desks: [2],
  families: ['regional'],
  // PROBLEM 3. Warm-up declared, and the reason is that nothing declared it.
  //
  // The archetype spec states no tier at all for b01 to b08 except b04 and b08 as hard, so an earlier round's
  // default left almost the whole family at standard and Desk 02 warm-up with two members, b01 and
  // c01. At a 20-item length the cap relaxes to ceil(20/2) = 10, a 50 per cent share of the session
  // for one archetype, which the 25 per cent rule in 13.3 exists to prevent. Fixing the pool fixes
  // the cap as a side effect.
  //
  // This one earns warm-up on its own terms rather than to pad the pool: a single division, cell over row total or cell over column total. The
  // whole difficulty is reading which axis the stem asks for, which is comprehension not arithmetic.
  tiers: ['warmup', 'standard'],
  stimulus: 'table',
  answerType: 'percentage',
  targetSeconds: 45,
  slotsPerStimulus: [2, 2],
  emitsPair: true,

  // The two stems read differently, so the axis is visible
  variants: { key: 'axis', visible: true },

  constraints: [
    'the row share and the column share differ by at least 4 percentage points, or the axis '
      + 'confusion the pair exists to punish costs nothing',
    'both shares appear in both option sets',
    'the cell-over-grand-total value differs from both shares by at least 2 points',
    'the filler is the share of a neighbouring cell, never a perturbation of the answer',
  ],

  errorTypes: ['wrong-axis', 'wrong-denominator', 'wrong-numerator', 'filler'],

  formulaText: 'cell / row total x 100, against cell / column total x 100',

  build({ stimulus, rng, tier, forced = null, diag = null }) {
    const d = stimulus.dataset;
    const grand = grandTotal(d);

    const candidates = [];
    for (let r = 0; r < d.rows.length; r++) {
      for (let c = 0; c < d.cols.length; c++) {
        const cell = d.values[r][c];
        const rs = 100 * cell / rowTotal(d, r);
        const cs = 100 * cell / colTotal(d, c);
        const cg = 100 * cell / grand;
        if (Math.abs(rs - cs) < 4) continue;
        if (Math.abs(cg - rs) < 2 || Math.abs(cg - cs) < 2) continue;
        candidates.push({ r, c, cell, rs, cs, cg });
      }
    }
    if (!candidates.length) return reject(diag, 'no-cell-with-separated-shares');

    let firstFailure = null;
    for (const cand of (forced?.candidate ? [forced.candidate] : rng.shuffle(candidates)).slice(0, 14)) {
      const { r, c, cell, rs, cs, cg } = cand;
      const rt = rowTotal(d, r), ct = colTotal(d, c);
      const nbrCol = c + 1 < d.cols.length ? c + 1 : c - 1;
      const nbrRow = r + 1 < d.rows.length ? r + 1 : r - 1;

      const make = axis => {
        const isRow = axis === 'row';
        const correct = isRow ? rs : cs;
        const other = isRow ? cs : rs;
        const fillerValue = isRow
          ? 100 * d.values[r][nbrCol] / rt
          : 100 * d.values[nbrRow][c] / ct;
        let options;
        try {
          options = assemble({
            correct: { value: correct },
            distractors: [
              { value: other, errorType: 'wrong-axis',
                note: isRow
                  ? `divided by the ${d.cols[c].label} column total of ${ct} instead of the ${d.rows[r].label} row total of ${rt}`
                  : `divided by the ${d.rows[r].label} row total of ${rt} instead of the ${d.cols[c].label} column total of ${ct}` },
              { value: cg, errorType: 'wrong-denominator',
                note: `divided by the grand total of ${grand} rather than by one line of it` },
              { value: isRow ? 100 * rt / grand : 100 * ct / grand, errorType: 'wrong-numerator',
                note: isRow
                  ? `gave the ${d.rows[r].label} share of all ${d.meta.unitNoun} instead of the ${d.cols[c].label} share of ${d.rows[r].label}`
                  : `gave the ${d.cols[c].label} share of all ${d.meta.unitNoun} instead of the ${d.rows[r].label} share of ${d.cols[c].label}` },
            ],
            filler: [{ value: fillerValue,
              note: isRow
                ? `the ${d.cols[nbrCol].label} share of ${d.rows[r].label}, the neighbouring cell`
                : `the ${d.rows[nbrRow].label} share of ${d.cols[c].label}, the neighbouring cell` }],
            answerType: 'percentage', rng,
          });
        } catch (e) {
          if (e instanceof OptionError) return { failure: 'options:' + e.failures[0] };
          throw e;
        }
        return {
          id: `b07#${rng.seed}${isRow ? 'a' : 'b'}`, archetypeId: 'b07', seed: rng.seed, tier,
          stimulusType: 'table', stimulusId: stimulus.id, stimulus: stimulusFor(stimulus),
          questionText: isRow
            ? `What percentage of the ${d.meta.unitNoun} at ${d.rows[r].label} are ${d.cols[c].label}?`
            : `What percentage of all ${d.cols[c].label} are at ${d.rows[r].label}?`,
          answerType: 'percentage',
          correct: { value: correct, display: options.find(o => o.role === 'correct').display },
          options, optionContext: {},
          values: { cell, rowTotal: rt, colTotal: ct, grandTotal: grand },
          workings: {
            formulaText: this.formulaText,
            steps: [
              `${d.cols[c].label} at ${d.rows[r].label} = ${cell}`,
              isRow ? `${d.rows[r].label} row total = ${rt}` : `${d.cols[c].label} column total = ${ct}`,
              `${cell} / ${isRow ? rt : ct} x 100 = ${correct.toFixed(2)}%`,
            ],
          },
          targetSeconds: 45,
          params: { r, c, axis },
          pairedValue: other,
        };
      };

      const a = make('row'), b = make('col');
      if (a.failure || b.failure) { firstFailure = firstFailure ?? (a.failure || b.failure); continue; }
      // The archetype spec's requirement, checked rather than assumed: both values in both sets.
      const has = (it, v) => it.options.some(o => Math.abs(o.value - v) < 1e-9);
      if (!has(a, rs) || !has(a, cs) || !has(b, rs) || !has(b, cs)) {
        firstFailure = firstFailure ?? 'pair-does-not-share-both-values'; continue;
      }
      return [a, b];
    }
    return reject(diag, firstFailure ?? 'no-assemblable-candidate');
  },

  // Returns BOTH halves of the pair. The audit harness prefers this over generate() so the two
  // nearly-identical stems land next to each other on the page, which is the only way a human read
  // can catch a defect in the second one. Before this existed, generate() always returned the first
  // half and the audit showed 200 copies of it.
  generateAll(rng, tier, forced = null, diag = null) {
    const built = this.buildSolo(rng, tier, forced, diag);
    if (!built) return null;
    return built.map((it, i) => ({ ...it, stimulusIndex: i, firstOnStimulus: i === 0 }));
  },

  buildSolo(rng, tier, forced = null, diag = null) {
    const stimulus = makeStimulus({ family: 'regional', rng });
    if (!stimulus) return reject(diag, 'no-stimulus');
    return this.build({ stimulus, rng, tier, forced, diag });
  },

  generate(rng, tier, forced = null, diag = null) {
    const built = this.buildSolo(rng, tier, forced, diag);
    if (!built) return null;
    const which = forced?.which ?? (rng.next() < 0.5 ? 0 : 1);
    return { ...built[which], stimulusIndex: 0, firstOnStimulus: true };
  },
};
