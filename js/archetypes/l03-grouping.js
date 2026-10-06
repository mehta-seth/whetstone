import { assemble, OptionError } from '../lib/options.js';
import { reject } from '../lib/validate.js';
import {
  drawNames, splitWorlds, consistent, GRP_TYPES, trueGrpClue, GRP_MISREADINGS, grp, prune,
  specOf, grpFromSpec, mentionCounts,
} from '../lib/logic.js';
import { GRP_SCENARIOS, grpSentence, grpPartnerQuestion, grpSuppose, misreadNote, sentence } from '../lib/logic-text.js';

// l03 - Grouping: who must be together
//
// Six people, two groups of three. The clues are true of a hidden split, and the question asks who
// must share a group with a named person. In the `suppose` form the stem adds a hypothetical
// placement first, which is the shape of the interactive grouping tasks: one fact fixed, the
// consequences followed through.
//
// EXACTLY ONE PERSON IS FORCED. Across every split the clues allow, one and only one of the other
// five is always with the named person. The item is rejected if that person is forced by a single
// clue on its own, so the answer always needs two clues combined.
//
// A WRONG OPTION IS WHAT A MISREADING FORCES. Reading "are not on the same team" as "are", or
// reading a conditional backwards, forces a different partner, and enumeration says which. The rest
// are labelled by what the clues actually allow: someone who could share the group but need not, or
// someone the clues put in the other group.

const N = 6, SIZE = 3;
const CLUES = { warmup: [2, 4], standard: [2, 5], hard: [2, 6] };
const tierOf = t => (CLUES[t] ? t : 'standard');
const ORDER = ['missed-negation', 'converse-conditional'];

export default {
  id: 'l03',
  name: 'Grouping: who must be together',
  group: 'grouping',
  desks: [3],
  tiers: ['warmup', 'standard', 'hard'],
  stimulus: 'logic',
  answerType: 'label',
  targetSeconds: 90,

  constraints: [
    'the clues are true of a hidden split into two groups of three',
    'exactly one other person is in the named person\'s group in every split the clues allow',
    'no single clue forces that person on its own',
    'no clue can be dropped without unforcing the answer',
    'in the suppose form, the supposition is consistent with the clues and is needed to force the answer',
  ],

  errorTypes: ['missed-negation', 'converse-conditional', 'possible-not-necessary', 'contradicts-clues',
    'misapplied-supposition'],

  formulaText: 'enumerate the 20 splits, keep those the clues allow, find who is always with the named person',

  variants: { key: 'ask', visible: true },

  generate(rng, tier, forced = null, diag = null) {
    const f = forced ?? {};
    const band = CLUES[tierOf(tier)];
    const S = f.scenario ? GRP_SCENARIOS.find(s => s.id === f.scenario) : rng.pick(GRP_SCENARIOS);
    const names = f.names ?? drawNames(rng, N);
    const worlds = splitWorlds(N, SIZE);
    const hiddenTeam = f.team ?? (() => {
      const zero = new Set(rng.shuffle([...Array(N).keys()]).slice(0, SIZE));
      return [...Array(N).keys()].map(i => (zero.has(i) ? 0 : 1));
    })();
    const truth = worlds.find(w => w.team.every((t, i) => t === hiddenTeam[i]));
    const ask = f.ask ?? (tier === 'warmup' ? 'partner' : rng.next() < 0.5 ? 'partner' : 'suppose');
    const x = f.x ?? rng.int(0, N - 1);
    // The supposition, if any, is a true placement of someone other than the named person.
    const y = f.y ?? (() => { let v; do { v = rng.int(0, N - 1); } while (v === x); return v; })();
    const sup = ask === 'suppose' ? grp.on(y, truth.team[y]) : null;
    const withSup = cl => (sup ? [...cl, sup] : cl);

    const forcedPartners = cl => {
      const W = consistent(worlds, withSup(cl));
      if (!W.length) return null;
      return [...Array(N).keys()].filter(p => p !== x && W.every(w => w.team[p] === w.team[x]));
    };
    const settled = cl => forcedPartners(cl)?.length === 1;

    let clues;
    if (f.clues) clues = f.clues.map(grpFromSpec);
    else {
      clues = [];
      for (let i = 0; i < 200 && !settled(clues); i++) {
        const c = trueGrpClue(rng, truth, N, GRP_TYPES[tierOf(tier)]);
        if (!c || clues.some(z => z.key === c.key)) continue;
        // A clue that forces BOTH partners settles the whole group and leaves two right answers, so
        // it is skipped rather than kept and later rejected. Measured: skipping it took the warm-up
        // rejection rate from 85% to the figure the audit now reports.
        if ((forcedPartners([...clues, c])?.length ?? 0) > 1) continue;
        clues.push(c);
      }
      if (!settled(clues)) return reject(diag, 'not-settled');
      clues = prune(clues, settled);
    }
    if (!clues.every(c => c.holds(truth))) return reject(diag, 'clue-false-of-hidden-split');
    if (!settled(clues)) return reject(diag, 'not-settled');
    if (clues.length < band[0]) return reject(diag, 'too-few-clues');
    if (clues.length > band[1]) return reject(diag, 'too-many-clues');

    const answer = forcedPartners(clues)[0];
    // A single clue on its own (with the supposition, if any) must not already force the answer.
    const together = (cl) => consistent(worlds, withSup(cl)).every(w => w.team[answer] === w.team[x]);
    if (clues.some(c => together([c]))) return reject(diag, 'forced-by-one-clue');
    if (sup) {
      // The supposition must matter: without it, the answer is not forced.
      const W0 = consistent(worlds, clues);
      if (W0.every(w => w.team[answer] === w.team[x])) return reject(diag, 'supposition-not-needed');
    }

    // THE NAMING SHORTCUTS. A partner forced by elimination is often never named, and one forced by
    // a chain is often named twice, so in the raw draw the answer sat at either end of the mention
    // count far more often than chance. Both ends are thinned, with probabilities measured to bring
    // each back near one in five, ranked the way the audit's Mentions column ranks them: by count,
    // ties broken alphabetically.
    if (!f.clues) {
      const all = mentionCounts(clues, N);
      const rank = [...Array(N).keys()].filter(p => p !== x).map(p => ({ p, v: all[p] + p / 10 }));
      const top = rank.reduce((a, b) => (b.v > a.v ? b : a)).p;
      const bottom = rank.reduce((a, b) => (b.v < a.v ? b : a)).p;
      if (answer === top && rng.next() < 0.4) return reject(diag, 'answer-is-most-named');
      if (answer === bottom && rng.next() < 0.27) return reject(diag, 'answer-is-least-named');
      // Thinning the two ends moved the mass to the second-most-named rank, which the audit then read
      // at 51% against a floor of 25%: the next scanning rule along. That rank is thinned as well.
      const order = rank.slice().sort((a, b) => a.v - b.v).map(r => r.p);
      if (order.indexOf(answer) === order.length - 2 && rng.next() < 0.6) return reject(diag, 'answer-is-second-most-named');
    }

    const W = consistent(worlds, withSup(clues));
    const labels = new Map();
    for (const errorType of ORDER) {
      clues.forEach((c, i) => {
        const swap = GRP_MISREADINGS[errorType](c);
        if (!swap) return;
        const alt = [...clues.slice(0, i), ...clues.slice(i + 1), swap];
        for (const p of forcedPartners(alt) ?? []) {
          if (p !== answer && !labels.has(p)) labels.set(p, { errorType, note: misreadNote(errorType, grpSentence(c, S, names)) });
        }
      });
    }
    if (sup) {
      const other = grp.on(y, 1 - truth.team[y]);
      const Wo = consistent(worlds, [...clues, other]);
      if (Wo.length) {
        for (const p of [...Array(N).keys()].filter(q => q !== x && q !== answer && Wo.every(w => w.team[q] === w.team[x]))) {
          if (!labels.has(p)) labels.set(p, { errorType: 'misapplied-supposition', note: `placed ${names[y]} in the other group from the one supposed` });
        }
      }
    }
    for (let p = 0; p < N; p++) {
      if (p === x || p === answer || labels.has(p)) continue;
      const sometimes = W.some(w => w.team[p] === w.team[x]);
      labels.set(p, sometimes
        ? { errorType: 'possible-not-necessary', note: `can share ${names[x]}'s group in some arrangements, but need not` }
        : { errorType: 'contradicts-clues', note: `the clues always put them in the other group from ${names[x]}` });
    }
    const named = [...labels.values()].filter(l => l.errorType === 'missed-negation' || l.errorType === 'converse-conditional' || l.errorType === 'misapplied-supposition').length;

    let options;
    try {
      options = assemble({
        correct: { value: `p${answer}`, display: names[answer], sortKey: answer },
        distractors: [...labels.entries()].map(([p, l]) => ({ value: `p${p}`, display: names[p], sortKey: p, ...l })),
        answerType: 'label',
        rng,
      });
    } catch (e) {
      if (e instanceof OptionError) return reject(diag, 'options:' + e.failures[0]);
      throw e;
    }

    const lines = rng.shuffle(clues).map(c => sentence(grpSentence(c, S, names)));
    const mentions = mentionCounts(clues, N);
    const others = [...Array(N).keys()].filter(p => p !== x);
    return {
      id: `l03#${rng.seed}`,
      archetypeId: 'l03',
      seed: rng.seed,
      tier,
      stimulusType: 'logic',
      stimulus: { text: S.intro(names), lines },
      questionText: (sup ? grpSuppose(S, names[y], truth.team[y]) + ' ' : '') + grpPartnerQuestion(S, names[x]),
      answerType: 'label',
      correct: { value: `p${answer}`, display: names[answer] },
      options,
      optionContext: {},
      correlation: {
        keys: others.map(p => `p${p}`),
        columns: { 'Alphabetical': others.map(p => p), 'Mentions': others.map(p => mentions[p] + p / 10) },
      },
      values: { clues: clues.length, splits: W.length, namedMisreadings: named },
      workings: {
        formulaText: this.formulaText,
        steps: [
          `${W.length} arrangement${W.length === 1 ? '' : 's'} fit${W.length === 1 ? 's' : ''}${sup ? ' the clues and the supposition' : ' the clues'}:`,
          ...W.slice(0, 6).map(w => `${S.teams[0]}: ${names.filter((_, i) => w.team[i] === 0).join(', ')}; `
            + `${S.teams[1]}: ${names.filter((_, i) => w.team[i] === 1).join(', ')}`),
          `answer: ${names[answer]} is with ${names[x]} in every one`,
        ],
      },
      targetSeconds: 90,
      params: { scenario: S.id, names, team: hiddenTeam, ask, x, y, clues: clues.map(specOf) },
    };
  },
};
