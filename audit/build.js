// node audit/build.js [--n 200] [--seed 8814092] [--only a01]
//
// Generates N items per archetype, runs every check, reports the failure rate per
// named constraint, and writes audit/audit.html. Also prints a text summary and
// one full item block so the run can be read from a terminal.
//
// The HTML question text is read against the formula in plain English. That catches
// the one class of defect a machine cannot: a stem that says "percentage
// points" where the formula computes percent, or wording that admits two
// readings. Roughly four minutes per archetype.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeRng } from '../js/lib/rng.js';
import { checkItem } from '../js/lib/validate.js';
import { tableText, tableHtml } from '../js/lib/table.js';
import { chartText, chartSvg } from '../js/lib/chart.js';
import { CATEGORICAL_TYPES } from '../js/lib/format.js';
import { requiredFigures } from '../js/lib/precision.js';
import { archetypes } from '../js/archetypes/index.js';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : fallback;
};
// SECTION MANIFEST. An earlier round.
//
// Five separate times now a diagnostic has been computed and then not shown: An earlier round's missing
// rankLeak branch, an earlier round's algebra block nested inside `if (withCorr.length)`, the correlation
// severity firing on concentration while a14's exposure sat in the hit rate, and the formatting
// tells section suppressing itself when clean. Each was fixed individually, which guarantees a
// sixth. So the property is asserted instead: every applicable section must emit at least one data
// row or an explicit clean line, and a silent section FAILS the run rather than printing nothing.
const EMITTED = [];
const rawLog = console.log;
console.log = (...a) => { EMITTED.push(...a.map(String).join(' ').split('\n')); rawLog(...a); };

// A section is anything printed as a bare capitalised heading. A data row is an archetype id at
// the start of a line, a per-column rank line, a sampled item, or an explicit clean statement.
const REQUIRED_SECTIONS = [
  'CONSTRAINT FAILURE RATES',
  'ANSWER POSITION IN THE OPTION SET',
  'POSITION AS A HIT RATE',
  'SAMPLE ITEMS',
];
// APPLICABILITY IS NOT THE SAME AS SILENCE, and the first run of the manifest failed on that.
// A label archetype has no numeric option values, so the three numeric sections have nothing to
// say about it, and a --only d13 run was reported as a defect. These are required exactly when
// something in scope can produce them, which is the property that makes the assertion meaningful
// rather than merely noisy.
const CONDITIONAL_SECTIONS = {
  'ANSWER RECOVERABLE FROM THE OTHER OPTIONS': () => NUMERIC_IN_SCOPE,
  'ANSWER RECOVERABLE WITH THE STEM AS WELL': () => NUMERIC_IN_SCOPE,
  'FORMATTING TELLS': () => NUMERIC_IN_SCOPE,
  // All three are numeric-only. ADJACENT VALUE PAIRS needs an integer-valued set to
  // report a row, but it prints an explicit clean line otherwise, which is what the manifest
  // counts, so NUMERIC_IN_SCOPE is the right predicate rather than a narrower integer one.
  'ADJACENT VALUE PAIRS': () => NUMERIC_IN_SCOPE,
  'POOLED ANSWER POSITION ACROSS THE LIBRARY': () => NUMERIC_IN_SCOPE,
  'ESTIMATION RESOLVABILITY': () => NUMERIC_IN_SCOPE,
  'ANSWER AGAINST EACH VISIBLE INPUT COLUMN': () => LABEL_IN_SCOPE,
};
let NUMERIC_IN_SCOPE = false, LABEL_IN_SCOPE = false;
const OPTIONAL_SECTIONS = Object.keys(CONDITIONAL_SECTIONS);

function checkManifest() {
  // Only a known section name opens a section. Testing "looks like a heading" first put every
  // sampled item's ARCHETYPE line in its own phantom section and credited the SAMPLE block zero.
  const ALL = [...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS];
  const isRow = l => /^\s{2,}[a-d]\d{2}\b/.test(l) || /^ARCHETYPE [a-d]\d{2}/.test(l)
    || /nothing above the reporting floor/.test(l) || /^\s+(rank|row counts|\d+ segments)/.test(l)
    || /^\s{4,}[A-Za-z].*\brank\b/.test(l)
    // The pooled section's rows are POOLS, not archetype ids, so none of the patterns
    // above can see them and the section would have counted zero rows while printing a full table.
    // The estimation section's weighted library line is likewise a data row without an id.
    || /^\s{2,}(all|desk \d)\b/.test(l)
    || /^\s{2,}library, weighted by item/.test(l)
    || /^\s{2,}nothing at or above/.test(l);
  const found = new Map();
  let current = null;
  for (const line of EMITTED) {
    const name = ALL.find(n => line.startsWith(n));
    if (name) { current = name; if (!found.has(current)) found.set(current, 0); continue; }
    if (current && isRow(line)) found.set(current, found.get(current) + 1);
  }
  const failures = [];
  const due = [...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS.filter(n => CONDITIONAL_SECTIONS[n]())];
  for (const name of due) {
    if (!found.has(name)) failures.push(`${name}: applicable but never printed`);
    else if (found.get(name) === 0) failures.push(`${name}: heading printed with no data row and no clean line`);
  }
  rawLog('\nSECTION MANIFEST');
  for (const name of REQUIRED_SECTIONS) {
    rawLog(`  ${found.has(name) ? String(found.get(name)).padStart(4) : '   -'}  rows   ${name}`);
  }
  for (const name of OPTIONAL_SECTIONS) {
    const dueNow = CONDITIONAL_SECTIONS[name]();
    rawLog(`  ${found.has(name) ? String(found.get(name)).padStart(4) : (dueNow ? '   -' : ' n/a')}  rows   ${name}`
      + (dueNow ? '' : '  (nothing in scope can produce it)'));
  }
  if (failures.length) {
    rawLog('\n  MANIFEST FAILED');
    failures.forEach(f => rawLog('    ' + f));
    process.exitCode = 1;
  } else {
    rawLog(`\n  all ${due.length} applicable sections emitted output`);
  }
}

const N        = Number(arg('n', 200));
const BASE     = Number(arg('seed', 8814092));
const ONLY     = arg('only', null);
const SAMPLES  = 10;

// The ten items on the audit page were `items.slice(0, SAMPLES)`, the first ten in generation
// order. Because generation is seeded those are the SAME ten on every run, so the human read
// looked at one fixed window and could neither corroborate nor contradict the distribution tables
// above it. It produced a false positive on a10: across its first ten the winner never sat at
// height rank 3, which reads as a structural exclusion and would have justified widening the
// height range, while over 200 items rank 3 carries 34%. A stratified spread is still fully
// deterministic and is representative.
const spread = (items, k) => {
  if (items.length <= k) return items;
  const step = items.length / k;
  return Array.from({ length: k }, (_, i) => items[Math.floor(i * step)]);
};

const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

function harvest(arch, n, baseSeed) {
  const items = [];
  const rejections = new Map();
  const leaks = new Map();          // items that passed generate but failed validate
  let attempts = 0, accepted = 0, seed = baseSeed;

  while (items.length < n && attempts < n * 400) {
    attempts++;
    const rng = makeRng(seed++);
    const diag = [];
    let batch = null;
    try {
      // A pair-emitting archetype hands over both halves, so the two nearly-identical stems land
      // next to each other in the sample. b06 and b07 both mandate a matched pair, and until this
      // existed the page showed 200 copies of the first half and none of the second.
      batch = typeof arch.generateAll === 'function'
        ? arch.generateAll(rng, arch.tiers[0], null, diag)
        : arch.generate(rng, arch.tiers[0], null, diag);
    } catch (e) {
      diag.push('threw:' + (e.failures ? e.failures.join('/') : e.message));
    }
    if (!batch) {
      (diag.length ? diag : ['unnamed-rejection']).forEach(name => bump(rejections, name));
      continue;
    }
    const list = Array.isArray(batch) ? batch : [batch];
    const failures = list.flatMap(checkItem);
    if (failures.length) {
      failures.forEach(name => bump(leaks, name));
      continue;
    }
    items.push(...list);
    accepted++;
  }
  return { items, rejections, leaks, attempts, accepted };
}

// Position and near-cover diagnostics.
//
// Position matters because an archetype whose errors are all monotone in one
// direction pins the answer to a subset of the five slots. a01 is the worked
// example: no-discount < partial-discount < answer < round-up by construction,
// round-up is answer+1, and the filler is an integer, so nothing can sit between
// them. The filler therefore either clears round-up, putting the answer third, or
// falls below it, putting the answer fourth. Slots 1, 2 and 5 are unreachable.
// With ordering ascending five times in six, a candidate who notices that has
// turned a five-way choice into a two-way one. No single-item inspection finds
// this, so it is counted on every run.
function diagnose(items) {
  const slots = [0, 0, 0, 0, 0];
  const nearest = [];
  // Categorical answer types have no magnitude order, so "which slot" means the position
  // in the emitted option list, which is what the candidate reads before the session
  // applies optionOrder. Near cover is a magnitude idea and does not apply to them.
  const categorical = items.length ? CATEGORICAL_TYPES.has(items[0].answerType) : false;
  for (const it of items) {
    if (categorical) {
      slots[it.options.findIndex(o => o.role === 'correct')]++;
      continue;
    }
    const vals = it.options.map(o => o.value);
    if (!vals.every(v => typeof v === 'number')) continue;
    const sorted = [...vals].sort((a, b) => a - b);
    const answer = it.correct.value;
    slots[sorted.findIndex(v => Math.abs(v - answer) < 1e-9)]++;
    const others = vals.filter(v => Math.abs(v - answer) > 1e-9);
    if (others.length && Math.abs(answer) > 1e-9) {
      nearest.push(Math.min(...others.map(v => Math.max(Math.abs(v / answer), Math.abs(answer / v)))));
    }
  }
  nearest.sort((a, b) => a - b);
  const q = p => nearest.length ? nearest[Math.min(nearest.length - 1, Math.floor(p * nearest.length))] : NaN;
  // A trailing verdict option ("All would cost the same", "Cannot Say") is pinned to the
  // last slot on purpose, by convention for verdict answers. That makes 4 of 5 slots the
  // correct answer for such an archetype, not a leak, and the flag should not cry wolf on
  // every run.
  const pinnedLast = categorical && items.length > 0
    && items.every(it => it.options.at(-1).role === 'filler' || it.options.at(-1).kind === 'verdict');

  // Any archetype carrying a fixed catch-all option ("All would cost the same",
  // "Cannot Say") must have that option be correct sometimes. Otherwise 200 reps teach the
  // reflex to discard it, and that reflex transfers wrongly to b05, where the item
  // has "Cannot Say" live. Reported on every run against the declared target.
  const withCatchAll = items.filter(it => it.options.some(o => o.kind === 'verdict'));
  const catchAllCorrect = withCatchAll.filter(it =>
    it.options.some(o => o.kind === 'verdict' && o.role === 'correct')).length;
  return {
    categorical,
    pinnedLast,
    hasCatchAll: withCatchAll.length > 0,
    catchAllRate: withCatchAll.length ? catchAllCorrect / withCatchAll.length : null,
    slots,
    support: slots.filter(n => n > 0).length,
    // A pinned trailing verdict makes 4 of 5 the ceiling, unless that verdict is
    // sometimes correct, in which case all five slots are reachable again.
    expectedSupport: (pinnedLast && catchAllCorrect === 0) ? 4 : 5,
    topShare: Math.max(...slots) / Math.max(1, slots.reduce((a, b) => a + b, 0)),
    nearestMedian: q(0.5), nearestWorst: nearest.at(-1) ?? NaN,
  };
}

// Per-variant split.
//
// Pooling the diagnostics over a matched pair measures a population no candidate ever faces.
// b06's argmax half puts the answer at rank 4 of 5 on units sold in 74% of items and its argmin
// half at rank 2 in 76%; pooled those average to 40/38 and report as "concentrated", and the
// EXTREME LEAK on price in the argmin half disappears entirely. b02 and b03 reach all five
// sorted slots pooled and only three in each half.
//
// The test is whether the discriminator is VISIBLE, in the stem or in the stimulus, before any
// arithmetic. Where it is, the candidate always knows which half they are in and each half is
// the real unit of analysis. Where it is not, splitting would cry wolf: a12's tie and winner
// items share a stem and you cannot see a four-way tie without adding four columns, so its tie
// half reporting 100% in slot 5 is not a shortcut. Hidden splits are printed for information
// and carry no severity flag.
//
// Declared per module as `variants: { key, visible }`, key naming a field of item.params.
function variantGroups(arch, items) {
  const key = arch.variants?.key;
  const out = [{ label: 'pooled', items, visible: true, pooled: true }];
  if (!key) return out;
  const seen = [...new Set(items.map(it => String(it.params?.[key] ?? 'none')))].sort();
  if (seen.length < 2) return out;
  for (const v of seen) {
    out.push({ label: v, items: items.filter(it => String(it.params?.[key] ?? 'none') === v),
               visible: arch.variants.visible !== false, pooled: false });
  }
  return out;
}

// OPTION-SET ALGEBRA, a standing check since early on.
//
// Two questions, and the second is the sharper one.
//
// NARROWING: is the answer expressible as a signed combination of the other options? Where it is, the
// method surfaces a set containing it, and guessing inside that set beats chance. Strict uniqueness
// never occurs in this library, so nothing is solved outright by this route, but a16 and a04 sit at
// 1.67x and a future archetype narrowing to TWO would be a different thing.
//
// DIRECTION: does a relation have a fixed direction, so that the candidate learns which ROLE the
// answer occupies rather than guessing inside the set? This is what set size hides. a05's halved-day
// distractor was exactly 2.000x the answer at every allowed day length, because halving revenue
// doubles payback, so the answer was always the smaller member of a 2:1 pair. At twelve hours the
// 24-hour option landed at exactly 0.500x and completed a 1:2:4 triple with the answer in the middle.
// Two rules covered every item with no chart and no stem, and the narrowing figure alone reported it
// as a coin flip.
//
// Both are reported against the same bands used elsewhere: 1.6x chance is concentrated, 2.4x a leak.
const ALGEBRAIC_TYPES = new Set(['number', 'currency', 'percentage', 'countWithUnit', 'fraction', 'ratio', 'signedDirection']);
const closeTo = (a, b) => Math.abs(a - b) < Math.max(1e-9, Math.abs(b) * 1e-9);

function expressibleSet(vals) {
  const out = [];
  for (let t = 0; t < vals.length; t++) {
    const A = vals[t], D = vals.filter((_, i) => i !== t);
    let found = false;
    for (let i = 0; i < D.length && !found; i++) {
      if (closeTo(D[i] * 2, A) || closeTo(D[i] / 2, A)) found = true;
      for (let j = i + 1; j < D.length && !found; j++) {
        if (closeTo(D[i] + D[j], A) || closeTo(D[i] - D[j], A) || closeTo(D[j] - D[i], A)) found = true;
        for (let k = j + 1; k < D.length && !found; k++) {
          for (const s of [[1,1,1],[1,1,-1],[1,-1,1],[-1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]) {
            if (closeTo(s[0]*D[i] + s[1]*D[j] + s[2]*D[k], A)) { found = true; break; }
          }
        }
      }
    }
    if (found) out.push(t);
  }
  return out;
}

const DIRECTIONAL = {
  '2:1 pair, smaller': vals => {
    const p = [];
    for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals.length; j++)
      if (i !== j && closeTo(vals[i], 2 * vals[j])) p.push([vals[j], vals[i]]);
    return p.length === 1 ? p[0][0] : null;
  },
  '2:1 pair, larger': vals => {
    const p = [];
    for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals.length; j++)
      if (i !== j && closeTo(vals[i], 2 * vals[j])) p.push([vals[j], vals[i]]);
    return p.length === 1 ? p[0][1] : null;
  },
  '1:2:4 triple, middle': vals => {
    const h = [];
    for (const a of vals) for (const b of vals) for (const c of vals)
      if (closeTo(b, 2 * a) && closeTo(c, 2 * b)) h.push(b);
    return new Set(h.map(v => v.toFixed(6))).size === 1 ? h[0] : null;
  },
};

function optionAlgebra(items) {
  const usable = items.filter(it => ALGEBRAIC_TYPES.has(it.answerType)
    && it.options.every(o => typeof o.value === 'number' && Number.isFinite(o.value)));
  if (!usable.length) return null;
  let hitSum = 0, inSet = 0, worst = Infinity;
  const attacks = Object.fromEntries(Object.keys(DIRECTIONAL).map(k => [k, 0]));
  for (const it of usable) {
    const vals = it.options.map(o => o.value);
    const ci = it.options.findIndex(o => o.role === 'correct');
    const e = expressibleSet(vals);
    if (e.includes(ci)) { inSet++; hitSum += 1 / e.length; worst = Math.min(worst, e.length); }
    else hitSum += 0.2;
    for (const [name, fn] of Object.entries(DIRECTIONAL)) {
      const g = fn(vals);
      if (g !== null && closeTo(g, it.correct.value)) attacks[name]++;
    }
  }
  const n = usable.length;
  const best = Object.entries(attacks).sort((a, b) => b[1] - a[1])[0];
  return {
    n, inSetRate: inSet / n, narrowHit: hitSum / n, narrowMult: (hitSum / n) / 0.2,
    smallestSet: Number.isFinite(worst) ? worst : null,
    bestAttack: best[0], bestAttackRate: best[1] / n, bestAttackMult: (best[1] / n) / 0.2,
  };
}

// POOLED CROSS-LIBRARY POSITION. An earlier round.
//
// Diagnostic 1 in 9.5 reports position PER ARCHETYPE and the library reads acceptably on it after
// six sessions of local repairs. The pool is a different object and nobody had computed it. It is
// also the one a candidate actually meets, because every session mixes archetypes: the per-archetype
// tables say a01 is confined to slots 3 and 4 and d07 to slot 4, and neither says what happens when
// eighteen such archetypes are drawn into one paper.
//
// Measured: 7.2 / 31.4 / 32.9 / 24.5 / 3.9. Slots 1 and 5 together carry 11.1% against the 40% an
// even distribution would give, so "never pick the largest or the smallest option" removes two of
// five for free and is right nine times in ten. Best single slot is 1.65x chance.
//
// WHY IT READS ON SCREEN. Under 6.2 Desk 01 Exam is `realistic`, ascending 83% of the time, and Desk
// 02 Exam is ascending outright. Both are correct reproductions of the observed papers. The
// consequence is that sorted position equals displayed position most of the time, so this is not
// buried in value space: it reads as "the answer is never A and never E".
//
// THE CAUSE IS THE DESIGN, WHICH IS WHY THERE IS NO LOCAL FIX. The spec requires every distractor to
// be a named wrong procedure applied to the correct expression, and such procedures straddle the
// answer, so the answer gravitates to the middle of its own set. The spec is right and should not be
// abandoned to flatten this table.
//
// AND THE SESSION-LEVEL FIX DOES NOT WORK, measured earlier rather than assumed. Preferring a
// regenerated item whose answer is extreme can only sample what an archetype is capable of producing,
// and 25 of 38 numeric archetypes never produce an extreme-slot item at all: see
// test/probes/s7slotreach.mjs. Forcing the 13 that can to 100% extreme caps Desk 01's pooled extreme
// share at 9/31, about 29% against the 40% wanted, while taking a19 from 50/9/35/7/0 to roughly 100%
// slot 1, which this harness's own bands call an EXTREME LEAK. That trades one 1.65x pooled shortcut
// for four 5.00x per-archetype pins, which is the relocation failure already recorded at a12's
// training hours and c02's later shares. Note in particular that d07, which the archetype spec offers as the
// case session-level balancing would resolve, measures 0% extreme-reachable and cannot be moved by it.
//
// The practical mitigation is the spec's existing one: Tempo and Classify default to `shuffled`, where the
// whole modal share collapses to chance. Exam stays authentic because Exam is a measurement of a
// specific paper.
function pooledPosition(rows) {
  const slots = [0, 0, 0, 0, 0];
  let n = 0;
  for (const { items } of rows) {
    for (const it of items) {
      if (!ALGEBRAIC_TYPES.has(it.answerType)) continue;
      const vals = it.options.map(o => o.value);
      if (!vals.every(v => typeof v === 'number' && Number.isFinite(v))) continue;
      const idx = [...vals].sort((a, b) => a - b).indexOf(it.correct.value);
      if (idx < 0) continue;
      slots[idx]++; n++;
    }
  }
  if (!n) return null;
  const share = slots.map(c => c / n);
  const best = Math.max(...share);
  return {
    n, share, best, mult: best / 0.2,
    bestSlot: share.indexOf(best) + 1,
    extremes: share[0] + share[4],
  };
}

// ADJACENT VALUE PAIRS. An earlier round, and the harness had no notion of this class at all.
//
// Every check above models the candidate as COMPUTING. This one models the candidate as SCANNING,
// which is what a tired person under a clock actually does, and it is why two 100% exploits survived
// six sessions of auditing that was otherwise unusually thorough. The rule needs no stem, no
// stimulus and no arithmetic: find the two option values one unit apart, take the lower.
//
// d03 measures 100% and a01 98%. Both are structural rather than accidental. a01's answer is
// floor(quotient) and its round-up distractor is therefore answer + 1; d03's answer is a ceiling and
// its round-down distractor is answer - 1. In each case the remaining three options are separated by
// procedures that move the value by much more than one unit, so the off-by-one pair is unique in the
// set and the answer is always on the same side of it.
//
// THE THREE-RUN COLUMN exists because an earlier round measured the obvious fix and found it worse. Adding
// a second adjacent pair takes the scanner to 50%, but if the two pairs SHARE a value the set holds
// a run of three consecutive integers, the answer sits in the middle of it, and "take the middle of
// the run" returns to 100%. So a repair has to be checked against both rules, not one.
//
// Only integer-valued option sets can carry the class, so a currency set at two decimals is exempt
// by construction rather than by judgement.
function adjacentPairs(items) {
  const usable = items.filter(it => ALGEBRAIC_TYPES.has(it.answerType)
    && it.options.every(o => typeof o.value === 'number' && Number.isFinite(o.value)
      && Number.isInteger(o.value)));
  if (!usable.length) return null;
  let unique = 0, any = 0, answerIn = 0, hiN = 0, loN = 0, midRun = 0, noPair = 0;
  let hiPairLo = 0, hiPairHi = 0, loPairLo = 0, loPairHi = 0;
  for (const it of usable) {
    const vals = it.options.map(o => o.value);
    const a = it.correct.value;
    const pairs = [];
    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        if (Math.abs(vals[i] - vals[j]) === 1) pairs.push([vals[i], vals[j]]);
      }
    }
    if (pairs.length) any++; else noPair++;
    if (pairs.length === 1) {
      unique++;
      const [p, q] = pairs[0];
      if (p === a || q === a) { answerIn++; if (a === Math.max(p, q)) hiN++; else loN++; }
    }
    // The ordering rules, which apply however many pairs the set carries. `pairs` is built in
    // ascending order of its first member, so the last entry is the highest pair.
    if (pairs.length) {
      const hp = pairs[pairs.length - 1], lp = pairs[0];
      if (a === Math.min(...hp)) hiPairLo++;
      if (a === Math.max(...hp)) hiPairHi++;
      if (a === Math.min(...lp)) loPairLo++;
      if (a === Math.max(...lp)) loPairHi++;
    }
    // A run of three consecutive integers anywhere in the set, with the answer in the middle.
    const sorted = [...new Set(vals)].sort((x, y) => x - y);
    for (let i = 0; i + 2 < sorted.length; i++) {
      if (sorted[i + 1] === sorted[i] + 1 && sorted[i + 2] === sorted[i] + 1 + 1
        && a === sorted[i + 1]) { midRun++; break; }
    }
  }
  const n = usable.length;
  // Expected hit rate for a scanner committed to one rule. Where no adjacent pair exists the rule
  // gives no guidance and the scanner guesses, which is the 0.2 term; where a pair exists but the
  // rule points at the wrong member the scanner is simply wrong, which contributes nothing. Same
  // convention as the narrowing figure above, so the two are comparable.
  const rate = matched => (matched + 0.2 * noPair) / n;
  // D1. THE ORDERING RULES ARE PART OF THE BATTERY, and leaving them out would have made
  // this diagnostic certify a repair that does not work. The proposed fix for a01 and d03 was a
  // SECOND adjacent pair, on the arithmetic that a scanner then has to guess between two pairs and
  // scores 50%. Measured, it scores 100%: in both archetypes at most one derived option ever sits
  // above the answer, so the answer's own pair is always the EXTREME pair and "take the lower member
  // of the highest pair" names it outright. A battery that scored only the unique-pair rules would
  // have reported the repaired archetype as clean. Same shape as b02, where sampling both
  // perturbation directions was signed off as removing a leak and had hidden it.
  const rules = [
    { name: 'unique pair, take lower',  hit: rate(loN) },
    { name: 'unique pair, take higher', hit: rate(hiN) },
    { name: 'middle of a run of three', hit: rate(midRun) },
    { name: 'highest pair, take lower',  hit: rate(hiPairLo) },
    { name: 'highest pair, take higher', hit: rate(hiPairHi) },
    { name: 'lowest pair, take lower',   hit: rate(loPairLo) },
    { name: 'lowest pair, take higher',  hit: rate(loPairHi) },
  ].sort((x, y) => y.hit - x.hit);
  const best = rules[0];
  return {
    n, anyRate: any / n, uniqueRate: unique / n,
    answerInRate: unique ? answerIn / unique : 0,
    side: hiN === loN ? 'even' : (hiN > loN ? 'higher' : 'lower'),
    midRunRate: midRun / n,
    bestRule: best.name, bestHit: best.hit, bestMult: best.hit / 0.2,
  };
}

// ESTIMATION RESOLVABILITY. The mirror image of every other check here: not "can the
// item be broken without working" but "how much working does it actually need".
//
// The figure is the fewest significant figures at which the answer separates from all four
// distractors, computed by js/lib/precision.js, which the feedback screen reads from too so the
// audit page and the app can never disagree about an item's precision.
//
// This is a DESIGN diagnostic rather than a defect diagnostic and it has no severity band. A high
// one-figure rate is not a fault; it identifies a setup-and-direction test with negligible
// arithmetic content, which is worth knowing precisely because the feedback for such an item should
// not render a four-decimal chain. A low rate identifies a genuine precision item, where the
// feedback should say outright that estimation will not separate the options.
function estimation(items) {
  const usable = items.filter(it => ALGEBRAIC_TYPES.has(it.answerType)
    && it.options.every(o => typeof o.value === 'number' && Number.isFinite(o.value)));
  if (!usable.length) return null;
  let r1 = 0, r2 = 0, unresolved = 0;
  for (const it of usable) {
    const k = requiredFigures(it.options.map(o => o.value), it.correct.value);
    if (k === 1) r1++;
    if (k !== null && k <= 2) r2++;
    if (k === null) unresolved++;
  }
  const n = usable.length;
  return { n, at1: r1 / n, at2: r2 / n, unresolved: unresolved / n };
}

// STEM-ASSISTED OPTION ALGEBRA. An earlier round.
//
// The two checks above combine option VALUES only and are stem-blind by construction. But 9.5's
// span argument says the candidate "may scale any option by a stem-known number and add", and a17's
// bypass was exploitable precisely because the STEM supplied the coefficients. That channel had
// never been swept, and sweeping it found four archetypes solvable at 92% to 100%: d07 by the
// printed principal, a22 by a geometric run in the printed rate, d01 by a ratio chain, d08 by an
// offset chain. Two were repaired under the off-by-one bound in the spec; the rest are recorded as
// cost-bounded, which is d06's documented verdict on the same shape.
//
// TOLERANCE. This is the number the whole sweep depends on and it is stated rather than implied.
// A relation exact in the reals is only exact to the option set's own DISPLAY rounding once
// printed, so the tolerance follows that granularity: half a unit of the least significant place
// shown. A fixed floor of 0.011 hid a22 through three runs, because a22 rounds to whole pounds and
// its real match reads 18,117 / 15,399 = 1.176505 against 1 / 0.85 = 1.176471, a discrepancy of
// 0.0029% that a candidate sees as a match at four decimal places and a 1e-7 test called nothing.
// The MARGIN column exists so the next reader can see the discrimination rather than trust it: it
// reports the closest NON-matching pair, so a wide margin means the band is not doing delicate work.
//
// COST. Hit rate alone would invite repairing the wrong archetype: d07 at 100% and d05 at 99.5%
// are different objects. Cost is reported as the derivation depth of the linking constant and its
// reading position in the stem. Depth 0 is a number printed as it stands, depth 1 one keystroke
// from it, depth 2 two. Four subtractions against the first and largest number in the stem
// amortises across a drilling session; a squaring plus ten divisions does not.
const ALG_TOL_NOTE = 'half a unit of the least significant decimal place the option set displays';

function grainOf(vals) {
  let dp = 0;
  for (const v of vals) {
    const t = String(v), i = t.indexOf('.');
    if (i >= 0) dp = Math.max(dp, t.length - i - 1);
  }
  return Math.pow(10, -dp);
}

function stemTextOf(it) {
  const parts = [it.stimulus?.text ?? '', it.questionText ?? ''];
  const t = it.stimulus?.table, c = it.stimulus?.chart;
  if (t) parts.push(t.caption ?? '', t.note ?? '');
  if (c) parts.push(c.caption ?? '', c.note ?? '', c.axisLabel ?? '');
  return parts.join(' ');
}

// Every constant carries where it came from and how far it is from what the stem prints, so the
// cost column is a measurement rather than a judgement.
function stemConstantsOf(it) {
  const raw = stemTextOf(it).replace(/(\d),(?=\d{3}\b)/g, '$1');
  const nums = (raw.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(v => v > 0);
  const out = [];
  const push = (value, src, depth) => { if (value > 1e-9 && Number.isFinite(value)) out.push({ value, src, depth }); };
  nums.forEach((k, i) => {
    push(k, i + 1, 0);
    push(1 / k, i + 1, 1);
    push(k * k, i + 1, 1);
    push(1 / (k * k), i + 1, 2);
    if (k < 100) {
      for (const [v, d] of [[1 + k / 100, 1], [1 - k / 100, 1], [k / 100, 1]]) {
        push(v, i + 1, d);
        push(1 / v, i + 1, d + 1);
        push(v * v, i + 1, d + 1);
        push(1 / (v * v), i + 1, d + 2);
      }
    }
  });
  return out;
}

function stemAlgebra(items) {
  const usable = items.filter(it => ALGEBRAIC_TYPES.has(it.answerType)
    && it.options.every(o => typeof o.value === 'number' && Number.isFinite(o.value)));
  if (!usable.length) return null;

  const names = ['offset pair', 'ratio pair', 'ratio chain', 'offset chain', 'run of three', 'adjacent integers'];
  const tally = Object.fromEntries(names.map(n => [n, { hit: 0, depth: [], src: [], margin: [] }]));

  for (const it of usable) {
    const vals = it.options.map(o => o.value);
    const grain = grainOf(vals);
    const tol = t => Math.max(Math.abs(t) * 1e-9, grain / 2 + 1e-12);
    const near = (a, b) => Math.abs(a - b) <= tol(b);
    const ratioNear = (lo, hi, k) => Math.abs(hi / lo - k) <= (tol(hi) + k * tol(lo)) / Math.abs(lo);
    const ks = stemConstantsOf(it);
    const A = it.correct.value;
    const pairs = [];
    for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
      pairs.push([Math.min(vals[i], vals[j]), Math.max(vals[i], vals[j])]);
    }

    // Closest non-matching relation, so the margin is visible. Measured over ratios, which is
    // where the tolerance does its work.
    let margin = Infinity;
    for (const [lo, hi] of pairs) {
      if (lo <= 0) continue;
      const r = hi / lo;
      for (const k of ks) {
        if (k.value <= 1.02) continue;
        const rel = Math.abs(r - k.value) / k.value;
        if (rel > 1e-12 && !ratioNear(lo, hi, k.value)) margin = Math.min(margin, rel);
      }
    }

    const record = (name, winner, k) => {
      if (winner === null || !near(winner, A)) return;
      tally[name].hit++;
      if (k) { tally[name].depth.push(k.depth); tally[name].src.push(k.src); }
      if (Number.isFinite(margin)) tally[name].margin.push(margin);
    };

    // Offset and ratio pairs, unique across the whole set so a hit is a decision not a guess.
    for (const [name, test] of [['offset pair', (lo, hi, k) => near(hi - lo, k)],
                                ['ratio pair', (lo, hi, k) => lo > 0 && hi / lo >= 1.02 && k > 1.02 && ratioNear(lo, hi, k)]]) {
      const found = [];
      for (const [lo, hi] of pairs) for (const k of ks) if (test(lo, hi, k.value)) { found.push({ lo, hi, k }); break; }
      if (found.length === 1) {
        record(name, found[0].hi, found[0].k);
        record(name, found[0].lo, found[0].k);
      }
    }

    // Chains. Where two linked pairs share a member that member is identified outright.
    for (const [name, test] of [['ratio chain', (a, b, k) => Math.min(a, b) > 0 && Math.max(a, b) / Math.min(a, b) >= 1.02 && k > 1.02 && ratioNear(Math.min(a, b), Math.max(a, b), k)],
                                ['offset chain', (a, b, k) => Math.abs(a - b) > 1e-9 && near(Math.abs(a - b), k)]]) {
      const deg = vals.map(() => 0);
      let via = null;
      for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
        for (const k of ks) if (test(vals[i], vals[j], k.value)) { deg[i]++; deg[j]++; via = via ?? k; break; }
      }
      const top = Math.max(...deg);
      if (top >= 2 && deg.filter(d => d === top).length === 1) record(name, vals[deg.indexOf(top)], via);
    }

    // A three-term run, whose ends are what a same-side pair of off-by-ones produces. Invisible to
    // both pair tests, because a run carries two pairs at one ratio and to the chain test, because
    // its middle member is a distractor.
    {
      const runs = [];
      for (const a of vals) for (const b of vals) for (const c of vals) {
        if (!(a < b && b < c)) continue;
        for (const k of ks) if (k.value > 1.02 && ratioNear(a, b, k.value) && ratioNear(b, c, k.value)) { runs.push({ a, b, c, k }); break; }
      }
      const key = r => `${r.a}/${r.b}/${r.c}`;
      if (new Set(runs.map(key)).size === 1) {
        record('run of three', runs[0].a, runs[0].k);
        record('run of three', runs[0].c, runs[0].k);
        record('run of three', runs[0].b, runs[0].k);
      }
    }

    // No stem constant and no arithmetic at all. Any archetype with a rounding distractor puts the
    // answer next to it on the integer line, which the spec designs in.
    if (vals.every(Number.isInteger)) {
      const adj = pairs.filter(([lo, hi]) => hi - lo === 1);
      if (adj.length === 1) {
        record('adjacent integers', adj[0][0], { depth: 0, src: 0 });
        record('adjacent integers', adj[0][1], { depth: 0, src: 0 });
      }
    }
  }

  const med = a => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
  const rows = names.map(n => ({
    name: n, rate: tally[n].hit / usable.length, mult: (tally[n].hit / usable.length) / 0.2,
    depth: med(tally[n].depth), src: med(tally[n].src), margin: med(tally[n].margin),
  })).filter(r => r.rate > 0);
  const worst = rows.slice().sort((a, b) => b.rate - a.rate)[0] ?? null;
  return { n: usable.length, rows, worst };
}

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Column correlation. The two worst leaks found so far were both the same failure: the
// correct answer sitting at an extreme of a visible input column, so that a candidate can
// score without arithmetic. a14 pinned the answer to the slowest manufacture time in 100%
// of items; a12's first fix pinned it to the priciest licence.
//
// Neither the position table nor any per-item invariant catches this, because both look at
// the option set and not at the relationship between the answer and the stimulus. So this
// reads the rendered table, which is exactly what the candidate can see, and reports how
// often the answer is each column's argmax and argmin. Chance is 1/n. Anything above
// FLAG_MULTIPLE times chance is an exploitable heuristic.
// Two severities, because they are different failures.
//   EXTREME: the answer IS a column's argmax or argmin. A candidate reads one column and
//            answers. This must be near zero.
//   CONCENTRATION: the answer avoids the extremes and clusters in the middle ranks. That is
//            not a free answer, but it eliminates options for free. Weaker, and to a degree
//            irreducible: "never the argmax" is itself a pattern. Reported, not treated as a
//            defect on its own.
const FLAG_MULTIPLE = 1.6;
const EXTREME_TOLERANCE = 1.5;
const PINNED_THRESHOLD = 0.9;
// RANK LEAK, added after an earlier audit read. PINNED at 90% was far too lenient: b06 put the
// answer at rank 4 of 5 on units sold in 74% of items, which is 3.7x chance and a usable shortcut
// ("take the second highest on units sold"), and it was reported at the same amber severity as a
// column running at 1.2x chance. 2.4x chance is roughly 50% on a five-way and 60% on a four-way,
// which is where the line is drawn. Anything at or above it is a defect, not a note.
const RANK_LEAK_MULTIPLE = 2.4;
// Position skew. Same shape as FLAG_MULTIPLE but measured against the slots an archetype
// actually reaches, since a structurally two-slot archetype cannot beat 50% and should not be
// reported as though it could.
const POSITION_SKEW_MULTIPLE = 1.6;

const asNumber = cell => {
  const t = String(cell).replace(/[£$€,%\s]/g, '');
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  return Number(t);
};

// Reads a keyed table where there is one, and an explicit `correlation` block otherwise, so
// prose archetypes with a label answer are covered too. a06 is the case: five bulk tiers
// described in a sentence, with no table to parse.
function viewOf(it) {
  if (Array.isArray(it.stimulus?.table?.keys)) {
    const t = it.stimulus.table;
    return { keys: t.keys, head: t.head, rows: t.body };
  }
  if (it.correlation?.keys) {
    const head = Object.keys(it.correlation.columns);
    return {
      keys: it.correlation.keys,
      head,
      rows: it.correlation.keys.map((_, r) => head.map(h => it.correlation.columns[h][r])),
    };
  }
  return null;
}

// The row count was taken from the FIRST keyed item and applied to every one of them,
// which is wrong the moment an archetype varies it: c02 draws five or six segments, so its two
// halves have different chance baselines, 20% and 16.7%, and an n=6 item wrote a rank index of 5
// into an array sized for five. Items are now bucketed by row count and each bucket carries its own
// baseline. Every archetype built before c02 has a fixed row count and reports identically.
// FORMATTING TELLS. A rule that needs no arithmetic at all is worse than one that
// needs some, and this class survives every check the harness already runs.
//
// The spec forbids decimal-place variation leaving the answer as the single visually
// distinct option, and format.harmonise enforces a uniform decimal count across the set, so the
// dp check passes. But a uniform count still prints .00 against .32, and if the answer is the
// only value with an empty fractional part then "pick the one with no pence" names it outright.
// Found while building d01 at 12.5%; the sweep then put a05, shipped since early on, at 34.5%,
// which is 1.73x chance for free.
//
// The mirror case is reported too and is weaker: where exactly one DISTRACTOR is alone on a whole
// value, the candidate eliminates one option for free, which is 20% to 25% rather than an answer.
function formattingTell(items) {
  const whole = v => Number.isFinite(v) && Math.abs(v - Math.round(v)) < 1e-9;
  let n = 0, answerAlone = 0, distractorAlone = 0;
  for (const it of items) {
    if (CATEGORICAL_TYPES.has(it.answerType)) continue;
    const vals = it.options.map(o => o.value);
    if (vals.some(v => !Number.isFinite(v))) continue;
    n++;
    const others = it.options.filter(o => o.role !== 'correct').map(o => o.value);
    if (whole(it.correct.value) && !others.some(whole)) answerAlone++;
    if (!whole(it.correct.value) && others.filter(whole).length === 1) distractorAlone++;
  }
  if (!n) return null;
  // The rule only fires where the tell exists; elsewhere the candidate is back to chance. So the
  // honest exploitability number is the blended one, which is what the multiple is taken over.
  const p = answerAlone / n;
  const hit = p + (1 - p) * 0.2;
  return { n, answerAlone: p, distractorAlone: distractorAlone / n, hit, mult: hit / 0.2 };
}

function columnCorrelation(items) {
  const keyed = items.filter(it => viewOf(it));
  if (!keyed.length) return null;
  const counts = [...new Set(keyed.map(it => viewOf(it).keys.length))];
  if (counts.length > 1) {
    const buckets = counts.sort().map(c => ({
      rowCount: c,
      ...correlationFor(keyed.filter(it => viewOf(it).keys.length === c)),
    }));
    // The block with the most items leads, and the rest are reported beside it rather than merged.
    const main = buckets.reduce((a, b) => (b.measured > a.measured ? b : a));
    return { ...main, buckets };
  }
  return correlationFor(keyed);
}

function correlationFor(keyed) {
  const head = viewOf(keyed[0]).head;
  const n = viewOf(keyed[0]).keys.length;
  const cols = head.map(h => ({ head: h, max: 0, min: 0, usable: 0, tied: 0, ranks: new Array(n).fill(0) }));
  let measured = 0, unmatched = 0;
  for (const it of keyed) {
    const t = viewOf(it);
    const row = t.keys.indexOf(it.correct.value);
    // A verdict answer such as "All would cost the same" has no row, so there is nothing
    // to correlate. Counted separately rather than silently dropped.
    if (row < 0) { unmatched++; continue; }
    measured++;
    for (let c = 0; c < head.length; c++) {
      const vals = t.rows.map(r => asNumber(r[c]));
      if (vals.some(v => v === null)) continue;
      // A column with tied values cannot single out any row, so it is not a shortcut and its
      // rank statistics would be meaningless. a12's trainer counts are 2, 3 or 4 across four
      // packages, so they always tie.
      if (new Set(vals).size !== vals.length) { cols[c].tied++; continue; }
      cols[c].usable++;
      const hi = Math.max(...vals), lo = Math.min(...vals);
      if (vals[row] === hi && vals.filter(v => v === hi).length === 1) cols[c].max++;
      if (vals[row] === lo && vals.filter(v => v === lo).length === 1) cols[c].min++;
      // Full rank, because "never the highest" is not the same as "not correlated". A winner
      // pinned to rank 3 of 4 is still a free shortcut, just a subtler one.
      cols[c].ranks[[...vals].sort((a, b) => a - b).indexOf(vals[row])]++;
    }
  }
  const chance = 1 / n;
  const rows = cols.filter(c => c.usable > 0 || c.tied > 0).map(c => {
    const share = c.ranks.map(v => v / Math.max(1, c.usable));
    const top = Math.max(...share);
    // Three numbers, because two of them were being conflated and the tension between
    // them is real rather than a reporting bug.
    //
    // SUPPORT is how many ranks the answer can structurally reach. a10, b06 and c02 are all capped
    // at three of five by their own geometry, and judging a distribution that is FLAT across what
    // it can reach against 1/n reports a fixed archetype as still broken.
    //
    // CONCENTRATION, top rank against 1/support, is therefore what the flag now uses: it asks
    // whether the weighting is doing its job. HIT RATE, top rank against 1/n, is what decides
    // exploitability, because reachability is itself a narrowing the candidate gets for free.
    // Both are true at once. b06 after its an earlier round rebuild reads 1.14x on concentration and
    // 1.90x on hit rate, and the right reading is that the weighting is at its floor and the
    // archetype is still worth more than chance to a candidate who knows the shape.
    //
    // The extreme check stays against 1/n. Never-the-argmax is exploitable information whatever
    // the support is, which is why it is a separate severity.
    const support = share.filter(v => v > 0).length || 1;
    const floor = 1 / support;
    return {
      tiedOnly: c.usable === 0,
      head: c.head,
      maxRate: c.max / c.usable,
      minRate: c.min / c.usable,
      maxFlag: c.max / c.usable > EXTREME_TOLERANCE * chance,
      minFlag: c.min / c.usable > EXTREME_TOLERANCE * chance,
      ranks: share,
      support,
      concentration: top / floor,
      hitRate: top / chance,
      // THE BAND IS FINER THAN THE MEASUREMENT AT n=200. A share near 0.45 has a
      // standard error of 3.5 points at that n, so a reported 2.40x carries a 95% span of roughly
      // 2.05x to 2.75x and can be read either side of the bar by luck. d13's end column swung
      // 2.10x to 2.66x across samples for exactly that reason, and a16's "improvement" from 2.41x
      // to 2.39x was inside the same noise. Any row whose span straddles a band boundary is marked
      // UNRESOLVED and must be re-run at n=1000 before it is classified.
      hitSpan: (() => {
        const se = Math.sqrt(Math.max(top * (1 - top), 1e-9) / Math.max(1, c.usable));
        return [(top - 1.96 * se) / chance, (top + 1.96 * se) / chance];
      })(),
      rankFlag: top > FLAG_MULTIPLE * floor,
      // The severity fires on EITHER reading, not on concentration alone. Flagging on
      // concentration only was consistent with itself and wrong operationally: a14's three columns
      // read 1.01x, 1.05x and 1.32x on concentration, which is flat across a support of two, while
      // a candidate picking that rank scores 2.52x, 2.62x and 3.29x. They were carried into this
      // session as a defect while printing unflagged on the page they are meant to be read from,
      // which is the same computed-then-not-acted-on failure as the missing rankLeak branch in
      // An earlier round. The position table already flags on the operational figure; these now agree.
      rankLeak: top > RANK_LEAK_MULTIPLE * floor || top > RANK_LEAK_MULTIPLE * chance,
      unresolved: (() => {
        const se = Math.sqrt(Math.max(top * (1 - top), 1e-9) / Math.max(1, c.usable));
        const lo = (top - 1.96 * se) / chance, hi = (top + 1.96 * se) / chance;
        return [FLAG_MULTIPLE, RANK_LEAK_MULTIPLE].some(b => lo < b && hi > b);
      })(),
      hitLeakOnly: !(top > RANK_LEAK_MULTIPLE * floor) && top > RANK_LEAK_MULTIPLE * chance,
      topRank: top,
      pinned: top >= PINNED_THRESHOLD,
    };
  });
  return { rows, chance, measured, unmatched, worst: Math.max(0, ...rows.map(r => Math.max(r.maxRate, r.minRate))) };
}

function textBlock(arch, item, index, total) {
  const pad = 11;
  const wrap = (label, body, width = 62) => {
    const words = String(body).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > width) { lines.push(line.trim()); line = w; }
      else line += ' ' + w;
    }
    if (line.trim()) lines.push(line.trim());
    return lines.map((l, i) => (i === 0 ? label.padEnd(pad) : ''.padEnd(pad)) + l).join('\n');
  };
  const opts = item.options.map(o => {
    const tag = o.role === 'correct' ? 'CORRECT' : `${o.note}`;
    return ''.padEnd(pad) + o.display.padEnd(16) + '<- ' + tag;
  }).join('\n');
  const stim = [wrap('Stimulus:', item.stimulus.text ?? '')];
  if (item.stimulus.table) stim.push(tableText(item.stimulus.table, pad));
  // A chart's terminal rendition is a listing of exactly the figures the candidate can read
  // off it, not a picture, because what is checked is the formula against those figures.
  if (item.stimulus.chart) stim.push(chartText(item.stimulus.chart, pad));
  return [
    `ARCHETYPE ${arch.id} · ${arch.name}`,
    `Item ${index} of ${total}`.padEnd(48) + `seed ${item.seed}`,
    ...stim,
    wrap('Question:', item.questionText),
    wrap('Formula:', item.workings.formulaText),
    wrap('Values:', Object.entries(item.values ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ')),
    ''.padEnd(0) + 'Answer:'.padEnd(pad) + item.correct.display,
    'Options:'.padEnd(pad) + opts.trimStart(),
  ].join('\n');
}

function htmlBlock(arch, item, index, total) {
  const rows = item.options.map(o => `      <tr class="${o.role}"><td class="opt">${esc(o.display)}</td>`
    + `<td class="why">${o.role === 'correct' ? 'CORRECT' : esc(o.note ?? '')}</td>`
    + `<td class="et">${esc(o.errorType ?? '')}</td></tr>`).join('\n');
  return `
  <article class="item">
    <div class="ihead"><span>Item ${index} of ${total}</span><span class="seed">seed ${item.seed}</span></div>
    <dl>
      <dt>Stimulus</dt><dd>${esc(item.stimulus.text ?? '')}${
        item.stimulus.table ? tableHtml(item.stimulus.table, { cls: 'audit-table' }) : ''}${
        item.stimulus.chart ? chartSvg(item.stimulus.chart) : ''}</dd>
      <dt>Question</dt><dd class="q">${esc(item.questionText)}</dd>
      <dt>Formula</dt><dd class="mono">${esc(item.workings.formulaText)}</dd>
      <dt>Steps</dt><dd class="mono">${item.workings.steps.map(esc).join('<br>')}</dd>
      <dt>Values</dt><dd class="mono">${Object.entries(item.values ?? {}).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(' · ')}</dd>
      <dt>Answer</dt><dd class="ans">${esc(item.correct.display)}</dd>
    </dl>
    <table class="opts">
${rows}
    </table>
  </article>`;
}

const CSS = `
  :root { --ink:#16181d; --dim:#6b7280; --line:#e3e5ea; --bg:#fbfbfc; --ok:#0a7f5f; --bad:#b4341f; }
  * { box-sizing:border-box }
  body { margin:0; padding:32px clamp(16px,5vw,64px); background:var(--bg); color:var(--ink);
         font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; }
  h1 { font-size:20px; letter-spacing:.02em; margin:0 0 4px }
  .sub { color:var(--dim); font-size:13px; margin-bottom:28px }
  section { margin:0 0 40px; }
  h2 { font-size:16px; margin:0 0 2px }
  h2 .id { font-family:ui-monospace,monospace; color:var(--dim); margin-right:8px }
  .meta { color:var(--dim); font-size:13px; margin:0 0 14px }
  .meta b { color:var(--ink); font-weight:600 }
  .rates { border-collapse:collapse; font-size:13px; margin:0 0 18px }
  .rates td { border:1px solid var(--line); padding:3px 10px; background:#fff }
  .rates td:first-child { font-family:ui-monospace,monospace }
  .item { background:#fff; border:1px solid var(--line); border-radius:6px; padding:14px 16px; margin:0 0 12px }
  .ihead { display:flex; justify-content:space-between; font-size:12px; color:var(--dim);
           text-transform:uppercase; letter-spacing:.06em; margin-bottom:10px }
  dl { display:grid; grid-template-columns:88px 1fr; gap:4px 14px; margin:0 0 12px }
  dt { color:var(--dim); font-size:12px; text-transform:uppercase; letter-spacing:.05em; padding-top:2px }
  dd { margin:0 }
  .q { font-weight:600 }
  .ans { font-weight:600; color:var(--ok) }
  .mono { font-family:ui-monospace,monospace; font-size:13px }
  .opts { border-collapse:collapse; width:100%; font-size:14px }
  .opts td { border-top:1px solid var(--line); padding:5px 8px; vertical-align:top }
  .opts .opt { font-family:ui-monospace,monospace; width:130px; white-space:nowrap }
  .opts .why { color:var(--dim) }
  .opts .et { font-family:ui-monospace,monospace; font-size:12px; color:var(--dim); width:170px }
  .opts tr.correct td { background:#f2fbf7 }
  .opts tr.correct .why { color:var(--ok); font-weight:600 }
  .opts tr.filler .et { color:#9aa0aa }
  .leak { color:var(--bad); font-weight:600 }
  .audit-table { border-collapse:collapse; margin:8px 0 2px; font-size:13px; }
  .audit-table caption { text-align:left; color:var(--dim); font-size:12px; padding-bottom:4px }
  .audit-table th, .audit-table td { border:1px solid var(--line); padding:3px 9px; text-align:left }
  .audit-table th { background:#f4f5f7; font-weight:600; font-size:12px }
  .audit-table th.num, .audit-table td.num { text-align:right; font-variant-numeric:tabular-nums }
  .table-note { color:var(--dim); font-size:12px; margin:4px 0 0 }
`;

const list = ONLY ? archetypes.filter(a => a.id === ONLY) : archetypes;
NUMERIC_IN_SCOPE = list.some(a => ALGEBRAIC_TYPES.has(a.answerType));
LABEL_IN_SCOPE = list.some(a => a.answerType === 'label' || a.answerType === 'verdict' || a.answerType === 'month');
const sections = [];
const summary = [];

for (const arch of list) {
  const { items, rejections, leaks, attempts, accepted } = harvest(arch, N, BASE);
  const rejected = attempts - accepted;
  const totalLeaks = [...leaks.values()].reduce((a, b) => a + b, 0);
  const rateRows = [...rejections.entries()].sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `<tr><td>${esc(name)}</td><td>${n}</td><td>${(100 * n / attempts).toFixed(1)}% of attempts</td></tr>`).join('\n');

  const diag = diagnose(items);
  const corr = columnCorrelation(items);
  const tell = formattingTell(items);
  const groups = variantGroups(arch, items).map(g => ({ ...g, diag: diagnose(g.items), corr: columnCorrelation(g.items) }));
  const algebra = optionAlgebra(items);
  const stemAlg = stemAlgebra(items);
  const pairs = adjacentPairs(items);
  const est = estimation(items);
  summary.push({ arch, items, rejections, leaks, attempts, rejected, totalLeaks, diag, corr, groups, algebra, tell, stemAlg, pairs, est });

  sections.push(`
  <section>
    <h2><span class="id">${arch.id}</span>${esc(arch.name)}</h2>
    <p class="meta">
      group <b>${arch.group}</b> · tiers <b>${arch.tiers.join(', ')}</b> · ${arch.stimulus} · ${arch.answerType} · ${arch.targetSeconds}s<br>
      ${items.length} items accepted from <b>${attempts}</b> attempts. Constraint rejections: <b>${rejected}</b> (${(100 * rejected / attempts).toFixed(1)}%).
      Items reaching validate and failing: <span class="${totalLeaks ? 'leak' : ''}">${totalLeaks}</span>.<br>
      Formula: <span class="mono">${esc(arch.formulaText)}</span><br>
      Answer position across ${items.length} items:
      <span class="mono">${diag.slots.map((n, i) => `${i + 1}:${(100 * n / Math.max(1, items.length)).toFixed(0)}%`).join('  ')}</span>
      <span class="${diag.support < diag.expectedSupport ? 'leak' : ''}">${
        diag.support < diag.expectedSupport ? `only ${diag.support} of ${diag.expectedSupport} slots reachable`
        : diag.pinnedLast ? 'all four open slots reachable, slot 5 pinned to the verdict option by design'
        : 'all five slots reachable'}</span>.
      ${diag.hasCatchAll ? `Catch-all option correct in <b>${(100 * diag.catchAllRate).toFixed(1)}%</b> of items`
        + (arch.catchAllTargetRate !== undefined ? ` (target ${(100 * arch.catchAllTargetRate).toFixed(0)}%)` : '')
        + `<span class="${diag.catchAllRate === 0 ? 'leak' : ''}">${diag.catchAllRate === 0
            ? ' - never correct, so it trains the wrong reflex' : ''}</span>.<br>` : ''}
      ${diag.categorical ? 'Categorical answer type, so near cover does not apply and the position above is emit order.'
        : `Nearest option to the answer: median <b>${diag.nearestMedian.toFixed(2)}x</b>, worst <b>${diag.nearestWorst.toFixed(2)}x</b>.`}
    </p>
    <table class="rates">${rateRows || '<tr><td colspan="3">no rejections</td></tr>'}</table>
    ${corr ? `<table class="rates"><tr><td colspan="3"><b>Answer against each visible column</b>, chance ${(100 * corr.chance).toFixed(0)}%,
      ${corr.measured} items measured${corr.unmatched ? `, ${corr.unmatched} whose answer is not a row of the table` : ''}</td></tr>`
      + corr.rows.map(r => `<tr><td>${esc(r.head)}</td>`
        + `<td>${r.tiedOnly ? 'ties in every item' : 'rank ' + r.ranks.map(v => `${(100 * v).toFixed(0)}%`).join(' · ')}</td>`
        + `<td class="${(r.maxFlag || r.minFlag || r.pinned || r.rankLeak) ? 'leak' : ''}">${r.tiedOnly ? 'not a shortcut'
            : (r.maxFlag || r.minFlag) ? 'EXTREME LEAK' : r.pinned ? 'PINNED to one rank'
            : r.rankLeak ? `RANK LEAK${r.hitLeakOnly ? ' on hit rate' : ''}, one rank holds ${(100 * r.topRank).toFixed(0)}%`
            : r.rankFlag ? 'concentrated in the middle' : 'clear'}`
            + ` <span class="muted">sup ${r.support} · conc ${r.concentration.toFixed(2)}x · hit ${r.hitRate.toFixed(2)}x</span></td></tr>`).join('')
      + '</table>' : ''}
    ${spread(items, SAMPLES).map((it, i) => htmlBlock(arch, it, i + 1, Math.min(SAMPLES, items.length))).join('')}
  </section>`);
}

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'audit.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>WHETSTONE audit</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style></head>
<body>
  <h1>WHETSTONE audit</h1>
  <p class="sub">${list.length} archetype${list.length === 1 ? '' : 's'} · ${N} items generated each · base seed ${BASE} · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</p>
${sections.join('\n')}
</body></html>
`, 'utf8');

// Terminal summary.
console.log(`\nCONSTRAINT FAILURE RATES  (${N} accepted items per archetype, base seed ${BASE})\n`);
const w = [5, 34, 9, 9, 8];
console.log('  ' + ['id', 'archetype', 'attempts', 'rejected', 'leaked'].map((h, i) => h.padEnd(w[i])).join(''));
for (const s of summary) {
  console.log('  ' + [s.arch.id, s.arch.name.slice(0, 32), String(s.attempts),
    `${(100 * s.rejected / s.attempts).toFixed(1)}%`, String(s.totalLeaks)]
    .map((c, i) => c.padEnd(w[i])).join(''));
}
for (const s of summary) {
  console.log(`\n  ${s.arch.id} rejections by constraint:`);
  if (!s.rejections.size) console.log('    none');
  for (const [name, n] of [...s.rejections.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${name.padEnd(26)} ${String(n).padStart(5)}   ${(100 * n / s.attempts).toFixed(1)}% of attempts`);
  }
  if (s.totalLeaks) {
    console.log(`  ${s.arch.id} LEAKED PAST GENERATE AND FAILED VALIDATE:`);
    for (const [name, n] of s.leaks.entries()) console.log(`    ${name.padEnd(26)} ${String(n).padStart(5)}`);
  }
}
console.log('\nANSWER POSITION IN THE OPTION SET (value-sorted, or emit order where marked cat), and near cover\n');
console.log('  ' + 'id'.padEnd(6) + ['1st', '2nd', '3rd', '4th', '5th'].map(h => h.padStart(7)).join('')
            + '   slots'.padEnd(9) + 'nearest median'.padStart(16) + 'worst'.padStart(9) + 'catch-all'.padStart(11));
for (const s of summary) {
  for (const g of s.groups) {
    if (g.pooled && s.groups.length > 1) console.log('');
    const n = Math.max(1, g.items.length);
    const d = g.diag;
    const label = g.pooled ? s.arch.id : `  ${g.label}`.slice(0, 12);
    // Two independent failures. Missing slots is one. Skew INSIDE the slots that are reached is the
    // other, and the table could not see it: 6/91/4 over three slots passed the support check while
    // being nearly a one-slot archetype. Floor is 1 / support rather than 1 / 5, because several
    // archetypes are structurally capped and cannot do better than their own reachable space.
    const evenShare = 1 / Math.max(1, d.support);
    const skewed = d.support > 1 && d.topShare > POSITION_SKEW_MULTIPLE * evenShare;
    const flag = !g.visible ? '  (hidden variant, not a shortcut)'
      : d.support < d.expectedSupport
        ? `  <- position leak, ${d.support} of ${d.expectedSupport} slots`
          + (skewed ? ` and ${(100 * d.topShare).toFixed(0)}% in one of them` : '')
      : skewed ? `  <- position skew, ${(100 * d.topShare).toFixed(0)}% in one slot of ${d.support}`
      : d.hasCatchAll && d.catchAllRate === 0 ? '  <- catch-all never correct' : '';
    console.log('  ' + label.padEnd(s.groups.length > 1 ? 14 : 6)
      + d.slots.map(v => `${(100 * v / n).toFixed(0)}%`.padStart(7)).join('')
      + `   ${d.support}/${d.expectedSupport}`.padEnd(9)
      + (d.categorical ? 'cat'.padStart(16) + 'n/a'.padStart(9)
          : `${d.nearestMedian.toFixed(2)}x`.padStart(16) + `${d.nearestWorst.toFixed(2)}x`.padStart(9))
      + (d.hasCatchAll ? `${(100 * d.catchAllRate).toFixed(0)}%`.padStart(11) : ''.padStart(11))
      + flag);
  }
}

// POSITION AS A HIT RATE. The table above prints the distribution and flags shape; this
// prints what the shape is WORTH to a candidate, which is a different question and the one that
// decides whether an archetype needs work.
//
// Three numbers, the same treatment the correlation table got:
//
//   sup   how many sorted slots the answer can structurally reach. Several archetypes are capped
//         below five by their own option geometry, and a04 and d07 are capped at one.
//   conc  the modal slot against 1/sup. Asks whether the weighting is doing its job. An archetype
//         at 1.00x cannot be tuned any flatter without changing its distractor set.
//   hit   the modal slot against 1/5. What "always pick slot k" actually scores, and therefore the
//         exploitability. A column at its floor on conc can still be far above chance on hit,
//         because reachability is itself a narrowing the candidate gets for free.
//
// EXAM is the operational figure and it is what matters under timed conditions. Position only
// pays where the options are displayed in value order, so it depends on the mode's optionOrder:
// Desk 02 Exam is `ascending`, so the whole modal share converts; Desk 01 Exam is `realistic`,
// ascending 83% of the time, so it is 0.83 x modal + 0.17 x chance. Under `shuffled`, which Tempo
// and Classify use, position is worth nothing at all.
//
// Reported per visible variant, because that is the unit of analysis. Where the split is hidden the
// pooled row is the real one and the variant rows are printed for information only.
{
  const CHANCE = 0.2;
  const rows = [];
  for (const s of summary) {
    for (const g of s.groups) {
      const d = g.diag;
      if (!d || !d.slots || !d.support) continue;
      if (!g.pooled && !g.visible) continue;          // hidden splits are not the unit of analysis
      if (s.groups.length > 1 && g.pooled && s.groups.some(x => !x.pooled && x.visible)) continue;
      // A variant whose answer is ALWAYS the catch-all is not a position leak and counting it as
      // one is a category error. b05's cannot and excess halves read 100% in slot 5 and 5.00x,
      // but the verdict option is pinned last on purpose, by convention for verdict answers,
      // and "the answer is the verdict" IS the answer rather than a shortcut to it. The work is
      // deciding which variant you are in, which is what the item teaches. Printed for the record
      // and excluded from the severity counts.
      const allCatchAll = g.diag.hasCatchAll && g.diag.catchAllRate === 1;
      const desk = s.arch.desks?.[0] ?? 1;
      const exam = desk === 1 ? 0.83 * d.topShare + 0.17 * CHANCE : d.topShare;
      rows.push({
        label: g.pooled ? s.arch.id : `${s.arch.id} ${g.label}`,
        desk, sup: d.support, top: d.topShare,
        conc: d.topShare * d.support, hit: d.topShare / CHANCE, exam, examMult: exam / CHANCE,
        allCatchAll,
      });
    }
  }
  rows.sort((a, b) => b.examMult - a.examMult);
  console.log('\nPOSITION AS A HIT RATE');
  console.log('  What "always pick slot k" scores. Per visible variant, since that is what a');
  console.log('  candidate faces. conc is the modal slot against 1/sup and asks whether the');
  console.log('  weighting is done; hit is the same slot against 1/5 and is the exploitability.');
  console.log('  EXAM applies the mode\'s option order: Desk 02 Exam is ascending so the whole');
  console.log('  share converts, Desk 01 Exam is realistic at 83% ascending. Under shuffled,');
  console.log('  which Tempo and Classify use, position is worth nothing.');
  console.log('  Bands as elsewhere: 1.6x concentrated, 2.4x a leak.\n');
  console.log('  id            desk  sup    modal    conc     hit     exam       x');
  for (const r of rows) {
    const flag = r.allCatchAll ? '  (answer IS the catch-all, not a position leak)'
      : r.examMult >= 2.4 ? '  <- LEAK' : r.examMult >= 1.6 ? '  <- concentrated' : '';
    console.log('  ' + r.label.padEnd(14)
      + String(r.desk).padStart(4)
      + String(r.sup).padStart(5)
      + `${(100 * r.top).toFixed(0)}%`.padStart(9)
      + `${r.conc.toFixed(2)}x`.padStart(8)
      + `${r.hit.toFixed(2)}x`.padStart(8)
      + `${(100 * r.exam).toFixed(0)}%`.padStart(9)
      + `${r.examMult.toFixed(2)}x`.padStart(8) + flag);
  }
  const judged = rows.filter(r => !r.allCatchAll);
  const worst = judged.filter(r => r.examMult >= 2.4).length;
  const conc = judged.filter(r => r.examMult >= 1.6 && r.examMult < 2.4).length;
  if (!judged.length) console.log('  nothing above the reporting floor, no archetype in scope reported a position');
  console.log(`\n  ${judged.length} rows judged: ${worst} at leak severity, ${conc} concentrated, `
    + `${judged.length - worst - conc} clear. ${rows.length - judged.length} excluded as catch-all.`);
  const tunable = judged.filter(r => r.conc >= 1.6);
  console.log(`  ${tunable.length} of them are above 1.6x on CONC, so the weighting has room: `
    + (tunable.length ? tunable.map(r => r.label).join(', ') : 'none') + '.');
  console.log('  The rest are at or near their structural floor, and moving them needs a '
    + 'distractor\n  set change rather than tuning.');
}

// Standing report. See the note above optionAlgebra for what the two columns mean and why
// the directional one is the sharper instrument.
//
// This block used to sit INSIDE `if (withCorr.length)`, so on any run where no
// archetype had a correlation view the two algebra checks vanished without a word. That is every
// single-archetype checkpoint run on a prose numeric archetype, which is the exact workflow the
// the report is supposed to carry. Same class as the missing rankLeak branch: the diagnostic was
// computed and then not printed.
{
  const rows = summary.filter(s => s.algebra);
  if (rows.length) {
    console.log('\nANSWER RECOVERABLE FROM THE OTHER OPTIONS');
    console.log('  No stimulus and no stem, numeric answer types only. Baseline 20%.');
    console.log('  NARROWING is the expected hit rate from guessing inside the surviving set.');
    console.log('  DIRECTIONAL is a rule that names the answer outright, so no guessing at all.');
    console.log('  Bands as elsewhere: 1.6x chance concentrated, 2.4x a leak.\n');
    console.log('  id    in set   narrowing   x    smallest   best directional rule        rate    x');
    for (const s of rows.sort((a, b) => b.algebra.bestAttackMult - a.algebra.bestAttackMult
        || b.algebra.narrowMult - a.algebra.narrowMult)) {
      const a = s.algebra;
      const flag = a.bestAttackMult >= 2.4 || a.narrowMult >= 2.4 ? '  <- LEAK'
        : a.bestAttackMult >= 1.6 || a.narrowMult >= 1.6 ? '  <- concentrated' : '';
      console.log('  ' + s.arch.id.padEnd(6)
        + `${(100 * a.inSetRate).toFixed(0)}%`.padStart(6)
        + `${(100 * a.narrowHit).toFixed(1)}%`.padStart(12)
        + `${a.narrowMult.toFixed(2)}x`.padStart(7)
        + `${a.smallestSet ?? '-'}`.padStart(11)
        + `   ${a.bestAttack.padEnd(24)}`
        + `${(100 * a.bestAttackRate).toFixed(1)}%`.padStart(7)
        + `${a.bestAttackMult.toFixed(2)}x`.padStart(7)
        + flag);
    }
    console.log('\n  A directional rule above 1.6x is fixed in the archetype that produces it, locally,');
    console.log('  with the residual measured. A global predicate banning clean ratios was measured');
    console.log('  and dropped: it would rewrite six parameter spaces to fix nothing above threshold.');
  }
}

{
  // A CLEAN SWEEP HAS TO SAY SO. This section used to suppress itself when nothing cleared the
  // reporting floor, so a checkpoint run on a repaired archetype printed nothing and the reader
  // could not tell "measured and clean" from "not measured". That is the same failure as session
  // 4's missing rankLeak branch and an earlier round's algebra block nested inside `if (withCorr.length)`:
  // computed, then not shown. Under --only the row always prints, because a checkpoint run exists
  // to produce that number.
  const measured = summary.filter(s => s.tell);
  const tells = measured.filter(s => ONLY || s.tell.answerAlone > 0 || s.tell.distractorAlone >= 0.05)
    .sort((a, b) => b.tell.answerAlone - a.tell.answerAlone);
  if (measured.length) {
    console.log('\nFORMATTING TELLS');
    console.log('  A rule needing no arithmetic at all, which every other check here passes over.');
    console.log('  harmonise gives the set a uniform decimal count, but .00 against .32 is still');
    console.log('  visibly different. Where the answer is the only value with an empty fractional');
    console.log('  part, "pick the one with no pence" names it outright, against 20% chance.');
    console.log('  The distractor column is the weaker mirror: one option eliminated for free.\n');
    console.log('  id     answer alone   hit rate      x    one distractor alone');
    for (const s2 of tells) {
      const t = s2.tell;
      const flag = t.mult >= 2.4 ? '  <- LEAK' : t.mult >= 1.6 ? '  <- free rule above the bar' : '';
      console.log('  ' + s2.arch.id.padEnd(6)
        + `${(100 * t.answerAlone).toFixed(1)}%`.padStart(12)
        + `${(100 * t.hit).toFixed(1)}%`.padStart(11)
        + `${t.mult.toFixed(2)}x`.padStart(7)
        + `${(100 * t.distractorAlone).toFixed(1)}%`.padStart(20) + flag);
    }
    if (!tells.length) console.log(`  nothing above the reporting floor, ${measured.length} archetypes measured`);
  }
}

{
  const measured = summary.filter(s => s.stemAlg);
  console.log('\nANSWER RECOVERABLE WITH THE STEM AS WELL');
  console.log('  The two checks above are stem-blind: they combine option values only. 9.5\'s span');
  console.log('  argument allows the candidate to scale any option by a stem-known number, and a17\'s');
  console.log('  bypass worked because the STEM supplied the coefficients. Constants are read from the');
  console.log('  prose, the question and any caption. Table cells and chart bars are excluded, because');
  console.log('  reading those is the work. A hit needs the linking pair to be UNIQUE, so it is a');
  console.log(`  decision and not a guess. Tolerance: ${ALG_TOL_NOTE}.`);
  console.log('  COST is the linking constant\'s derivation depth and its reading position in the stem.');
  console.log('  Depth 0 is printed as it stands, 1 is one keystroke away, 2 is two. Cost is what');
  console.log('  separates a repair from a record: four subtractions against the first number in the');
  console.log('  stem amortises across a drilling session, a squaring plus ten divisions does not.');
  console.log('  MARGIN is the closest NON-matching ratio, so the tolerance band can be seen to');
  console.log('  discriminate rather than trusted. Bands as elsewhere: 1.6x concentrated, 2.4x a leak.\n');
  console.log('  id    worst attack          rate     x    cost              margin');
  const rows = measured.map(s2 => ({ id: s2.arch.id, w: s2.stemAlg.worst }))
    .filter(r => r.w).sort((a, b) => b.w.rate - a.w.rate);
  let shown = 0;
  for (const r of rows) {
    if (!ONLY && r.w.mult < 0.25) continue;
    shown++;
    const flag = r.w.mult >= 2.4 ? '  <- LEAK' : r.w.mult >= 1.6 ? '  <- concentrated' : '';
    console.log('  ' + r.id.padEnd(6) + r.w.name.padEnd(20)
      + `${(100 * r.w.rate).toFixed(1)}%`.padStart(7)
      + `${r.w.mult.toFixed(2)}x`.padStart(7)
      + `  depth ${r.w.depth ?? '-'}, const #${r.w.src ?? '-'}`.padEnd(20)
      + (r.w.margin === null ? '     -' : `${(100 * r.w.margin).toFixed(2)}%`.padStart(8)) + flag);
  }
  if (!shown) console.log(`  nothing above the reporting floor, ${measured.length} archetypes measured`);
  console.log('\n  Repaired under the off-by-one bound: d07 and a22, both');
  console.log('  from 100% to nothing above the floor. Recorded as cost-bounded, which is d06\'s own');
  console.log('  documented verdict on this shape: d01, d02, d05, d06, d08.');
}

const withCorr = summary.filter(s => s.corr);
if (withCorr.length) {
  console.log('\nANSWER AGAINST EACH VISIBLE INPUT COLUMN');
  console.log(`  A label answer sitting at a column extreme is a heuristic that needs no arithmetic.`);
  console.log(`  Rank 1 is the lowest value in that column, rank n the highest.`);
  console.log(`  EXTREME LEAK means the answer is that column's argmax or argmin more than`);
  console.log(`  ${EXTREME_TOLERANCE}x chance, so one column answers the item. "concentrated" is the weaker`);
  console.log(`  case: no extreme, but the middle ranks carry more than ${FLAG_MULTIPLE}x chance.`);
  console.log(`  RANK LEAK means one rank holds more than ${RANK_LEAK_MULTIPLE}x chance, roughly 50% on a`);
  console.log(`  five-way or 60% on a four-way. That is a usable shortcut and is a defect.`);
  console.log(`  PINNED means one rank holds ${100 * PINNED_THRESHOLD}% or more, which is nearly as free as an extreme.`);
  console.log('  UNRESOLVED means the 95% span straddles a band boundary, so the figure cannot be');
  console.log('  classified at this n whichever side the point estimate falls. Re-run at n=1000.');
  console.log('  RANK LEAK fires on EITHER reading: conc against 1/sup, or hit against 1/n. Flagging on');
  console.log('  conc alone reported a14 clear at 1.01x while a candidate picking that rank scored 2.52x,');
  console.log(`  so "on hit" marks a row that is flat across its support and still worth more than ${RANK_LEAK_MULTIPLE}x chance.\n`);
  console.log(`  Reported per question variant where one is visible to the candidate, because`);
  console.log(`  pooling over a visible discriminator averages a leak away. See variantGroups.\n`);
  for (const s of withCorr) {
    for (const g of s.groups) {
      if (!g.corr) continue;
      const head = g.pooled ? `  ${s.arch.id}` : `    ${g.label}`;
      console.log(`${head}  chance ${(100 * g.corr.chance).toFixed(0)}%`
        + `, ${g.corr.measured} measured` + (g.corr.unmatched ? `, ${g.corr.unmatched} non-row answers skipped` : '')
        + (g.pooled && s.groups.length > 1 ? '  (pooled, not the unit of analysis)' : '')
        + (!g.visible ? '  (hidden variant, not a shortcut)' : ''));
      if (g.corr.buckets) {
        console.log(`      row counts vary, so each is reported against its own baseline:`
          + g.corr.buckets.map(b => ` ${b.rowCount} rows x ${b.measured}`).join(','));
      }
      for (const b of (g.corr.buckets ?? [g.corr])) {
       if (g.corr.buckets) console.log(`      ${b.rowCount} segments, chance ${(100 * b.chance).toFixed(0)}%, ${b.measured} items`);
       for (const r of b.rows) {
        if (r.tiedOnly) { console.log(`      ${r.head.padEnd(22)} ties in every item, cannot single out a row`); continue; }
        const sev = !g.visible ? ''
          : (r.maxFlag || r.minFlag) ? '<- EXTREME LEAK'
          : r.pinned ? '<- PINNED to one rank'
          : r.rankLeak ? `<- RANK LEAK${r.hitLeakOnly ? ' on hit' : ''}, one rank holds ${(100 * r.topRank).toFixed(0)}%`
          : r.rankFlag ? '<- concentrated' : '';
        const stats = `  sup ${r.support}  conc ${r.concentration.toFixed(2)}x  hit ${r.hitRate.toFixed(2)}x`;
        const span = r.unresolved ? `  span ${r.hitSpan[0].toFixed(2)}-${r.hitSpan[1].toFixed(2)} UNRESOLVED, re-run at n=1000` : '';
        console.log(`      ${r.head.padEnd(22)} rank ${r.ranks.map(v => `${(100 * v).toFixed(0)}%`.padStart(5)).join(' ')}${stats}  ${sev}${span}`);
       }
      }
    }
  }
}

{
  // ADJACENT VALUE PAIRS. Prints unconditionally where anything integer-valued is in scope, for the
  // reason the manifest exists: "measured and clean" and "not measured" must not look alike.
  const measured = summary.filter(s => s.pairs);
  if (measured.length) {
    console.log('\nADJACENT VALUE PAIRS');
    console.log('  A scanning rule rather than a computing one, and the first check here that models');
    console.log('  the candidate as scanning. Integer-valued option sets only. Find the two values one');
    console.log('  unit apart and take a side: no stem, no stimulus, no arithmetic.');
    console.log('  HIT is the expected rate for a scanner committed to one rule, guessing at 20% where');
    console.log('  the set carries no pair, so it is comparable with the narrowing figure above.');
    console.log('  RUN-3 is the separate rule "take the middle of three consecutive integers", which is');
    console.log('  what a second adjacent pair creates if the two pairs share a value.');
    console.log('  Bands as elsewhere: 1.6x concentrated, 2.4x a leak.\n');
    console.log('  id     any  uniq  in-pair  side    run-3   best rule                  hit      x');
    const rows = measured.slice().sort((a, b) => b.pairs.bestMult - a.pairs.bestMult);
    let shown = 0;
    for (const s of rows) {
      const p = s.pairs;
      if (!ONLY && p.bestMult < 1.6) continue;
      shown++;
      const flag = p.bestMult >= 2.4 ? '  <- LEAK' : '  <- concentrated';
      console.log('  ' + s.arch.id.padEnd(6)
        + `${(100 * p.anyRate).toFixed(0)}%`.padStart(5)
        + `${(100 * p.uniqueRate).toFixed(0)}%`.padStart(6)
        + `${(100 * p.answerInRate).toFixed(0)}%`.padStart(9)
        + `  ${p.side.padEnd(7)}`
        + `${(100 * p.midRunRate).toFixed(0)}%`.padStart(5)
        + `   ${p.bestRule.padEnd(26)}`
        + `${(100 * p.bestHit).toFixed(0)}%`.padStart(5)
        + `${p.bestMult.toFixed(2)}x`.padStart(7) + flag);
    }
    if (!shown) console.log(`  nothing at or above 1.6x, ${measured.length} archetypes measured`);
  }
}

{
  // POOLED CROSS-LIBRARY POSITION. Rows are desks and tiers rather than archetypes, because the
  // pool is the unit of analysis: a tier is what a session actually draws from.
  const all = pooledPosition(summary);
  if (all) {
    console.log('\nPOOLED ANSWER POSITION ACROSS THE LIBRARY');
    console.log('  Diagnostic 1 in 9.5 reports position per archetype and the library reads acceptably');
    console.log('  on it. This is the pool, which is what a candidate meets, because every session');
    console.log('  mixes archetypes. Rows are the pools the setup screen can actually produce.');
    console.log('  EXTREMES is slots 1 and 5 together, against 40% under an even distribution. It is');
    console.log('  the operational number: it prices "never pick the largest or the smallest option".');
    console.log('  Under 6.2 Desk 01 Exam is realistic at 83% ascending and Desk 02 Exam is ascending');
    console.log('  outright, so sorted position equals displayed position most of the time.\n');
    console.log('  pool             n     1st    2nd    3rd    4th    5th   best  extremes');
    const line = (label, p) => {
      if (!p) return;
      const flag = p.mult >= 2.4 ? '  <- LEAK' : p.mult >= 1.6 ? '  <- concentrated' : '';
      console.log('  ' + label.padEnd(15) + String(p.n).padStart(5)
        + p.share.map(x => `${(100 * x).toFixed(1)}%`.padStart(7)).join('')
        + `${p.mult.toFixed(2)}x`.padStart(7)
        + `${(100 * p.extremes).toFixed(1)}%`.padStart(10) + flag);
    };
    line('all', all);
    for (const d of [1, 2]) line(`desk ${d}`, pooledPosition(summary.filter(s => s.arch.desks.includes(d))));
    for (const t of ['warmup', 'standard', 'hard']) {
      for (const d of [1, 2]) {
        const rows = summary.filter(s => s.arch.desks.includes(d) && s.arch.tiers.includes(t));
        line(`desk ${d} ${t}`, pooledPosition(rows));
      }
    }
    console.log('\n  Every distractor must be a named wrong procedure applied to the');
    console.log('  correct expression, and such procedures straddle the answer, so the answer gravitates');
    console.log('  to the middle of its own set. The cause is the design and section 4 is right.');
    console.log('  A session-level balancing pass was measured and rejected: 25 of 38');
    console.log('  numeric archetypes never produce an extreme slot, so it caps at about 29% against a');
    console.log('  40% target while pinning a19, b03, d02 and d03 at roughly 5.00x. Practise in the');
    console.log('  shuffled modes, where the whole modal share collapses to chance, and keep Exam');
    console.log('  authentic. See test/probes/s7slotreach.mjs for the reachability table.');
  }
}

{
  // ESTIMATION RESOLVABILITY. No severity band: this is a design diagnostic, and both ends of the
  // range are informative rather than faulty.
  const measured = summary.filter(s => s.est);
  if (measured.length) {
    console.log('\nESTIMATION RESOLVABILITY');
    console.log('  The fewest significant figures at which the answer separates from all four');
    console.log('  distractors, from js/lib/precision.js, which the feedback screen reads too so the');
    console.log('  page and the app cannot disagree about an item\'s precision.');
    console.log('  NOT a defect measure and it carries no band. A high 1sf rate marks a setup-and-');
    console.log('  direction test with negligible arithmetic content, whose feedback should not render');
    console.log('  a four-decimal chain. A low one marks a genuine precision item, whose feedback');
    console.log('  should say outright that estimation will not separate the options.\n');
    const tot = measured.reduce((s, x) => s + x.est.n, 0);
    const w1 = measured.reduce((s, x) => s + x.est.at1 * x.est.n, 0) / tot;
    const w2 = measured.reduce((s, x) => s + x.est.at2 * x.est.n, 0) / tot;
    console.log(`  library, weighted by item over ${tot} items:  1sf ${(100 * w1).toFixed(1)}%`
      + `   2sf ${(100 * w2).toFixed(1)}%`);
    console.log('\n  id       1sf    2sf   unresolved   regime');
    for (const s of measured.slice().sort((a, b) => a.est.at1 - b.est.at1)) {
      const e = s.est;
      const regime = e.at1 >= 0.6 ? 'estimation wins'
        : e.at1 <= 0.1 ? 'precision item, say so in feedback' : 'mixed';
      console.log('  ' + s.arch.id.padEnd(7)
        + `${(100 * e.at1).toFixed(0)}%`.padStart(5)
        + `${(100 * e.at2).toFixed(0)}%`.padStart(7)
        + `${(100 * e.unresolved).toFixed(0)}%`.padStart(11)
        + `   ${regime}`);
    }
  }
}

console.log('\n' + '-'.repeat(74));
console.log('SAMPLE ITEMS\n');
for (const s of summary) if (s.items.length) console.log(textBlock(s.arch, s.items[0], 1, Math.min(SAMPLES, s.items.length)) + '\n');
console.log(`audit/audit.html written\n`);

checkManifest();
