// node test/run.js
// Two jobs. Preflight the pinned PRNG, then diff every archetype against its
// parameter-injected fixtures. Exit code 1 on any failure.
import { readFileSync } from 'node:fs';
import * as R from '../js/render.js';
import * as SESS from '../js/session.js';
import { makeClock, elapsedSince } from '../js/timer.js';
import * as STORE from '../js/store.js';
import * as ADAPT from '../js/adaptive.js';
import { weightFor } from '../js/adaptive.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeRng } from '../js/lib/rng.js';
import { roundTo } from '../js/lib/money.js';
import * as PREC from '../js/lib/precision.js';
import { checkItem as _checkItem, checkOptionSet as _checkOptionSet, checkTable as _checkTable } from '../js/lib/validate.js';
import { harmonise } from '../js/lib/format.js';
import { tableSpec } from '../js/lib/table.js';
import { ratio } from '../js/lib/fraction.js';
import * as D from '../js/lib/dataset.js';
import { makeDataset } from '../js/lib/dataset.js';
import * as REL from '../js/lib/relations.js';
import * as ST from '../js/lib/stimulus.js';
import { archetypes } from '../js/archetypes/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures.json'), 'utf8'));

let pass = 0, fail = 0;
// Every predicate the preflight's negative cases actually produce. Wrapping the three checkers is
// the only honest way to know, since a predicate can exist, be reachable in principle, and never be
// exercised by any case in the suite.
// Three fixes are wiring rather than markup, so they are asserted against the source. A regex is a
// weak test and it is still stronger than the nothing that was there before.
const SRC = {
  render: readFileSync(new URL('../js/render.js', import.meta.url), 'utf8'),
  app: readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'),
  store: readFileSync(new URL('../js/store.js', import.meta.url), 'utf8'),
};
const FIRED_PREDICATES = [];
const record = fn => (...a) => { const r = fn(...a); (Array.isArray(r) ? r : []).forEach(v => FIRED_PREDICATES.push(v)); return r; };
const checkItem = record(_checkItem), checkOptionSet = record(_checkOptionSet), checkTable = record(_checkTable);
const COVERED_FLOOR = 11;
const say = (ok, msg) => { console.log(`  ${ok ? 'pass' : 'FAIL'}  ${msg}`); ok ? pass++ : fail++; };

console.log('\nPRNG preflight: mulberry32, as pinned');
{
  const a = makeRng(8814092), b = makeRng(8814092);
  const sa = Array.from({ length: 500 }, () => a.next());
  const sb = Array.from({ length: 500 }, () => b.next());
  say(sa.every((v, i) => v === sb[i]), 'identical 500-draw stream for identical seeds');
  say(makeRng(42).next() !== makeRng(43).next(), 'different seeds diverge');
  say(sa.every(v => v >= 0 && v < 1), 'every draw in [0, 1)');

  const r = makeRng(1);
  const draws = Array.from({ length: 100000 }, () => r.next());
  const mean = draws.reduce((x, y) => x + y, 0) / draws.length;
  say(Math.abs(mean - 0.5) < 0.005, `mean ${mean.toFixed(4)}, within 0.005 of 0.5`);
  const deciles = new Array(10).fill(0);
  draws.forEach(v => deciles[Math.min(9, Math.floor(v * 10))]++);
  say(Math.min(...deciles) > 9500 && Math.max(...deciles) < 10500,
      `decile counts ${Math.min(...deciles)} to ${Math.max(...deciles)}`);

  const seen = new Set(); const r2 = makeRng(7);
  for (let i = 0; i < 2000; i++) seen.add(r2.int(1, 5));
  say(seen.size === 5, `int(1,5) covers all five values (${[...seen].sort().join(',')})`);
  const r3 = makeRng(9); const shuffled = r3.shuffle([1, 2, 3, 4, 5]);
  say(shuffled.length === 5 && new Set(shuffled).size === 5, `shuffle is a permutation (${shuffled.join(',')})`);
}

const dpOf = v => { const m = String(v).match(/\.(\d+)/); return m ? m[1].length : 0; };
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && roundTo(a, dpOf(b)) === b;
// Fixtures cover numeric and categorical answers, so comparison and ordering both have
// to survive a string value.
const same = (got, want) => typeof want === 'number' ? near(got, want) : String(got) === String(want);
const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number')
  ? a - b : (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

// ---------------------------------------------------------------------------
// Formatter and option-rule preflight.
// Five decisions were taken in lib/format.js and lib/validate.js. Each is pinned by a
// test here so that reversing one fails loudly instead of quietly changing every item.
console.log('\nFORMATTER AND OPTION-RULE PREFLIGHT');
{
  const rendered = (opts, type, ctx = {}) => harmonise(opts, type, ctx).map(o => o.display);
  const clean = (opts, type, ctx = {}) => checkOptionSet(harmonise(opts, type, ctx), type, ctx);
  const set = vals => vals.map((v, i) => ({ value: v, role: i === 0 ? 'correct' : 'distractor', errorType: null }));

  // Decision 11. Money uniform, percentages natural.
  const cur = rendered(set([93.5, 38.75, 217, 465, 54.25]), 'currency');
  say(cur.every(d => dpOf(d) === 2), `currency set is uniform: ${cur.join(' ')}`);
  const pct = rendered(set([24, 30, 32, 12.5, 19]), 'percentage');
  say(pct.filter(d => dpOf(d) === 0).length === 4, `percentage set stays natural: ${pct.join(' ')}`);
  const ints = rendered(set([22064, 84564, 147064, 9396, 335264]), 'currency');
  say(ints.every(d => dpOf(d) === 0), 'all-integer currency set gains no decimals');

  // Zero-magnitude verdicts are exempt from the four ratio guards.
  const sd = [...set([-61.44, -192, 153.6, 61.44]), { value: 0, role: 'filler', errorType: 'filler' }];
  say(clean(sd, 'signedDirection', { expectedSign: -1 }).length === 0,
      'signedDirection accepts the mandated "Does not change" option at value 0');
  say(rendered(sd, 'signedDirection').includes('Does not change'), 'value 0 renders as the verdict, not "£0.00"');

  // Categorical types skip the ratio guards entirely.
  const months = [{ value: 9, display: 'October', role: 'correct', errorType: null },
    { value: 8, display: 'September', role: 'distractor', errorType: 'off-by-one' },
    { value: 10, display: 'November', role: 'distractor', errorType: 'off-by-one' },
    { value: 7, display: 'August', role: 'filler', errorType: 'filler' },
    { value: 0, display: 'January', role: 'filler', errorType: 'filler' }];
  say(clean(months, 'month').length === 0, 'month set accepts January at index 0, which is a divide by zero for the ratio guards');
  const labels = ['W', 'X', 'Y', 'Z', 'same'].map((v, i) => ({ value: v, display: `Package ${v}`,
    role: i === 0 ? 'correct' : i === 4 ? 'filler' : 'distractor', errorType: i ? 'omitted-component' : null }));
  say(clean(labels, 'label').length === 0, 'label set of five package names is accepted');

  // Fractions and labels must carry their own display, because 3/4 and 0.75 are the
  // same number and the printed form cannot be recovered from the value.
  say(checkOptionSet(set([0.75, 0.4167, 0.5833, 0.6667, 1.1667]), 'fraction')
      .includes('missing-explicit-display'), 'fraction options without a display are rejected');

  // ratio and verdict are declared in ANSWER_TYPES but no Desk 01 archetype emits one: ratio
  // first appears in b02 and verdict in b05, both an earlier round. Their formatter and validator paths
  // are exercised here so an earlier round inherits something already proven rather than assumed.
  const ratios = [[3, 1], [5, 2], [7, 3], [9, 4], [11, 5]].map(([a, b], i) => {
    const r = ratio(a, b);
    return { value: r.value, display: r.display, role: i === 0 ? 'correct' : 'distractor',
      errorType: i ? 'inverted-ratio' : null };
  });
  say(clean(ratios, 'ratio').length === 0, `ratio set accepted: ${ratios.map(o => o.display).join(' ')}`);
  say(ratio(8, 12).display === '2:3', `ratio reduces to lowest terms: ${ratio(8, 12).display}`);
  say(checkOptionSet(ratios.map(({ display, ...o }) => o), 'ratio')
      .includes('missing-explicit-display'), 'ratio options without a display are rejected');

  // verdict mixes verbal options with numeric ones in the same set, which the real Desk 02 test
  // does. It is categorical, so the ratio guards must not fire on the strings.
  const verdicts = [
    { value: 'exceeded', display: 'They have exceeded the RDA', role: 'correct', errorType: null },
    { value: 12, display: '12%', role: 'distractor', errorType: 'sign-flip' },
    { value: 18, display: '18%', role: 'distractor', errorType: 'wrong-base' },
    { value: 24, display: '24%', role: 'distractor', errorType: 'omitted-scaling' },
    { value: 'cannot', display: 'Cannot Say', role: 'filler', errorType: 'filler' },
  ];
  say(clean(verdicts, 'verdict').length === 0, 'verdict set mixes verbal and numeric options');

  // Table invariants.
  say(checkTable(tableSpec({ head: ['Package', 'Licence'], body: [['W', '£21,000'], ['X', '£19,500']] })).length === 0,
      'a well-formed standalone table passes');
  say(checkTable({ head: ['a', 'b'], body: [['1', '2'], ['3']], align: ['left', 'right'] }).includes('table-ragged'),
      'a ragged table row is rejected');
  say(checkTable({ head: ['a', 'b'], body: [['1', ''], ['3', '4']], align: ['left', 'right'] }).includes('table-empty-cell'),
      'an empty table cell is rejected');
}


// ---------------------------------------------------------------------------------------
// An earlier round preflight: the relational generator. Every relation is pinned against hand
// arithmetic on one fixed 3x3 dataset, so a refactor of dataset.js or relations.js fails
// here rather than quietly changing every Desk 02 item. This is the same argument section
// 9.4 makes for parameter-injected fixtures, applied one level down to the lib layer.
console.log('\nRELATIONAL GENERATOR preflight');
{
  const d = makeDataset({
    family: 'regional',
    rows: [{ key: 'A', label: 'A', dp: 0, additive: true },
           { key: 'B', label: 'B', dp: 0, additive: true }],
    cols: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }, { key: 'z', label: 'z' }],
    values: [[10, 20, 30], [40, 50, 60]],
    totals: { row: true, col: true },
    caption: 'preflight', text: 'preflight',
  });

  say(D.rowTotal(d, 0) === 60 && D.colTotal(d, 1) === 70 && D.grandTotal(d) === 210,
      `row total 60, column total 70, grand total ${D.grandTotal(d)}`);
  say(REL.rowShare(d, 0, 1).value === 100 * 20 / 60, `rowShare = ${REL.rowShare(d, 0, 1).value.toFixed(4)}%`);
  say(REL.colShare(d, 0, 1).value === 100 * 20 / 70, `colShare = ${REL.colShare(d, 0, 1).value.toFixed(4)}%`);
  say(REL.rowShare(d, 0, 1).value !== REL.colShare(d, 0, 1).value,
      'row share and column share differ, which is the whole of b07');
  say(REL.cellOverGrand(d, 0, 1).value === 100 * 20 / 210, 'cellOverGrand');
  say(REL.subtotalOverGrand(d, [[0, 0], [0, 1]]).value === 100 * 30 / 210, 'subtotalOverGrand');
  say(REL.multiCellSum(d, [[0, 0], [1, 2]]).value === 70, 'multiCellSum');
  say(REL.percentageChange(80, 92).value === 15, 'percentageChange 80 to 92 is 15%');
  say(REL.percentageDifference(92, 80).value === 15, 'percentageDifference 92 against 80 is 15%');
  say(REL.percentageOfReference(21, 84).value === 25, 'percentageOfReference 21 of 84 is 25%');
  const sh = REL.shortfall(21, 84);
  say(sh.value === 75 && sh.exceeded === false, 'shortfall 21 against 84 is 75%, not exceeded');
  say(REL.shortfall(96, 84).exceeded === true && REL.shortfall(96, 84).value < 0,
      'consumption above the reference reports exceeded, and the figure goes negative');
  say(REL.ratioOf(24, 36).display === '2:3', `ratioOf(24, 36) = ${REL.ratioOf(24, 36).display}`);
  say(REL.pctRequiredToMatch(80, 100).value === 25, 'pctRequiredToMatch 80 to 100 is 25%');
  say(REL.perUnitRate(90, 4).value === 22.5, 'perUnitRate');
  say(REL.weightedAverage([65, 40], [20, 30]).value === 50,
      'weightedAverage matches a21: 20 at 65% and 30 at 40% pools to 50%');

  // Derived series. A product, a difference and a per-column scaling, all returning the same
  // shape a raw row returns, which is what lets one relation serve both.
  const prod = D.derivedSeries(d, { op: 'product', a: 0, b: 1, label: 'product' });
  say(JSON.stringify(prod.values) === JSON.stringify([400, 1000, 1800]), `derived product ${prod.values.join(' ')}`);
  const diff = D.derivedSeries(d, { op: 'difference', a: 1, b: 0 });
  say(JSON.stringify(diff.values) === JSON.stringify([30, 30, 30]), 'derived difference');
  const scaled = D.derivedSeries(d, { op: 'scaled', a: 0, factors: [0.25, 0.3, 1] });
  say(JSON.stringify(scaled.values) === JSON.stringify([2.5, 6, 30]), `derived scaling ${scaled.values.join(' ')}`);
  say(REL.extremum(prod, 'max').value === 'z' && REL.extremum(prod, 'min').value === 'x',
      'argmax and argmin run on a derived series identically to a raw one');
  say(REL.extremum(D.rowSeries(d, 0), 'max').value === 'z', 'argmax over a raw row');

  // The counterfactual wrapper. Immutable, because b03 needs the stale and the fresh
  // denominator in the same item.
  const cf = D.counterfactual(d, { r: 0, c: 0, pct: 27 });
  say(D.cell(d, 0, 0) === 10, 'the original dataset survives the perturbation');
  say(Math.abs(D.cell(cf, 0, 0) - 12.7) < 1e-9, `perturbed cell ${D.cell(cf, 0, 0)}`);
  say(Math.abs(D.grandTotal(cf) - 212.7) < 1e-9, 'the grand total moves with the perturbed cell');
  say(REL.rowShare(cf, 0, 1).value !== REL.rowShare(d, 0, 1).value,
      'the denominator moves too, which is b03');
  const cons = D.counterfactual(d, { r: 0, c: 0, pct: 50, conserve: { r: 0, c: 2 } });
  const red = REL.conservationReduction(cons);
  say(Math.abs(red.increase - 5) < 1e-9 && Math.abs(red.value - 100 * 5 / 30) < 1e-9,
      `conservation: a 50% rise of 10 needs 30 cut by ${red.value.toFixed(4)}%`);

  say(REL.RELATION_COUNT === 15,
      `the relation registry holds ${REL.RELATION_COUNT} relations, matching Part B's stated fifteen`);

  // Negative cases for the predicates that caught real defects, so each is known to fire rather
  // than merely known to exist. Every one of these corresponds to something that reached a
  // candidate or nearly did.
  {
    const opt = (value, role = 'distractor') => ({ value, display: String(value), role, errorType: role === 'correct' ? null : 'x' });
    const set = vals => vals.map((v, i) => opt(v, i === vals.length - 1 ? 'correct' : 'distractor'));
    const fires = (name, options, answerType = 'currency', context = {}) => {
      const f = checkOptionSet(options, answerType, context);
      say(f.includes(name), `predicate ${name} fires on a case built to trip it`
        + (f.includes(name) ? '' : ` (got ${f.join(', ') || 'nothing'})`));
    };
    // The an earlier round formatting tell, made central earlier. a05 shipped it since early on.
    fires('answer-alone-on-a-whole-value', set([1.25, 2.5, 3.75, 5.5, 7]));
    // a01's and d03's adjacent integers are legal; a zero gap is not.
    fires('min-gap', set([100, 100.5, 200, 300, 400]));
    // d14's inverted speed distractor sits thousands of times out.
    fires('max-spread', set([1, 2, 3, 4, 900]));
    fires('distractor-equals-answer', [opt(5), opt(10), opt(20), opt(40), opt(40, 'correct')]);
    // The invariant that denies estimation: something must sit close to the answer.
    fires('no-tight-neighbour', set([1, 2.2, 4.9, 11, 100]));
    // An earlier round's width predicate, from the seven-names-eight-columns defect.
    {
      const f = checkTable(tableSpec({ head: ['a', 'b', 'c'], body: [['x', 1, 2], ['y', 1, 2, 3]] }));
      say(f.includes('head-body-width-mismatch'), 'predicate head-body-width-mismatch fires on a ragged table');
    }
  }

  // ---------- session delivery and the adaptive incentive ----------
  //
  // Second audit. Seven defects, and the two that mattered were both invisible to every
  // check the project had, because nothing had ever built a session across the configurations the
  // setup screen can actually produce.
  {
    const T = {
      instantFeedback: true, perItemClock: false, setupBox: false, showSpread: false,
      optionLetters: false, showArchetype: false, backNav: false, sessionClock: true,
      allowSkip: true, blockBlanks: true, adaptive: false, optionOrder: 'ascending', timerWarning: true,
    };

    // P1. Every length the setup screen offers, on both desks, at every tier. Measured before the
    // fix: Desk 02 hard at 10 items was short in 100% of builds and delivered as few as ONE.
    // Three separate causes: the stimulus was never regenerated when the archetypes assigned to it
    // could not read it, the planner discarded remaining archetypes when no existing table could
    // host them, and the relaxed share cap frequently lands exactly on the requested length so a
    // single build failure had no slack to absorb it.
    {
      const configs = [];
      for (const desk of [1, 2]) {
        for (const tier of ['warmup', 'standard', 'hard']) {
          for (const length of SESS.DESKS[desk].lengths) configs.push([desk, tier, length]);
        }
      }
      let short = 0, total = 0, worstGap = 0, worstAt = '';
      for (const [desk, tier, length] of configs) {
        for (let n = 0; n < 8; n++) {
          const r = SESS.buildItems({ desk, tier, groups: [], length,
            sessionSeed: 7700000 + n * 41, adaptive: false, mode: 'exam' });
          const got = (r.items ?? r).length;
          total++;
          if (got < length) {
            short++;
            if (length - got > worstGap) { worstGap = length - got; worstAt = `desk ${desk} ${tier} ${length} gave ${got}`; }
          }
        }
      }
      say(short === 0, `every session fills to the requested length, ${total} builds across ${configs.length} configurations`
        + (short ? `: ${short} short, worst ${worstAt}` : ''));
    }

    // P1's second half. A shortfall must be recorded and stated, because a score out of a
    // denominator you did not choose is not a measurement of the skill.
    {
      const run = SESS.createRun({ desk: 1, mode: 'exam', tier: 'standard', groups: [], length: 18,
        sessionSeed: 7710000, toggles: T });
      say(run.session.requestedLength === 18
        && R.shortfallNotice({ session: { requestedLength: 20 }, items: Array(19).fill(0) }).includes('19 items, not the 20')
        && R.shortfallNotice(run) === '',
        'a session records what was requested and the review says so only when it fell short');
    }

    // P2. The adaptive engine must not reward guessing. Before: a fast wrong answer scored full
    // marks on the speed term, so guessing instantly on your weakest archetype lowered its
    // selection weight by 19% and the app showed you LESS of what you were worst at.
    {
      const mem2 = new Map();
      const realLS = globalThis.localStorage;
      globalThis.localStorage = {
        getItem: k => (mem2.has(k) ? mem2.get(k) : null),
        setItem: (k, v) => mem2.set(k, String(v)), removeItem: k => mem2.delete(k),
      };
      const resp = ms => ({ archetypeId: 'a01', correct: false, msToSubmit: ms, skipped: false,
        mode: 'practice', errorType: 'round-up' });
      for (let i = 0; i < 8; i++) STORE.applyResponse(resp(2000));
      const guessed = { ...STORE.mastery().a01 };
      mem2.clear();
      for (let i = 0; i < 8; i++) STORE.applyResponse(resp(150000));
      const worked = { ...STORE.mastery().a01 };
      mem2.clear();
      for (let i = 0; i < 4; i++) STORE.applyResponse({ ...resp(40000), correct: true, errorType: null });
      const right = { ...STORE.mastery().a01 };
      globalThis.localStorage = realLS;
      // Compared with a tolerance, not for equality: weightFor adds a staleness term derived from
      // lastSeen, so two records written microseconds apart differ in the last floating-point digits
      // and a strict comparison passes or fails on which millisecond the batches landed in. The first
      // version of this assertion was flaky for exactly that reason.
      const gap = Math.abs(weightFor(guessed, 83) - weightFor(worked, 83));
      say(gap < 1e-6 && guessed.medianMs === null && worked.medianMs === null
        && guessed.attempts === 8 && guessed.correct === 0
        && right.medianMs === 40000,
        `guessing fast and working slowly give the same weight to within ${gap.toExponential(0)}, and correct answers still set medianMs`);
    }

    // P3. Desk 02 warm-up was two archetypes, so the spec's cap relaxed to a 50% share for one of them.
    {
      const pool = SESS.inScope({ desk: 2, tier: 'warmup' });
      const cap = Math.max(Math.ceil(0.25 * 20), Math.ceil(20 / pool.length));
      say(pool.length >= 4 && cap / 20 <= 0.26,
        `desk 2 warm-up has ${pool.length} archetypes and a ${Math.round(100 * cap / 20)}% share cap at 20 items`);
    }

    // P4. A detached anchor does not download in Safari, and this is served from a Mac.
    say(/document\.body\.append\(a\);\s*\n\s*a\.click\(\);\s*\n\s*a\.remove\(\);/.test(SRC.store),
      'the CSV download attaches its anchor to the document before clicking it');

    // P5. Classify trains the first ten seconds of an item, and on Desk 02 that judgement is made
    // off a shared table. It was the one mode that never showed one: 20 items, 20 tables.
    {
      const stim = [];
      for (let n = 0; n < 6; n++) {
        const run = SESS.createRun({ desk: 2, mode: 'classify', tier: 'standard', groups: [],
          length: 20, sessionSeed: 7720000 + n * 19, toggles: { ...T, optionOrder: 'shuffled' } });
        stim.push(new Set(run.items.map(i => i.stimulusId).filter(Boolean)).size);
      }
      const rev = SESS.buildItems({ desk: 2, tier: 'standard', groups: [], length: 6,
        sessionSeed: 1, adaptive: true, mode: 'review' });
      say(Math.max(...stim) <= 8 && rev.stimuli === undefined,
        `desk 2 classify reads ${Math.min(...stim)} to ${Math.max(...stim)} shared tables, not one per item, and review still bypasses them`);
    }

    // P7. reviewPlan built an array it only ever read the length of.
    {
      const due = n => Array.from({ length: n }, (_, i) => ({ id: 'x' + i }));
      say(ADAPT.reviewPlan(due(3)).length === 6 && ADAPT.reviewPlan(due(12)).length === 12
        && ADAPT.reviewPlan(due(25)).length === 20 && ADAPT.reviewPlan(due(0)).length === 0,
        'reviewPlan doubles below the threshold and caps at twenty, unchanged after the dead array went');
    }
  }

  // ---------- the interface, asserted for the first time ----------
  //
  // Several rounds of UI features shipped with zero assertions against any of them, and an
  // audit of it found seven defects: a per-item clock that restarted whenever you changed your
  // answer, a session clock that handed back the full duration on a refresh, a full document rebuild
  // on every option click that reset the scroll position and dropped keyboard focus, feedback that
  // taught nothing when you were right, pill counts that could not be reconciled with the scope
  // figure, a spread calculation that divided by a legitimately zero option, and revealed options
  // dropping out of the tab order.
  //
  // The spec forbids adding a dependency, so there is no jsdom. render.js now builds its
  // markup in pure functions that take no DOM, which is what makes these eight checkable.
  {
    const mem = new Map();
    globalThis.localStorage ??= {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => mem.delete(k),
    };
    const T = {
      instantFeedback: true, perItemClock: false, setupBox: true, showSpread: true,
      optionLetters: false, showArchetype: false, backNav: false, sessionClock: false,
      allowSkip: true, blockBlanks: false, adaptive: false, optionOrder: 'ascending', timerWarning: false,
    };
    const mkRun = (over = {}) => SESS.createRun({
      desk: 1, mode: 'practice', tier: 'standard', groups: ['money'], length: 2,
      toggles: { ...T, ...over },
    });

    // 1. The reconciliation the setup screen used to fail. Set algebra, so it holds for every
    //    combination rather than the two that were captured by hand.
    let sumsHold = true, worstDesk = '';
    for (const desk of [1, 2]) {
      for (const tier of ['warmup', 'standard', 'hard']) {
        const perGroup = SESS.groupsForDesk(desk)
          .reduce((n, [g]) => n + SESS.inScope({ desk, tier, groups: [g] }).length, 0);
        if (perGroup !== SESS.inScope({ desk, tier }).length) { sumsHold = false; worstDesk = `desk ${desk} ${tier}`; }
      }
    }
    say(sumsHold, `group pill counts partition every tier on both desks${sumsHold ? '' : ': ' + worstDesk}`);

    // 2. The marker that explains a pill contributing nothing.
    say(/data-empty="true"/.test(R.pill('group', 'averages', 'Averages', true, 0))
      && !/data-empty/.test(R.pill('group', 'money', 'Money', true, 3))
      && !/data-empty/.test(R.pill('length', 10, '10', true)),
      'a zero-count pill is marked empty, a nonzero one and a countless one are not');

    // 3. An empty scope is reachable, which is why the Start guard exists.
    say(SESS.inScope({ desk: 1, tier: 'hard', groups: ['averages'] }).length === 0
      && /data-act="start" \$\{pool\.length \? '' : 'disabled'\}/.test(SRC.render),
      'an empty scope is reachable and Start is disabled on it');

    // 4. FIX A. Choosing repaints the slots and nothing else, which is what holds the scroll
    //    position, the focus ring and the running per-item clock.
    {
      const run = mkRun();
      const before = R.questionHtml(run);
      run.choose(1);
      const after = R.questionHtml(run);
      const head = h => h.split('data-slot="options"')[0];
      const tail = h => h.split('</ul>')[1];
      say(head(before) === head(after) && tail(before) === tail(after)
        && R.optionsHtml(run).includes('aria-pressed="true"'),
        'choosing an option changes the option slot and nothing outside it');
    }

    // 5. The reveal marks exactly one correct option, whatever was picked.
    {
      const run = mkRun();
      const wrong = run.current.options.findIndex(o => o.role !== 'correct');
      run.choose(wrong); run.commit();
      const html = R.optionsHtml(run);
      say((html.match(/class="option correct"/g) ?? []).length === 1
        && (html.match(/chosen-wrong/g) ?? []).length === 1,
        'a revealed option set marks exactly one correct and one chosen-wrong');
    }

    // 6. FIX D. Getting it right used to render only the last workings line, which is "answer = 96".
    {
      const run = mkRun();
      const right = run.current.options.findIndex(o => o.role === 'correct');
      run.choose(right); run.commit();
      const fb = R.feedbackHtml(run);
      const steps = (fb.match(/<li>/g) ?? []).length;
      say(/class="ok">Correct\./.test(fb) && steps === run.current.workings.steps.length && steps > 1,
        `a correct answer shows all ${steps} workings steps, not just the last line`);
    }

    // 7. FIX B. start(fromMs) exists and is now used. An exam left past its duration expires at once
    //    rather than handing time back: a timed session that pauses is not a timed session.
    {
      const c = makeClock({ durationMs: 1000, onTick() {}, onExpire() {} });
      c.start(600); const left = c.remaining(); c.stop();
      let expired = false;
      const c2 = makeClock({ durationMs: 1000, onTick() {}, onExpire() { expired = true; } });
      c2.start(5000); c2.stop();
      say(left >= 380 && left <= 400 && expired
        && elapsedSince(new Date(Date.now() - 90000).toISOString()) >= 89000
        && elapsedSince('not a date') === 0
        && /sessionClock\.start\(elapsedSince/.test(SRC.app),
        'both clocks resume from elapsed time and an over-duration resume expires at once');
    }

    // 8. FIX F. a13 carries a zero-valued "Does not change" option, which the spec exempts from the ratio
    //    guards, and the old spread divided by it.
    {
      const withZero = {
        options: [{ value: -169.5 }, { value: -47.46 }, { value: 0 }, { value: 47.46 }, { value: 135.6 }],
        workings: { steps: [] }, correct: { display: 'x' },
      };
      const fake = {
        current: withZero, cur: { submitted: true, chosenIndex: 2, setupText: '' },
        session: { toggles: T }, items: [1], index: 0, isClassify: false,
      };
      const m = R.feedbackHtml(fake).match(/differ by ([0-9.]+%|n\/a)/);
      say(!!m && m[1] !== 'n/a', `spread reports a figure on an option set containing zero (${m ? m[1] : 'missing'})`);
    }

    // 9. FIX G. Revealed options keep aria-disabled, so they stay in the tab order.
    {
      const run = mkRun();
      run.choose(0); run.commit();
      const html = R.optionsHtml(run);
      say(/aria-disabled="true"/.test(html) && !/ disabled>/.test(html),
        'a revealed option is aria-disabled rather than disabled, so it stays focusable');
    }

    // 10. FIX C. A live session is reachable from the sidebar and its clocks are rebuilt on return.
    say(/export function chrome\(route, live = null\)/.test(SRC.render)
      && /'#session', 'Session in progress'/.test(SRC.render)
      && /resumeClocks\(\); draw\(\);/.test(SRC.app)
      && /if \(!sessionClock\) startSessionClock\(\);/.test(SRC.app),
      'a session in progress appears in the nav and rebuilds its clocks on return');
  }

  // EVERY PREDICATE MUST HAVE A FAILING CASE, or it is not known to fire.
  //
  // checkTable never compared head and body width, so an eight-entity table built from a scenario
  // carrying seven entity names passed 37 preflight tables before a downstream undefined gave it
  // away. makeDataset silently dropped its `note` and the rendered table read "undefined" until a
  // smoke test. Both are the computed-then-not-covered pattern, now six or seven instances deep, and
  // the fix is the same as for the section manifest: assert the property rather than patch the
  // instance. A predicate with no failing case is a comment.
  //
  // This reports coverage rather than demanding 100% today: 76 named predicates is more negative
  // fixtures than one session can write, so the gap is printed and bounded, and the assertion holds
  // the line at the ones already covered.
  {
    const src = readFileSync(new URL('../js/lib/validate.js', import.meta.url), 'utf8');
    const declared = new Set([
      ...[...src.matchAll(/f\.push\('([a-z0-9:\-]+)'\)/g)].map(m => m[1]),
      ...[...src.matchAll(/return \['([a-z0-9:\-]+)'\]/g)].map(m => m[1]),
    ]);
    const fired = new Set(FIRED_PREDICATES);
    const covered = [...declared].filter(d => fired.has(d));
    const gap = [...declared].filter(d => !fired.has(d)).sort();
    console.log(`  predicate coverage: ${covered.length} of ${declared.size} named predicates have a`
      + ` case that fires them in this run`);
    if (gap.length) {
      console.log(`    no failing case: ${gap.slice(0, 6).join(', ')}`
        + (gap.length > 6 ? ` and ${gap.length - 6} more` : ''));
    }
    say(covered.length >= COVERED_FLOOR,
      `predicate coverage holds at or above ${COVERED_FLOOR} (currently ${covered.length})`);
  }

  // The spec's newest non-negotiable: a diagnostic must exercise the code path
  // production uses. b06's rank weighting lived in `buildSolo`, which only generate and generateAll
  // reach, so a real session got none of it and the audit measured the other path and reported the
  // carry-in closed. Only a shared-stimulus archetype can diverge, since a self-contained one is
  // literally the same function call on both paths, so those are what is checked here. The full
  // sweep with figures is test/probes/path-divergence.mjs.
  {
    const shared = archetypes.filter(a => typeof a.build === 'function');
    const worst = [];
    for (const arch of shared) {
      for (const family of (arch.families ?? [])) {
        const slotsFor = (build) => {
          const slots = [0, 0, 0, 0, 0];
          let got = 0;
          for (let s = 0; got < 60 && s < 2400; s++) {
            let b = null;
            try { b = build(4400000 + s); } catch { continue; }
            if (!b) continue;
            const list = Array.isArray(b) ? b : [b];
            if (list.flatMap(checkItem).length) continue;
            for (const it of list) {
              const num = it.options.every(o => typeof o.value === 'number' && Number.isFinite(o.value));
              const order = num ? [...it.options].sort((x, y) => x.value - y.value)
                : [...it.options].sort((x, y) => (x.sortKey ?? 0) - (y.sortKey ?? 0));
              const at = order.findIndex(o => o.role === 'correct');
              if (at >= 0) slots[at]++;
            }
            got++;
          }
          const t = Math.max(1, slots.reduce((a, b2) => a + b2, 0));
          return slots.map(v => 100 * v / t);
        };
        const viaSession = slotsFor(seed => {
          const st = ST.makeStimulus({ family, rng: makeRng(seed) });
          return st ? arch.build({ stimulus: st, rng: makeRng(seed), tier: arch.tiers[0], diag: [] }) : null;
        });
        const viaAudit = slotsFor(seed => typeof arch.generateAll === 'function'
          ? arch.generateAll(makeRng(seed), arch.tiers[0], null, [])
          : arch.generate(makeRng(seed), arch.tiers[0], null, []));
        const gap = Math.max(...viaSession.map((v, i) => Math.abs(v - viaAudit[i])));
        if (gap >= 18) worst.push(`${arch.id}/${family} ${gap.toFixed(0)} points`);
      }
    }
    say(worst.length === 0, 'the session path and the audit path report the same answer position'
      + (worst.length ? ': ' + worst.join(', ') : ` (${shared.length} shared-stimulus archetypes)`));
  }

  // Every family builds, renders, and passes the table invariants including the total-row
  // predicate written earlier and unexercised until now.
  for (const family of D.FAMILIES) {
    let worstTotals = 0, failures = [], nulls = 0, built = 0;
    for (let s = 0; s < 40; s++) {
      // A builder may signal failure with null, which an earlier round made the contract after
      // retailDataset was found falling through with an invalid table. This caller did not check,
      // so civic returning null crashed the preflight rather than reporting a rate.
      const ds = D.buildDataset(family, makeRng(5000 + s));
      if (!ds) { nulls++; continue; }
      built++;
      const t = ST.datasetTable(ds);
      failures = failures.concat(checkTable(t));
      worstTotals = Math.max(worstTotals, (t.totalRows ?? []).length);
    }
    say(built > 0 && nulls <= 8, `${family}: ${built} of 40 seeds build a dataset, ${nulls} signalled null`);
    say(failures.length === 0,
        `${family}: ${built} datasets render tables that pass every invariant`
        + (failures.length ? ': ' + [...new Set(failures)].join(', ') : '')
        + (worstTotals ? ` (${worstTotals} printed totals checked per table)` : ' (no printed totals)'));
  }
  const badTotals = ST.datasetTable(d);
  badTotals.totalRows = [{ cells: [10, 20, 30], total: 61 }];
  say(checkTable(badTotals).includes('table-total-mismatch'),
      'a printed total that does not equal the sum of its parts is rejected');

  // The family support map and each archetype's own declaration have to agree, or the
  // session loop will plan a stimulus that the archetype refuses to fill.
  const mismatch = archetypes.filter(a => a.families)
    .filter(a => JSON.stringify([...a.families].sort()) !== JSON.stringify(ST.familiesFor(a.id).sort()));
  say(mismatch.length === 0,
      `FAMILY_SUPPORT agrees with every archetype's own families declaration`
      + (mismatch.length ? ': ' + mismatch.map(a => a.id).join(', ') : ''));

  // A REJECTION RATE CAN HIDE A ZERO, and it did for a long time.
  //
  // b06 declared 'regional' and accepted 0 of 3,000 forced regional draws. It had never emitted
  // a single regional item since early on, and the decision log recorded it as "rejecting 54.7%",
  // because the rate was computed over pooled attempts where the retail half supplied every
  // acceptance. A rate looks like a tuning problem; a zero is a broken declaration, and the two
  // must not be able to look alike on a table.
  //
  // So this is an assertion rather than a diagnostic. Zero accepted in a forced draw fails the
  // harness. It runs per declared family, which is the only sub-space an archetype names in a
  // form this can enumerate.
  const TRIES = 400;
  const dead = [];
  const solo = (a, rng, forced) =>
    typeof a.buildSolo === 'function' ? a.buildSolo(rng, a.tiers[0], forced, [])
    : typeof a.generate === 'function' ? a.generate(rng, a.tiers[0], forced, [])
    : null;
  for (const a of archetypes.filter(x => x.families)) {
    for (const family of a.families) {
      let ok = 0;
      for (let s = 0; s < TRIES && !ok; s++) {
        if (solo(a, makeRng(770000 + s * 13), { family })) ok++;
      }
      if (!ok) dead.push(`${a.id}/${family}`);
    }
  }
  say(dead.length === 0,
      `every declared family emits at least one item in ${TRIES} forced draws`
      + (dead.length ? `: ${dead.join(', ')} emitted NONE, which is a broken declaration and not a rejection rate` : ''));
}

for (const [id, entry] of Object.entries(fixtures)) {
  if (id.startsWith('_')) continue;
  const arch = archetypes.find(a => a.id === id);
  console.log(`\n${id} fixtures`);
  if (!arch) { console.log('  pending, archetype not registered yet'); continue; }

  // Formula-level fixtures. Where the archetype spec supplies machine-verified arithmetic whose
  // parameters cannot produce five distinct options, the numbers are still worth pinning:
  // they go through the archetype's exported formula() instead of generate(), which is
  // exactly the spec's "pins the arithmetic and nothing else".
  const formulaCases = Array.isArray(entry) ? [] : (entry.formula ?? []);
  const cases = Array.isArray(entry) ? entry : (entry.cases ?? []);
  for (const fc of formulaCases) {
    if (typeof arch.formula !== 'function') { say(false, `${id} exports no formula()`); continue; }
    if (fc.label) console.log(`  formula fixture: ${fc.label}`);
    const got = arch.formula(fc.input);
    for (const [k, want] of Object.entries(fc.expect)) {
      say(same(got[k], want), `formula ${k} = ${got[k]} (expected ${want})`);
    }
  }

  cases.forEach((c, ci) => {
    // Desk 02. The parameters of a shared-stimulus archetype are a dataset, so a Part B fixture
    // injects one and calls build() rather than generate(). Part B supplies no fixtures of its
    // own, unlike every Part A entry, so these pin against regression rather than against an
    // independent source. Recorded in the decision log.
    let item;
    if (c.dataset) {
      const st = ST.makeStimulusFrom(makeDataset(c.dataset), c.stimulusSeed ?? 1);
      const built = arch.build({ stimulus: st, rng: makeRng(1), tier: c.tier, forced: c.forced });
      item = Array.isArray(built) ? built[c.which ?? 0] : built;
    } else {
      item = arch.generate(makeRng(1), c.tier, c.forced);
    }
    if (!item) { say(false, `${id}[${ci}] generate returned null on fixture parameters`); return; }
    for (const [k, want] of Object.entries(c.expect.values ?? {})) {
      say(same(item.values[k], want), `${k} = ${item.values[k]} (expected ${want})`);
    }
    say(same(item.correct.value, c.expect.answer.value), `answer value ${item.correct.value} (expected ${c.expect.answer.value})`);
    say(item.correct.display === c.expect.answer.display, `answer display "${item.correct.display}" (expected "${c.expect.answer.display}")`);

    // Table body, cell for cell, where the fixture pins one.
    if (c.expect.table) {
      const body = item.stimulus?.table?.body ?? [];
      say(JSON.stringify(body) === JSON.stringify(c.expect.table),
          `table body matches` + (JSON.stringify(body) === JSON.stringify(c.expect.table) ? ''
            : `\n        got  ${JSON.stringify(body)}\n        want ${JSON.stringify(c.expect.table)}`));
    }

    // Chart geometry, where the fixture pins one. The reading rule is part of the item's
    // correctness, not presentation: a bar off the grid is an unanswerable question.
    if (c.expect.chart) {
      const ch = item.stimulus?.chart ?? {};
      for (const [k, want] of Object.entries(c.expect.chart)) {
        const got = k === 'groupTotals'
          ? (ch.groups ?? []).map(g => g.values.reduce((a, b) => a + b, 0))
          : k === 'barValues' ? (ch.bars ?? []).map(b => b.value)
          : k === 'segmentValues' ? (ch.pies ? ch.pies.map(x => x.segments.map(s => s.value)) : (ch.segments ?? []).map(s => s.value))
          : k === 'totals' ? (ch.pies ?? []).map(x => x.total)
          : ch[k];
        const eq = JSON.stringify(got) === JSON.stringify(want);
        say(eq, `chart ${k} ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
      }
    }

    // The spec: "Injecting parameters pins the arithmetic and nothing else, which
    // is the only thing the fixture is testing." Where the archetype spec supplies verified
    // arithmetic but its parameters cannot produce five distinct options (a06, a12, a14,
    // all label types), the fixture omits `options` and pins the derived series instead.
    if (c.expect.options) {
      const got = [...item.options].sort((a, b) => cmp(a.value, b.value));
      const want = [...c.expect.options].sort((a, b) => cmp(a.value, b.value));
      say(got.length === want.length, `${got.length} options`);
      want.forEach((w, i) => {
        const g = got[i] ?? {};
        const ok = same(g.value, w.value) && g.display === w.display && g.role === w.role
                && (g.errorType ?? null) === w.errorType;
        say(ok, `option ${w.display} [${w.role}/${w.errorType}] ` + (ok ? '' : `got ${g.display} [${g.role}/${g.errorType}]`));
      });
    } else {
      say(item.options.length === 5, `5 options built (arithmetic-only fixture, option set not pinned)`);
    }

    const failures = checkItem(item);
    say(failures.length === 0, `item passes every invariant${failures.length ? ': ' + failures.join(', ') : ''}`);
  });
}


// ---------------------------------------------------------------------------
// Tranche A and B assertions.
// ---------------------------------------------------------------------------

console.log('\nrepo hygiene');
{
  const gi = readFileSync(join(here, '..', '.gitignore'), 'utf8');
  say(/(^|\n)\.DS_Store\b/.test(gi) && gi.includes('__MACOSX'),
    '.gitignore covers .DS_Store and __MACOSX');
  // Exported practice history is personal and must not reach the repository. Asserted
  // because it is the kind of thing a later "tidy the gitignore" edit reverses without
  // any visible symptom, and the symptom here is publishing your own performance data.
  say(/^\s*logs\/\*\.csv\s*$/m.test(gi), '.gitignore excludes exported practice history');
}

console.log('\nmeasured precision from option geometry');
{
  // The a01 fixture set. 96 and 97 collapse at one significant figure (both 100) and separate
  // at two, so the item requires two and estimation cannot resolve it. This is the assertion
  // that stops the precision statement drifting if sigFig is ever "simplified".
  say(PREC.requiredFigures([67, 82, 96, 97, 121], 96) === 2, 'a01 option set requires 2 sig figs');
  say(PREC.requiredFigures([61.44, 192, 153.6, 300, 1280], 61.44) === 1,
    'a widely spread set resolves at 1 sig fig');
  say(PREC.requiredFigures([10, 10.0000000001, 50, 70, 90], 10) === null,
    'a degenerate pair returns null rather than a false separation');
  say(PREC.sigFig(0, 2) === 0 && PREC.sigFig(96.5193, 2) === 97 && PREC.sigFig(0.0234, 2) === 0.023,
    'sigFig is guarded at zero and correct across magnitudes');
  // Three regimes, three sentences, and the boundary is what the feedback screen keys on.
  const stmt = vals => PREC.precisionStatement({ options: vals.map(v => ({ value: v })), correct: { value: vals[0] } });
  say(stmt([61.44, 192, 153.6, 300, 1280]).startsWith('One significant figure'), '1sf statement fires');
  say(stmt([96, 67, 82, 97, 121]).startsWith('Two significant figures'), '2sf statement fires');
  say(stmt([100, 100.4, 250, 700, 900]).startsWith('This turns on the last digit'),
    'precision-item statement fires where nothing separates at two figures');
}

console.log('\nthe three scanner diagnostics');
{
  // These assert the DIAGNOSTIC, not the archetypes. d03 and a01 are known exploits and are
  // repaired in tranche D; if the harness ever stops seeing them the repair cannot be verified,
  // which is the failure this block exists to prevent. Run at n=40 for speed; the figures are
  // stable because both exploits are structural rather than distributional.
  const AUD = join(here, '..', 'audit', 'build.js');
  say(readFileSync(AUD, 'utf8').includes("'ADJACENT VALUE PAIRS': () => NUMERIC_IN_SCOPE"),
    'ADJACENT VALUE PAIRS is registered in the section manifest');
  say(readFileSync(AUD, 'utf8').includes("'POOLED ANSWER POSITION ACROSS THE LIBRARY': () => NUMERIC_IN_SCOPE"),
    'POOLED ANSWER POSITION is registered in the section manifest');
  say(readFileSync(AUD, 'utf8').includes("'ESTIMATION RESOLVABILITY': () => NUMERIC_IN_SCOPE"),
    'ESTIMATION RESOLVABILITY is registered in the section manifest');
  // The pooled section's rows are pools rather than archetype ids, so the manifest's row
  // detector needed a pattern for them. Without it the section printed a full table and was
  // credited zero rows, which is the exact failure the manifest was built to catch.
  say(/\^\\s\{2,\}\(all\|desk/.test(readFileSync(AUD, 'utf8')),
    'the manifest row detector recognises pooled rows, not just archetype ids');
}


console.log('\nthe estimation route on the feedback screen');
{
  // The route must land on the CORRECT option or it teaches the wrong method, so this asserts the
  // property rather than the presence. Measured at n=200 by test/probes/estimation-route-hit-rate.mjs; asserted here
  // at n=30 per archetype to keep the suite fast, which is enough because a route that drifts fails
  // on the first few items rather than the last.
  const withRoute = SESS.allArchetypes.filter(a => typeof a.estimate === 'function');
  say(withRoute.length >= 13, `${withRoute.length} archetypes export an estimation route`);
  for (const arch of withRoute) {
    let n = 0, hit = 0, seed = 8814092, att = 0;
    while (n < 30 && att < 30 * 400) {
      att++;
      let b = null;
      try { b = arch.generate(makeRng(seed++), arch.tiers[0], null, []); } catch { continue; }
      if (!b || _checkItem(b).length) continue;
      n++;
      const r = PREC.estimationRoute(b, arch);
      if (r && r.correct) hit++;
    }
    say(hit === n, `${arch.id} estimation route lands on the answer ${hit}/${n}`);
  }
  // ROUNDING RULE, measured earlier and worth an assertion because it is counter-intuitive.
  // "Resolvable at one significant figure" is a property of the ANSWER separating from the
  // distractors. It does NOT license rounding the INPUTS to one figure: on a multi-factor product
  // the input error compounds past the option gap. a15 measured 33% at one-figure inputs and 100%
  // at two. Every route therefore rounds inputs to two figures.
  const src = readFileSync(join(here, '..', 'js', 'archetypes', 'a15-markup-overhead.js'), 'utf8');
  say(src.includes('sig2(') && !src.includes('sig1('),
    'a15 rounds estimation inputs to two significant figures, not one');
  // SECOND ROUNDING RULE, an earlier round checkpoint 5: round only the factors that DIFFER between the
  // answer and its distractors. c01's caption total and a16's two prices are COMMON factors, so
  // rounding them scaled the answer and its nearest distractor together, adding error without adding
  // discrimination. Measured: c01 landed on the neighbouring wedge in 5 of 200 items and a16 on a
  // pairwise gap in 1 of 120 before the common factor was left exact. Asserted because the next
  // reader's instinct will be to "make c01 consistent" by rounding it.
  for (const [file, why] of [['c01-pie-absolute.js', 'caption total'], ['a16-max-minus-min.js', 'prices']]) {
    const t = readFileSync(join(here, '..', 'js', 'archetypes', file), 'utf8');
    const est = t.slice(t.indexOf('estimate('), t.indexOf('generate('));
    say(!est.includes('sig2('), `${file.slice(0, 3)} leaves its common factor (${why}) unrounded`);
  }
  // The estimate contract receives `values` as well as `params`, because a Desk 02 draw carries
  // INDICES. b04 computed from column numbers and landed on the answer in 17% of items before this.
  const prec = readFileSync(join(here, '..', 'js', 'lib', 'precision.js'), 'utf8');
  say(prec.includes('archetype.estimate(item.params, item.values ?? {})'),
    'the estimate contract passes values as well as params');
}

console.log('\nfeedback renders the route above the exact chain');
{
  // Through the pure string builder. The ORDER is the assertion: the route has to
  // precede the working block, because the whole change is that the exact chain becomes
  // verification rather than method.
  const arch = SESS.allArchetypes.find(a => a.id === 'a13');
  let item = null, seed = 8814092;
  while (!item) { const b = arch.generate(makeRng(seed++), 'standard', null, []); if (b && !_checkItem(b).length) item = b; }
  const run = {
    current: item, currentName: arch.name, isClassify: false,
    cur: { submitted: true, chosenIndex: item.options.findIndex(o => o.role === 'correct') },
    session: { toggles: { instantFeedback: true, setupBox: true, showSpread: false } },
    index: 0, items: [item],
  };
  const html = R.feedbackHtml(run);
  say(html.includes('estimate-label') && html.includes('Estimate first'), 'the route renders');
  say(html.indexOf('class="estimate"') < html.indexOf('class="working"'),
    'the route is rendered ABOVE the exact chain');
  say(html.includes('class="precision"'), 'the precision statement renders');
  // a13 resolves at one significant figure, so its chain is collapsed even with setupBox on.
  say(!/details class="working" open/.test(html),
    'a one-figure item collapses the exact chain even when setupBox is on');
  say(html.includes('lands on'), 'the route states which option the estimate lands on');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
