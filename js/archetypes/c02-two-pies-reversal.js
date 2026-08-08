// c02 - Two pies, share falls while absolute rises
//
// Two pies with different totals. Which segment grew in absolute terms. A share can fall while the
// absolute value rises, and the spec calls this the strongest pie trap available.
//
// DECISIONS.
//
// 1. FIVE SEGMENTS MINIMUM, not the archetype spec's four. The answer type is `label` and the option set
//    needs five distinct ones, so four segments cannot fill it. Not a preference, arithmetic.
//
// 2. The four distractor roles must be four distinct segments, and in the obvious construction two
//    of them collide: the segment with the largest share DECREASE is usually also the largest
//    segment in the later pie, because the largest segment has the most room to fall and still
//    leads. Measured over 400,000 random draws, only 1.1% separate all four roles while also
//    carrying a reversal. That is well past the point where rejection sampling belongs at the outer
//    level, so the search sits inside `generate` and absorbs it, the same shape as a10's
//    findAtRankPair.
//
// 3. Why the roles fight each other, which is worth writing down because it shapes the draw. In
//    absolute units the gain on segment i is
//
//        gain_i  =  s2_i x t2 - s1_i x t1  =  t1 x ( s1_i (r - 1) + d_i x r )
//
//    where r = t2 / t1 and d_i is the change in percentage points. So gain mixes the STARTING share
//    with the change in share, weighted by how much the total grew. The largest d tends to carry the
//    largest gain as well, which collapses the answer onto the `share-not-absolute` distractor; they
//    separate only when the answer's segment starts far higher, since
//
//        (s1_answer - s1_share)(r - 1)  >  (d_share - d_answer) x r
//
//    must hold. At r = 1.4 a two-point deficit in d needs a seven-point surplus in s1. The draw
//    therefore spreads the starting shares deliberately rather than drawing them flat.
//
// 4. The fifth option is a leftover among five segment labels, so its role is emergent and it is
//    labelled from what it turns out to be, per the a10 and a14 finding: `runner-up` where it is
//    second on absolute gain, `filler` where it is not.
//
// 5. THE ANSWER'S RANK IN THE LATER PIE IS DRAWN, NOT LEFT TO FALL OUT. Because gain rises with the
//    later share and the largest later wedge is itself a distractor, the answer settles immediately
//    below it: measured at 0 / 1 / 6 / 51 / 43 / 0 over six segments, a rank leak at 51% against a
//    41% bar. Rank 1 and rank n are barred by construction, the top one because it is the
//    `headline-metric` distractor, so ranks 2 to n-1 are the space and the rank is drawn evenly
//    across it and then realised inside the same search. Third time this pattern has appeared, after
//    a10 and c01, and it is now the default way to build a label archetype here.
//
// 6. A KNOWN RESIDUAL LEAK, recorded rather than papered over. In units of the earlier total the gain
//    is exactly
//
//        gain_i  =  s2_i x r  -  s1_i
//
//    so it rises with the later share and falls with the earlier one, and since the largest later
//    wedge is itself the `headline-metric` distractor, the answer is pulled to the rank just below it.
//    Three draws were measured:
//
//      independent shares, no rank target          later-pie column 51%, rejection  0.5%
//      independent shares, rank drawn and realised later-pie column 44%, rejection 55.9%
//      later shares assigned against the earlier   BOTH columns 70% and 64%, position skew 50%,
//        ranking, so a small category grows large    rejection 83.6%
//
//    The third was an attempt to let the answer start low and finish mid-table, which the algebra
//    above says is what would decorrelate it. It overshot: forcing the answer to start lowest pinned
//    the EARLIER column instead, which is the same relocation failure as a12's training hours and
//    a10's first two attempts. The second draw is kept. 44% against a 41% bar is a marginal rank
//    leak and it stands as a defect, not a pass. Removing it needs the `headline-metric` distractor
//    to stop being the largest later wedge, which is an the archetype spec change and not an implementation
//    one.
//
//    Five configurations were measured against the row-count buckets, and the tuning was stopped
//    when it began to oscillate rather than converge:
//
//      rank drawn evenly, pooled reading            44%          (a mixing artifact, see below)
//      rank drawn evenly, bucketed                  60% / 68%    n=5 / n=6
//      deep ranks over-weighted for both counts     61% / 51%    rejection 79.3%
//      per-count weights, 5:{2,3} even              65% / 52%    rejection 47.4%   <- kept
//      per-count weights, 5:{2:1,3:3}               70% / 54%    overshot the other way
//
//    At five segments only two ranks are reachable, so the floor is 50% against a 48% bar and weight
//    alone cannot land inside it: shifting weight moves the accepted mix steeply because the deeper
//    rank fails the search far more often. At six segments three ranks are reachable and 52% sits
//    against a 41% bar. The item is otherwise sound, every option derived and the reversal live.
import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import { chartSpec } from '../lib/chart.js';
import { groupDigits, isRound } from '../lib/money.js';

const MIN_SEGMENT = 10;       // see lib/chart.js
const GROWTH      = [1.25, 1.60];
const SEARCH_BUDGET = 600;

const SCENARIOS = [
  { org: 'Ravensmoor Museum', noun: 'visitors', unitNoun: 'visitors', early: '2019', late: '2024',
    cats: ['Under 16', 'Student', 'Standard', 'Concession', 'Member', 'Group booking'] },
  { org: 'Calderwick Ferries', noun: 'passengers', unitNoun: 'passengers', early: '2018', late: '2023',
    cats: ['Foot passenger', 'Car and driver', 'Freight', 'Coach party', 'Motorcycle', 'Cyclist'] },
  { org: 'Thornlea College', noun: 'applications', unitNoun: 'applications', early: '2020', late: '2025',
    cats: ['Engineering', 'Business', 'Nursing', 'Computing', 'Design', 'Education'] },
];

// Integer shares summing to exactly 100, all distinct, none under the minimum, and deliberately
// spread rather than flat, because a flat starting pie collapses the answer onto the largest share
// increase. See note 3 in the header.
function drawSpread(rng, n) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const parts = [];
    let left = 100;
    for (let i = 0; i < n - 1; i++) {
      const remaining = n - 1 - i;
      const hi = Math.min(left - MIN_SEGMENT * remaining, 34);
      if (hi < MIN_SEGMENT) { parts.length = 0; break; }
      parts.push(rng.int(MIN_SEGMENT, hi));
      left -= parts.at(-1);
    }
    if (!parts.length) continue;
    if (left < MIN_SEGMENT || left > 34) continue;
    parts.push(left);
    if (new Set(parts).size !== parts.length) continue;
    // Spread, measured as the gap between the largest and smallest starting share. Below eight
    // points the answer and the share-not-absolute distractor collide almost always.
    if (Math.max(...parts) - Math.min(...parts) < 8) continue;
    return parts;
  }
  return null;
}

export function formula({ shares1, shares2, total1, total2 }) {
  const abs1 = shares1.map(s => s * total1 / 100);
  const abs2 = shares2.map(s => s * total2 / 100);
  const gain = abs2.map((v, i) => v - abs1[i]);
  const delta = shares2.map((s, i) => s - shares1[i]);
  const argmax = a => a.indexOf(Math.max(...a));
  const argmin = a => a.indexOf(Math.min(...a));
  const order = gain.map((v, i) => i).sort((a, b) => gain[b] - gain[a]);
  return {
    abs1, abs2, gain, delta,
    answer:   argmax(gain),          // largest absolute gain
    second:   order[1],              // runner-up on the correct calculation
    byShare:  argmax(delta),         // largest share increase
    biggest:  argmax(shares2),       // largest segment in the later pie
    byFall:   argmin(delta),         // largest share decrease
    reversals: shares1.map((s, i) => shares2[i] < s && abs2[i] > abs1[i]).filter(Boolean).length,
  };
}

export default {
  id: 'c02',
  name: 'Two pies, share falls while absolute rises',
  group: 'charts',
  tiers: ['hard'],
  desks: [2],
  stimulus: 'chart',
  answerType: 'label',
  targetSeconds: 45,

  constraints: [
    'five or six segments, because a five-option label set needs five distinct labels and four '
      + 'segments cannot fill it',
    'every segment at least 10 per cent in both pies, integers summing to exactly 100 in each',
    'both totals are stated in the caption and differ by 25 to 60 per cent',
    'at least one segment has its share fall while its absolute value rises, which is the trap',
    'the answer, the largest share increase, the largest later segment and the largest share '
      + 'decrease are four distinct segments, leaving one for the fifth option',
    'the answer\'s rank in the later pie is drawn evenly across the ranks it can occupy, rather '
      + 'than settling immediately below the largest wedge, which is where gain pushes it',
    'both totals are multiples of 100 that are not round, so every absolute is a whole count and '
      + 'the figures still force a setup',
  ],

  errorTypes: ['share-not-absolute', 'headline-metric', 'sign-flip', 'runner-up', 'filler'],

  formulaText: 'argmax over (later share x later total) - (earlier share x earlier total)',
  formula,

  generate(rng, tier, forced = null, diag = null) {
    const sc = forced?.scenario ?? rng.pick(SCENARIOS);
    const n = forced?.segments ?? rng.int(5, 6);

    // Totals are multiples of 100 so every absolute is a whole count, and awkward in their other
    // digits so the figures still force a setup. The spec wants both and only a multiple of 100 gives
    // both, since a countable unit needs `share x total` divisible by 100.
    let total1 = forced?.total1 ?? null, total2 = forced?.total2 ?? null;
    if (total1 === null || total2 === null) {
      for (let attempt = 0; attempt < 60 && total2 === null; attempt++) {
        const t1 = rng.int(40, 120) * 100;
        if (isRound(t1)) continue;
        const t2 = Math.round(t1 * rng.float(GROWTH[0], GROWTH[1]) / 100) * 100;
        if (isRound(t2)) continue;
        const r = t2 / t1;
        if (r < GROWTH[0] || r > GROWTH[1]) continue;
        total1 = t1; total2 = t2;
      }
    }
    if (total1 === null || total2 === null) return reject(diag, 'no-awkward-total-pair');

    // Ranks are counted from the top, so 1 is the largest wedge in the later pie. Rank 1 is the
    // `headline-metric` distractor and cannot be the answer; rank n is effectively unreachable
    // because gain rises with the later share.
    //
    // Drawn evenly the accepted mix is not even, because the deeper ranks fail the search far more
    // often and each failure is replaced by a fresh draw: measured rejection was 0.2% at rank 2
    // against 25.1% at rank 4. So the deep ranks are over-weighted to compensate, exactly as a10's
    // rarest rank pair is. The weights are per distance from the top rather than per absolute rank,
    // so they work at both segment counts.
    // Weights are per segment count, because the reachable depth differs. At five segments only the
    // second and third wedges are reachable and an even draw is the floor; at six the fourth becomes
    // reachable but rarely, so it is over-weighted. Weighting a rank the search cannot reach simply
    // spends attempts and pushes the accepted mix onto its neighbour, which is what a flat weight of
    // 7 on rank 4 did at five segments.
    const RANK_WEIGHTS = n === 5 ? { 2: 1, 3: 1 } : { 2: 1, 3: 4, 4: 7 };
    const targetRank = forced?.targetRank ?? (() => {
      const avail = [];
      for (const [r, w] of Object.entries(RANK_WEIGHTS)) for (let k = 0; k < w; k++) avail.push(Number(r));
      return rng.pick(avail);
    })();

    let found = forced?.shares1 && forced?.shares2
      ? { shares1: forced.shares1, shares2: forced.shares2 }
      : null;

    if (!found) {
      // The four roles separate in about one draw in ninety, so the search sits here and absorbs it
      // rather than being rejected upward. Same shape as a10's findAtRankPair.
      for (let attempt = 0; attempt < SEARCH_BUDGET && !found; attempt++) {
        const shares1 = drawSpread(rng, n);
        const shares2 = drawSpread(rng, n);
        if (!shares1 || !shares2) continue;
        if (shares1.every((s, i) => s === shares2[i])) continue;
        const f = formula({ shares1, shares2, total1, total2 });
        if (!f.reversals) continue;                                   // the trap must be live
        const roles = [f.answer, f.byShare, f.biggest, f.byFall];
        if (new Set(roles).size !== 4) continue;
        // The share-based reading and the absolute-based reading must be different labels, which is
        // the whole item, and is not implied by the roles being distinct.
        if (f.answer === f.byShare) continue;
        const lateRank = [...shares2].sort((a, b) => b - a).indexOf(shares2[f.answer]) + 1;
        if (lateRank !== targetRank) continue;
        found = { shares1, shares2, f };
      }
    }
    if (!found) return reject(diag, `no-share-pair-at-late-rank-${targetRank}`);

    const { shares1, shares2 } = found;
    const f = found.f ?? formula({ shares1, shares2, total1, total2 });
    if (!f.reversals) return reject(diag, 'no-reversal');
    if (new Set([f.answer, f.byShare, f.biggest, f.byFall]).size !== 4) return reject(diag, 'roles-collide');

    const leftover = shares1.map((_, i) => i).find(i => ![f.answer, f.byShare, f.biggest, f.byFall].includes(i));
    if (leftover === undefined) return reject(diag, 'no-segment-left-for-the-fifth-option');
    // Labelled from what it is, not from what is left. See note 4 in the header.
    const leftoverIsNearMiss = leftover === f.second;

    const cats = sc.cats.slice(0, n);
    const opt = (i, errorType, note) => ({ value: `s${i}`, display: cats[i], sortKey: i, errorType, note });
    const pie = (label, shares, total) => ({
      label, total, labelMode: 'percent',
      segments: shares.map((s, i) => ({ label: cats[i], value: s, display: `${s}%` })),
    });

    const chart = chartSpec({
      kind: 'pies',
      caption: `${sc.org}: ${sc.noun} by category. Total ${groupDigits(total1, 0)} in ${sc.early} `
        + `and ${groupDigits(total2, 0)} in ${sc.late}.`,
      pies: [pie(sc.early, shares1, total1), pie(sc.late, shares2, total2)],
    });

    let options;
    try {
      options = assemble({
        correct: opt(f.answer, null, 'CORRECT'),
        distractors: [
          opt(f.byShare, 'share-not-absolute',
            `took the largest rise in SHARE, ${shares1[f.byShare]}% to ${shares2[f.byShare]}%, `
            + `without applying the two totals`),
          opt(f.biggest, 'headline-metric',
            `read the largest wedge in ${sc.late} at ${shares2[f.biggest]}% rather than the largest growth`),
          opt(f.byFall, 'sign-flip',
            `took the largest FALL in share, ${shares1[f.byFall]}% to ${shares2[f.byFall]}%, `
            + `reading the comparison the wrong way round`),
          ...(leftoverIsNearMiss ? [opt(leftover, 'runner-up',
            `second on absolute growth, up ${groupDigits(f.gain[leftover], 0)} against `
            + `${groupDigits(f.gain[f.answer], 0)}, so one slip on the winning wedge lands here`)] : []),
        ],
        filler: leftoverIsNearMiss ? [] : [opt(leftover, 'filler',
          `neither a headline wedge nor a near miss on the growth, up ${groupDigits(f.gain[leftover], 0)}`)],
        answerType: 'label', rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const reversed = shares1.map((s, i) => (shares2[i] < s && f.abs2[i] > f.abs1[i]) ? cats[i] : null).filter(Boolean);

    return {
      id: `c02#${rng.seed}`, archetypeId: 'c02', seed: rng.seed, tier,
      stimulusType: 'chart',
      stimulus: {
        text: `${sc.org} recorded its ${sc.noun} by category in ${sc.early} and again in ${sc.late}. `
          + `The two totals are not the same, so a category can take a smaller share of a larger `
          + `number.`,
        chart,
      },
      questionText: `Which category grew the most in absolute terms between ${sc.early} and ${sc.late}?`,
      answerType: 'label',
      correct: { value: `s${f.answer}`, display: cats[f.answer] },
      options, optionContext: {},
      // Both visible columns, since the candidate reads both pies. The answer is the argmax of a
      // combination of the two, so it can pin to either, and the diagnostic is the only thing that
      // sees it.
      correlation: {
        keys: cats.map((_, i) => `s${i}`),
        columns: { [`Share in ${sc.early}`]: shares1.slice(), [`Share in ${sc.late}`]: shares2.slice() },
      },
      values: Object.fromEntries(cats.map((c, i) =>
        [c, `${shares1[i]}% of ${groupDigits(total1, 0)} = ${groupDigits(f.abs1[i], 0)}, then `
          + `${shares2[i]}% of ${groupDigits(total2, 0)} = ${groupDigits(f.abs2[i], 0)}, `
          + `${f.gain[i] >= 0 ? 'up' : 'down'} ${groupDigits(Math.abs(f.gain[i]), 0)}`])),
      workings: {
        formulaText: this.formulaText,
        steps: [
          `the caption gives ${groupDigits(total1, 0)} ${sc.unitNoun} in ${sc.early} and `
            + `${groupDigits(total2, 0)} in ${sc.late}`,
          ...cats.map((c, i) =>
            `${c}: ${groupDigits(f.abs1[i], 0)} then ${groupDigits(f.abs2[i], 0)}, `
            + `${f.gain[i] >= 0 ? '+' : ''}${groupDigits(f.gain[i], 0)}`),
          `largest growth is ${cats[f.answer]} at +${groupDigits(f.gain[f.answer], 0)}`,
          reversed.length
            ? `${reversed.join(' and ')} took a smaller share of a larger total and still grew, `
              + `which is what the item turns on`
            : 'no category reversed direction',
        ],
      },
      targetSeconds: this.targetSeconds,
      stimulusId: `c02s#${rng.seed}`, stimulusIndex: 0, firstOnStimulus: true,
      params: { scenario: sc.org, segments: n, targetRank },
    };
  },
};
