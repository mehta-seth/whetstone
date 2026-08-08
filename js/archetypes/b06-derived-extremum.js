import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { groupDigits, money } from '../lib/money.js';
import { makeStimulus, stimulusFor, columnCorrelationView } from '../lib/stimulus.js';
import { derivedSeries, rowSeries } from '../lib/dataset.js';
import { extremum } from '../lib/relations.js';

// b06 - Argmax or argmin with label answers
//
// The answer is a column name, not a number, and it comes from a derived series, so reading the
// largest raw value is wrong.
//
// EMITS A PAIR. The archetype spec: "Generate matched argmax and argmin pairs off the same stimulus,
// since a shared table is the norm in this format." Two items sharing a stimulus is a cross-item structure
// the Desk 01 item model cannot express, so build() returns an array. See blocker B3.
//
// THAT COLLIDES WITH the spec's NO-CONSECUTIVE-REPEAT RULE, which forbids an archetype appearing
// twice in a row. A matched pair placed close together is the same archetype twice in a row by
// definition. The pair requirement wins and the session loop exempts pairs, applying the rule
// between pairs instead. Recorded.

// CARRY-IN 2. The rank pair the winner occupies on the two input rows, drawn from a
// weighting and then realised by the dataset builder, which is a10's method applied to a table.
//
// Barring the winner from being the argmax of either input leaves it high but not highest on
// both, and rank 4 of 5 is exactly that. Measured over 40,000 retail tables, six of the sixteen
// interior pairs are reachable for the argmax winner, in the same triangle a10 has:
//
//     (4,4) 50.3%   (3,4) 24.3%   (4,3) 16.7%   (2,4) 4.7%   (4,2) 2.6%   (3,3) 1.4%
//
// The argmin loser mirrors it exactly. Because b06 emits a matched pair off ONE table, both
// extrema must be realised at once, and only 17 of the 36 joint cells occur at all. The target
// is therefore the joint cell, written "winner sold rank, winner profit rank | loser sold rank,
// loser profit rank".
//
// The draw weights are the solution to minimising the worst of the four marginals subject to a
// search budget of 150 candidate tables an item and every reachable cell carrying at least 1%,
// so the allocation is not itself a pattern. The trade-off was measured rather than guessed:
//
//     budget   5     10    20    30    50    80   120   150   200
//     worst  91.1  66.7  49.1  47.8  45.3  41.4  36.9  35.3  33.3 %
//
// 33.3% is the structural floor, since only three ranks are reachable on each column, and 200
// candidates buys 1.5 points over 150 for a third more work.
const RANK_PAIR_WEIGHTS = {
  '44|22': 0.0002, '34|22': 0.0005, '44|23': 0.0007, '44|32': 0.0007, '34|23': 0.0008,
  '43|22': 0.0008, '43|32': 0.0010, '24|32': 0.0023, '43|24': 0.0037, '34|42': 0.0038,
  '42|23': 0.0043, '24|42': 0.0058, '42|24': 0.1964, '33|24': 0.0495, '24|33': 0.3120,
  '33|42': 0.3409, '42|33': 0.0765,
};

function drawRankPair(rng) {
  let r = rng.next();
  for (const [cell, w] of Object.entries(RANK_PAIR_WEIGHTS)) { r -= w; if (r <= 0) return cell; }
  return '33|42';
}

export default {
  id: 'b06',
  name: 'Argmax or argmin over a derived series',
  group: 'comparison',
  desks: [2],

  // 'regional' is REMOVED, and this is a correction rather than a narrowing.
  // Measured at 0 accepted in 3,000 forced regional draws, so it has never shipped a single item
  // since early on; open item 16 recorded it as rejecting 54.7%, which was measured on
  // the wrong denominator. It cost 55.7% of b06's attempts to produce nothing.
  //
  // The cause is exact and is the same joint-extremum problem the retail half had. b06 emits a
  // matched pair, so ONE ordered row pair must serve both halves: the max item needs
  // {amax(dv), amax(va), amax(vb), amin(dv)} distinct and the min item needs
  // {amin(dv), amin(va), amin(vb), amax(dv)} distinct. Over 7,200 ordered pairs, amax of a
  // difference is amax of its first row 50.3% of the time and amin of the difference is amax of
  // its second row in the same 50.3%, so the first condition passes 9.4% and the second then
  // fails ALL of them: 0 of 4,800.
  //
  // Restoring it needs the regional builder to assign the six column roles first and construct
  // the two rows to realise them, which is the retail fix one level harder and is not in this
  // session's carry-ins. Enumeration above is done; the construction is carried forward.
  families: ['retail'],
  tiers: ['standard'],
  stimulus: 'table',
  answerType: 'label',
  targetSeconds: 45,
  slotsPerStimulus: [2, 2],
  emitsPair: true,

  // The stem says most or least, so the candidate sees which extremum is wanted
  variants: { key: 'direction', visible: true },

  constraints: [
    'the argmax of the derived series is the argmax of neither input row, or the item is answered '
      + 'by reading one column',
    'the same holds for the argmin, since the pair is generated together',
    'the five option labels are distinct, so the two headline-metric distractors cannot collide',
    'the winning margin on the derived series is at least 2 per cent of the winner, so the item is '
      + 'resolvable without being resolvable by eye',
  ],

  errorTypes: ['headline-metric', 'sign-flip', 'filler'],

  formulaText: 'argmax, or argmin, over the product or difference of two rows',

  build({ stimulus, rng, tier, forced = null, diag = null }) {
    const d = stimulus.dataset;
    const cols = d.cols;
    if (cols.length < 5) return reject(diag, 'too-few-columns-for-a-label-set');

    let derived, inputs, phrase, unitFmt;
    if (d.family === 'retail') {
      const sold = d.rows.findIndex(r => r.key === 'sold');
      const profit = d.rows.findIndex(r => r.key === 'profit');
      derived = derivedSeries(d, { op: 'product', a: sold, b: profit, label: 'total profit' });
      inputs = [rowSeries(d, sold), rowSeries(d, profit)];
      phrase = 'total profit';
      unitFmt = v => money(v, d.meta.symbol, 2);
    } else {
      // Every ordered pair of rows is a candidate difference, and the constraints are checked
      // before one is chosen rather than after. Drawing a pair at random and testing rejected
      // most attempts, for the same reason the retail builder now constructs its own invariant.
      const legal = [];
      const amax = arr => arr.indexOf(Math.max(...arr));
      const amin = arr => arr.indexOf(Math.min(...arr));
      for (let a = 0; a < d.rows.length; a++) {
        for (let b = 0; b < d.rows.length; b++) {
          if (a === b) continue;
          const va = d.values[a], vb = d.values[b];
          const dv = va.map((v, i) => v - vb[i]);
          if (new Set(dv).size !== dv.length) continue;
          // Each of the two items needs four distinct labels plus one spare for the filler, so
          // its four marked columns must be distinct. The two items may share columns with each
          // other; an earlier version asked for six distinct indices across five columns, which
          // cannot hold and rejected every regional draw.
          const forMax = new Set([amax(dv), amax(va), amax(vb), amin(dv)]);
          const forMin = new Set([amin(dv), amin(va), amin(vb), amax(dv)]);
          if (forMax.size !== 4 || forMin.size !== 4) continue;
          const st = [...dv].sort((x, y) => y - x);
          if (Math.abs(st[0] - st[1]) < 0.02 * Math.abs(st[0])) continue;
          legal.push({ a, b });
        }
      }
      if (!legal.length) return reject(diag, 'no-legal-row-pair');
      const { a, b } = forced?.pair ?? rng.pick(legal);
      derived = derivedSeries(d, { op: 'difference', a, b,
        label: `${d.rows[a].label} less ${d.rows[b].label}` });
      inputs = [rowSeries(d, a), rowSeries(d, b)];
      phrase = `excess of ${d.rows[a].label} over ${d.rows[b].label}`;
      unitFmt = v => groupDigits(v, 0);
    }

    const hi = extremum(derived, 'max');
    const lo = extremum(derived, 'min');
    const inHi = inputs.map(s => extremum(s, 'max'));
    const inLo = inputs.map(s => extremum(s, 'min'));

    if (inHi.some(x => x.value === hi.value)) return reject(diag, 'argmax-is-an-input-argmax');
    if (inLo.some(x => x.value === lo.value)) return reject(diag, 'argmin-is-an-input-argmin');
    if (inHi[0].value === inHi[1].value) return reject(diag, 'input-argmaxes-collide');
    if (inLo[0].value === inLo[1].value) return reject(diag, 'input-argmins-collide');
    if (inHi.some(x => x.value === lo.value) || inLo.some(x => x.value === hi.value)) {
      return reject(diag, 'opposite-extremum-collides-with-an-input');
    }

    const sorted = [...derived.values].sort((x, y) => y - x);
    if (Math.abs(sorted[0] - sorted[1]) < 0.02 * Math.abs(sorted[0])) return reject(diag, 'margin-too-thin');

    const key = i => cols[i].key;
    const sortKeyOf = k => cols.findIndex(c => c.key === k);
    const label = k => ({ value: k, display: cols[sortKeyOf(k)].label, sortKey: sortKeyOf(k) });

    const make = (direction) => {
      const want = direction === 'max' ? hi : lo;
      const other = direction === 'max' ? lo : hi;
      const ins = direction === 'max' ? inHi : inLo;
      const used = new Set([want.value, other.value, ins[0].value, ins[1].value]);
      const fillerKey = cols.map((_, i) => key(i)).find(k => !used.has(k));
      if (!fillerKey) return null;
      let options;
      try {
        options = assemble({
          correct: label(want.value),
          distractors: [
            { ...label(ins[0].value), errorType: 'headline-metric',
              note: `read the ${direction === 'max' ? 'highest' : 'lowest'} ${inputs[0].label.toLowerCase()} instead of working out ${phrase}` },
            { ...label(ins[1].value), errorType: 'headline-metric',
              note: `read the ${direction === 'max' ? 'highest' : 'lowest'} ${inputs[1].label.toLowerCase()} instead of working out ${phrase}` },
            { ...label(other.value), errorType: 'sign-flip',
              note: `worked out ${phrase} correctly and then took the ${direction === 'max' ? 'smallest' : 'largest'}` },
          ],
          filler: [{ ...label(fillerKey), note: 'not reachable by any single misreading' }],
          answerType: 'label', rng,
        });
      } catch (e) {
        if (e instanceof OptionError) return { failure: 'options:' + e.failures[0] };
        throw e;
      }
      return {
        id: `b06#${rng.seed}${direction === 'min' ? 'b' : 'a'}`, archetypeId: 'b06', seed: rng.seed, tier,
        stimulusType: 'table', stimulusId: stimulus.id, stimulus: stimulusFor(stimulus),
        questionText: d.family === 'retail'
          ? `Which size made the ${direction === 'max' ? 'most' : 'least'} total profit last year?`
          : `Which category shows the ${direction === 'max' ? 'largest' : 'smallest'} ${phrase}?`,
        answerType: 'label',
        correct: { value: want.value, display: options.find(o => o.role === 'correct').display },
        options, optionContext: {},
        values: Object.fromEntries(derived.values.map((v, i) => [cols[i].key, unitFmt(v)])),
        workings: {
          formulaText: this.formulaText,
          steps: [
            ...derived.values.map((v, i) => `${cols[i].label}: ${unitFmt(v)}`),
            `${direction === 'max' ? 'largest' : 'smallest'} is ${cols[sortKeyOf(want.value)].label}`,
          ],
        },
        targetSeconds: 45,
        params: { direction, family: d.family },
        correlation: columnCorrelationView(d),
      };
    };

    const a = make('max'), b = make('min');
    if (!a || a.failure) return reject(diag, a?.failure ?? 'no-filler-label');
    if (!b || b.failure) return reject(diag, b?.failure ?? 'no-filler-label');
    return [a, b];
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
    const family = forced?.family ?? rng.pick(this.families);
    // Retail draws its rank pair and the builder realises it. Regional has no product series and
    // is not exposed to the same geometry, so it draws nothing.
    // The default now lives in retailDataset, so the shared path gets the weighting
    // too. Only a fixture overrides it. See the note above retailDataset.
    const opts = family === 'retail' && forced?.want ? { want: forced.want } : {};
    const stimulus = makeStimulus({ family, rng, opts });
    if (!stimulus) return reject(diag, `no-stimulus-at-${opts.want ?? family}`);
    return this.build({ stimulus, rng, tier, forced, diag });
  },

  generate(rng, tier, forced = null, diag = null) {
    const built = this.buildSolo(rng, tier, forced, diag);
    if (!built) return null;
    // Which half, drawn from the rng rather than fixed at 0, so any consumer that takes one item
    // at a time still sees both stems across a run.
    const which = forced?.which ?? (rng.next() < 0.5 ? 0 : 1);
    return { ...built[which], stimulusIndex: 0, firstOnStimulus: true };
  },
};
