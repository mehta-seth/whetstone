// The logical-reasoning formats and typed answers, called from test/run.js.
//
// VERIFY AN INDEPENDENT PATH, NEVER THE PRIMARY ONE AGAINST ITSELF. Every deductive item is re-solved
// here by code that shares nothing with lib/logic.js: its own permutation generator, its own reading
// of each clue spec, its own truth tables. If a clue's `holds` function in the library were wrong, the
// library's enumeration would agree with itself and every item would pass; this file would not.
import { archetypes, byId } from '../js/archetypes/index.js';
import { makeRng } from '../js/lib/rng.js';
import * as SESS from '../js/session.js';
import * as R from '../js/render.js';
import { defaultsFor } from '../js/toggles.js';
import { parseTyped, matchTyped, TYPABLE } from '../js/lib/typed.js';
import { checkFigureStimulus, figureSvg, ATTRS, ATTR_KEYS } from '../js/lib/figure.js';
import { numberPredictions, letterPredictions } from '../js/lib/series.js';
import { chartSvg } from '../js/lib/chart.js';
import { reportText, bestUrl, issueUrl, MAX_URL, REASONS } from '../js/report.js';
import { REPO, APP_VERSION } from '../js/lib/constants.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { archetypes as ALL } from '../js/archetypes/index.js';

const harvest = (id, tier, n, checkItem) => {
  const arch = byId[id];
  const out = [];
  for (let seed = 5000; out.length < n && seed < 5000 + n * 60; seed++) {
    const it = arch.generate(makeRng(seed), tier, null, []);
    if (it && !checkItem(it).length) out.push(it);
  }
  return out;
};

// ---- an independent reading of the clue specs
function perms(n) {
  const out = [];
  const a = [...Array(n).keys()];
  const heap = (k) => {
    if (k === 1) { out.push(a.slice()); return; }
    for (let i = 0; i < k; i++) {
      heap(k - 1);
      const j = k % 2 ? 0 : i;
      [a[j], a[k - 1]] = [a[k - 1], a[j]];
    }
  };
  heap(n);
  return out;
}
const ORDERS = perms(5).map(order => ({ order, slot: order.reduce((s, p, d) => { s[p] = d; return s; }, []) }));
function seqHolds(c, w) {
  const A = w.slot[c.a], B = c.b === undefined ? null : w.slot[c.b];
  switch (c.type) {
    case 'before': return A < B;
    case 'dayBefore': return B - A === 1;
    case 'on': return A === c.d;
    case 'notOn': return A !== c.d;
    case 'gap': return Math.abs(A - B) === c.k + 1;
    case 'end': return A === 0 || A === 4;
    case 'either': return A === c.d1 || A === c.d2;
    case 'apartDays': return Math.abs(A - B) !== 1;
    case 'adjacent': return Math.abs(A - B) === 1;
    default: throw new Error('unread clue ' + c.type);
  }
}
const parseStatement = key => {
  const [type, x, y] = key.split(':');
  const a = Number(x), b = Number(y);
  return type === 'on' || type === 'notOn' ? { type, a, d: b } : { type, a, b };
};
const SPLITS = (() => {
  const out = [];
  for (let m = 0; m < 64; m++) {
    const team = [...Array(6).keys()].map(i => ((m >> i) & 1 ? 0 : 1));
    if (team.filter(t => t === 0).length === 3) out.push({ team });
  }
  return out;
})();
function grpHolds(c, w) {
  switch (c.type) {
    case 'same': return w.team[c.a] === w.team[c.b];
    case 'diff': return w.team[c.a] !== w.team[c.b];
    case 'on': return w.team[c.a] === c.t;
    case 'ifThen': return w.team[c.a] !== c.s || w.team[c.b] === c.t;
    default: throw new Error('unread clue ' + c.type);
  }
}
// The words must say what the semantics does. A template swap would pass every enumeration.
const PHRASE = {
  before: /earlier day than/, dayBefore: /the day before/, notOn: /\bnot\b/, gap: /exactly .* between/,
  end: /either Monday or Friday/, either: /either \w+day or \w+day/, apartDays: /\bnot\b.*consecutive/,
  same: /the same (team|shift|office)/, diff: /\bnot\b.*the same/, on: /(is on|works|is placed in) the /, ifThen: /^If .*, then /,
};

export function runLogical({ say, checkItem }) {
  console.log('\nlogical formats: deductive items re-solved by an independent reader');
  const N = 150;
  for (const tier of ['warmup', 'standard', 'hard']) {
    // l01: the asked fact is settled, by every clue, minimally, and the wording matches the semantics.
    const l01 = harvest('l01', tier, N, checkItem);
    let ok = 0, minimal = 0, words = 0, hidden = 0;
    for (const it of l01) {
      const { ask, target, clues, order } = it.params;
      const W = ORDERS.filter(w => clues.every(c => seqHolds(c, w)));
      const val = w => (ask === 'who' ? w.order[target] : w.slot[target]);
      const vals = new Set(W.map(val));
      const want = Number(it.correct.value.slice(1));
      if (vals.size === 1 && vals.has(want) && !it.options.some(o => o.role !== 'correct' && o.value === it.correct.value)) ok++;
      if (clues.every((_, i) => new Set(ORDERS.filter(w => clues.every((c, j) => j === i || seqHolds(c, w))).map(val)).size > 1)) minimal++;
      const slot = order.reduce((s, p, d) => { s[p] = d; return s; }, []);
      if (clues.every(c => seqHolds(c, { order, slot }))) hidden++;
      if (it.stimulus.lines.every(l => clues.some(c => PHRASE[c.type].test(l)))
          && clues.every(c => it.stimulus.lines.some(l => PHRASE[c.type].test(l)))) words++;
    }
    say(l01.length >= N * 0.9, `l01 ${tier}: ${l01.length} items built`);
    say(ok === l01.length, `l01 ${tier}: the independent reader finds exactly the keyed answer in ${ok} of ${l01.length}`);
    say(minimal === l01.length && hidden === l01.length, `l01 ${tier}: every clue is true of the hidden order and none can be dropped (${minimal}, ${hidden})`);
    say(words === l01.length, `l01 ${tier}: every clue's wording carries its own semantics (${words} of ${l01.length})`);

    // l03: exactly the keyed person is always in the named person's group.
    const l03 = harvest('l03', tier, N, checkItem);
    let g = 0, gw = 0;
    for (const it of l03) {
      const { x, y, ask, team, clues } = it.params;
      const all = ask === 'suppose' ? [...clues, { type: 'on', a: y, t: team[y] }] : clues;
      const W = SPLITS.filter(w => all.every(c => grpHolds(c, w)));
      const forced = [...Array(6).keys()].filter(p => p !== x && W.every(w => w.team[p] === w.team[x]));
      if (forced.length === 1 && `p${forced[0]}` === it.correct.value) g++;
      if (clues.every(c => it.stimulus.lines.some(l => PHRASE[c.type].test(l)))) gw++;
    }
    say(l03.length >= N * 0.9 && g === l03.length, `l03 ${tier}: one forced partner, the keyed one, in ${g} of ${l03.length}`);
    say(gw === l03.length, `l03 ${tier}: grouping wording matches its semantics (${gw} of ${l03.length})`);

    // l04: a fresh truth table over the premises the stem states.
    const l04 = harvest('l04', tier, N, checkItem);
    let c4 = 0, noneSeen = 0;
    for (const it of l04) {
      const { chain, case: kase, noneBy, mVal, j } = it.params;
      const k = chain.length, M = { atom: k, val: mVal };
      const imp = (a, b) => ({ a, b });
      const negL = l => ({ atom: l.atom, val: !l.val });
      const side = kase === 'forward' ? imp(M, chain[j]) : kase === 'backward' ? imp(chain[j], M)
        : noneBy === 'affirm' ? imp(M, chain.at(-1)) : imp(chain[0], M);
      const prem = [...chain.slice(0, -1).map((l, i) => imp(l, chain[i + 1])), side];
      const fact = kase === 'forward' ? chain[0] : kase === 'backward' ? negL(chain.at(-1)) : noneBy === 'affirm' ? chain.at(-1) : negL(chain[0]);
      const rows = [];
      for (let m = 0; m < 1 << (k + 1); m++) rows.push([...Array(k + 1).keys()].map(i => !!((m >> i) & 1)));
      const lt = (l, r) => r[l.atom] === l.val;
      const W = rows.filter(r => prem.every(p => !lt(p.a, r) || lt(p.b, r)) && lt(fact, r));
      const evalKey = key => {
        if (key === 'none') return null;
        const parts = key.split(':');
        const L = s => ({ atom: Number(s.slice(0, -1)), val: s.endsWith('1') });
        if (parts[0] === 'if') { const a = L(parts[1]), b = L(parts[2]); return W.every(r => !lt(a, r) || lt(b, r)); }
        return W.every(r => lt(L(parts[1]), r));
      };
      const forcedOpts = it.options.filter(o => o.value !== 'none' && evalKey(o.value));
      const good = it.correct.value === 'none'
        ? forcedOpts.length === 0
        : forcedOpts.length === 1 && forcedOpts[0].value === it.correct.value;
      if (good && it.stimulus.lines.length === prem.length + 1) c4++;
      if (it.correct.value === 'none') noneSeen++;
    }
    say(l04.length >= N * 0.9 && c4 === l04.length, `l04 ${tier}: the keyed option is the only forced one, by a fresh truth table, in ${c4} of ${l04.length}`);
    say(noneSeen > 0 && noneSeen < l04.length, `l04 ${tier}: the catch-all is sometimes right and sometimes wrong (${noneSeen} of ${l04.length})`);
  }

  for (const tier of ['standard', 'hard']) {
    const l02 = harvest('l02', tier, N, checkItem);
    let ok = 0;
    for (const it of l02) {
      const W = ORDERS.filter(w => it.params.clues.every(c => seqHolds(c, w)));
      const count = key => W.filter(w => seqHolds(parseStatement(key), w)).length;
      const must = it.params.ask === 'must';
      const right = must ? count(it.correct.value) === W.length : count(it.correct.value) === 0;
      const wrongOk = it.options.filter(o => o.role !== 'correct').every(o => (must ? count(o.value) < W.length : count(o.value) > 0));
      if (right && wrongOk && W.length >= 2) ok++;
    }
    say(l02.length >= N * 0.9 && ok === l02.length, `l02 ${tier}: the keyed statement alone is necessary (or impossible), in ${ok} of ${l02.length}`);
  }

  console.log('\nlogical formats: series and figures');
  {
    const famSeq = {
      geom: p => [...Array(6).keys()].map(n => p.a * p.r ** n),
      interleave: p => [...Array(6).keys()].map(n => (n % 2 ? p.a2 + (n - 1) / 2 * p.d2 : p.a1 + n / 2 * p.d1)),
      growing: p => { const s = [p.a]; for (let i = 0; i < 5; i++) s.push(s[i] + p.d0 + i * p.dd); return s; },
      fibonacci: p => { const s = [p.a, p.b]; while (s.length < 6) s.push(s.at(-1) + s.at(-2)); return s; },
      multAdd: p => { const s = [p.a]; while (s.length < 6) s.push(s.at(-1) * p.m + p.c); return s; },
      altOps: p => { const s = [p.a]; for (let i = 1; i < 6; i++) s.push(((i % 2 === 1) === p.mulFirst) ? s.at(-1) * p.q : s.at(-1) + p.p); return s; },
      squares: p => [...Array(6).keys()].map(n => (n + 1 + p.s) ** 2 + p.off),
      arith: p => [...Array(6).keys()].map(n => p.a + n * p.d),
      zigzag: p => { const s = [p.a]; for (let i = 1; i < 6; i++) s.push(s.at(-1) + (i % 2 === 1 ? p.f : -p.b)); return s; },
    };
    let n1 = 0, ok1 = 0, n2 = 0, ok2 = 0;
    for (const tier of ['warmup', 'standard', 'hard']) {
      for (const it of harvest('i01', tier, 80, checkItem)) {
        n1++;
        const s = famSeq[it.params.family](it.params.params);
        const shown = it.stimulus.text.split(',').map(x => x.trim()).filter(x => x !== '?').map(Number);
        if (shown.join() === s.slice(0, 5).join() && it.correct.value === s[5] && numberPredictions(shown).size === 1) ok1++;
      }
      for (const it of harvest('i02', tier, 80, checkItem)) {
        n2++;
        const s = famSeq[it.params.family](it.params.params);
        const letters = it.stimulus.text.split(',').map(x => x.trim()).filter(x => x !== '?').map(x => x.charCodeAt(0) - 64);
        if (letters.join() === s.slice(0, 5).join() && it.correct.value.charCodeAt(0) - 64 === s[5]
            && letterPredictions(letters).size === 1) ok2++;
      }
    }
    say(ok1 === n1 && n1 > 200, `i01: an independent recomputation agrees with the shown terms and the answer, and the library admits one next term (${ok1} of ${n1})`);
    say(ok2 === n2 && n2 > 200, `i02: the same for letter series (${ok2} of ${n2})`);

    let n3 = 0, ok3 = 0, one = 0, svgs = 0;
    const atR = (r, t, size) => (r.kind === 'const' ? r.v : r.kind === 'alt' ? (t % 2 ? r.w : r.v)
      : (((r.v + (r.kind === 'step' ? r.k : r.dir) * t) % size) + size) % size);
    for (const tier of ['warmup', 'standard', 'hard']) {
      for (const it of harvest('i03', tier, 80, checkItem)) {
        n3++;
        const ans = it.options.find(o => o.role === 'correct').figure;
        if (ATTR_KEYS.every(a => atR(it.params.rules[a], 5, ATTRS[a].size) === ans[a]) && !checkFigureStimulus(it).length) ok3++;
        if (it.options.filter(o => o.role !== 'correct').every(o => ATTR_KEYS.filter(a => o.figure[a] !== ans[a]).length === 1)) one++;
        if (new Set(it.options.map(o => figureSvg(o.figure))).size === 5) svgs++;
      }
    }
    say(ok3 === n3 && n3 > 200, `i03: the answer is every rule applied once more, by an independent rule reader (${ok3} of ${n3})`);
    say(one === n3, `i03: every distractor differs from the answer in exactly one attribute (${one} of ${n3})`);
    say(svgs === n3, `i03: the five options render as five different pictures (${svgs} of ${n3})`);

    // Negative cases, so the new predicates are known to fire.
    const sample = harvest('i03', 'standard', 1, checkItem)[0];
    const broken = { ...sample, stimulus: { ...sample.stimulus, figures: sample.stimulus.figures.map(() => ({ ...sample.stimulus.figures[0] })) } };
    say(checkItem(broken).includes('figure-static-series'), 'a figure series that never changes is rejected');
    const dup = { ...sample, options: sample.options.map(o => ({ ...o, figure: sample.options[0].figure })) };
    say(checkItem(dup).includes('figure-duplicate-option'), 'two options showing the same figure are rejected');
    const logic = harvest('l01', 'standard', 1, checkItem)[0];
    say(checkItem({ ...logic, stimulus: { ...logic.stimulus, lines: [] } }).includes('missing-clues'), 'a deductive item with no clues is rejected');
    say(checkItem({ ...logic, stimulus: { ...logic.stimulus, lines: [logic.stimulus.lines[0], logic.stimulus.lines[0]] } }).includes('bad-clue-line'),
      'a deductive item with a repeated clue is rejected');
  }

  console.log('\ntyped answers');
  {
    say(parseTyped('£22,064', 'currency') === 22064 && parseTyped('24%', 'percentage') === 24
      && parseTyped('96 pads', 'countWithUnit') === 96 && parseTyped(' 0.75 ', 'number') === 0.75,
      'typed values read the way they are written: £22,064, 24%, 96 pads, 0.75');
    say(parseTyped('3/4', 'fraction') === 0.75 && parseTyped('3/0', 'fraction') === null, 'fractions parse, and a zero denominator does not');
    say(parseTyped('', 'number') === null && parseTyped('abc', 'number') === null && parseTyped('1.2.3', 'number') === null,
      'empty and malformed input parse to nothing');
    const opts = [{ value: 760, display: '£760.00' }, { value: 666.9, display: '£666.90' }, { value: 1411.43, display: '£1,411.43' }];
    say(matchTyped(760, opts, 'currency') === 0 && matchTyped(760.004, opts, 'currency') === 0 && matchTyped(760.01, opts, 'currency') === -1,
      'a typed value matches an option only when it rounds to what the option shows');
    const pads = [{ value: 96, display: '96 pads' }, { value: 97, display: '97 pads' }];
    say(matchTyped(96, pads, 'countWithUnit') === 0 && matchTyped(96.4, pads, 'countWithUnit') === -1,
      'a count matches only a whole number: 96.4 is not 96 pads');
    const pct = [{ value: 24, display: '24%' }, { value: 30, display: '30%' }];
    say(matchTyped(24.4, pct, 'percentage') === 0 && matchTyped(24.6, pct, 'percentage') === -1, 'whole-number percentages match within half a point');

    const toggles = { ...defaultsFor('practice', 1), typedAnswer: true };
    const run = SESS.createRun({ desk: 1, mode: 'practice', tier: 'standard', groups: ['money'], length: 6, toggles, sessionSeed: 4242 });
    const idx = run.items.findIndex(it => TYPABLE.has(it.answerType) && it.options.some(o => o.role === 'distractor'));
    run.goto(idx);
    say(run.typed && R.optionsHtml(run) === '' && R.questionHtml(run).includes('id="answer"'),
      'a typed item shows an input and no options before it is answered');
    const it = run.current;
    run.type(String(it.correct.value));
    const r1 = run.commit();
    say(r1.correct && !r1.skipped && r1.errorType === null, `typing the answer scores it correct (${it.correct.display})`);
    say(R.optionsHtml(run).includes('correct'), 'once answered, the options are revealed');
    const run2 = SESS.createRun({ desk: 1, mode: 'practice', tier: 'standard', groups: ['money'], length: 6, toggles, sessionSeed: 4242 });
    run2.goto(idx);
    const wrong = run2.current.options.find(o => o.role === 'distractor');
    run2.type(String(wrong.value));
    const r2 = run2.commit();
    say(!r2.correct && r2.errorType === wrong.errorType, `typing a distractor's value records its error type (${wrong.errorType})`);
    const run3 = SESS.createRun({ desk: 1, mode: 'practice', tier: 'standard', groups: ['money'], length: 6, toggles, sessionSeed: 4242 });
    run3.goto(idx);
    run3.type('123456789');
    const r3 = run3.commit();
    say(!r3.correct && !r3.skipped && r3.unmatched && r3.chosenValue === 123456789, 'a value matching no option is wrong, unmatched, and not a skip');
    const run4 = SESS.createRun({ desk: 1, mode: 'exam', tier: 'standard', groups: ['money'], length: 6,
      toggles: { ...defaultsFor('exam', 1), typedAnswer: true }, sessionSeed: 4242 });
    run4.goto(idx);
    say(!run4.canAdvance(), 'blank typed answers are blocked in exam mode');
    const label = SESS.createRun({ desk: 3, mode: 'practice', tier: 'standard', groups: [], length: 6,
      toggles: { ...defaultsFor('practice', 3), typedAnswer: true }, sessionSeed: 7 });
    say(!label.typed && R.optionsHtml(label).includes('data-opt'), 'with the toggle on, a label item is still answered by choosing');
  }

  console.log('\nlogical formats: sessions and screens');
  {
    let short = 0, built = 0;
    for (const desk of [3, 4, 5]) {
      for (const tier of ['warmup', 'standard', 'hard']) {
        for (const length of SESS.DESKS[desk].lengths) {
          for (const seed of [11, 22, 33]) {
            const run = SESS.createRun({ desk, mode: 'exam', tier, groups: [], length, toggles: defaultsFor('exam', desk), sessionSeed: seed });
            built++;
            if (run.items.length !== length) short++;
          }
        }
      }
    }
    say(short === 0, `deductive, inductive and mixed sessions deliver the length asked for (${built - short} of ${built})`);
    const mix = SESS.createRun({ desk: 5, mode: 'exam', tier: 'standard', groups: [], length: 24, toggles: defaultsFor('exam', 5), sessionSeed: 99 });
    const desks = new Set(mix.items.map(it => byId[it.archetypeId].desks[0]));
    say(desks.size === 3 && [2, 3, 4].every(d => desks.has(d)), 'a mixed session draws on all three formats');
    const counts = [2, 3, 4].map(d => mix.items.filter(it => byId[it.archetypeId].desks[0] === d).length);
    say(counts.every(c => c === 8), `a 24-item mixed session is eight of each (${counts.join(', ')})`);
    const narrow = SESS.createRun({ desk: 5, mode: 'practice', tier: 'standard', groups: ['sequencing'], length: 12,
      toggles: defaultsFor('practice', 5), sessionSeed: 5 });
    say(narrow.items.length === 12 && narrow.items.every(it => byId[it.archetypeId].group === 'sequencing'),
      'a group filter on the mixed format narrows it rather than shortening it');
    say(defaultsFor('exam', 3).backNav === false && defaultsFor('exam', 4).optionOrder === 'ascending',
      'the logical formats have their own exam defaults');

    const logic = SESS.createRun({ desk: 3, mode: 'practice', tier: 'standard', groups: [], length: 6, toggles: defaultsFor('practice', 3), sessionSeed: 3 });
    say(R.questionHtml(logic).includes('<ol class="clues">'), 'a deductive item renders its clues as a numbered list');
    const ind = SESS.createRun({ desk: 4, mode: 'practice', tier: 'standard', groups: ['figure-series'], length: 4, toggles: defaultsFor('practice', 4), sessionSeed: 3 });
    const html = R.questionHtml(ind);
    say(html.includes('class="fig-row"') && (html.match(/<svg class="fig"/g) ?? []).length === 10,
      'a figure item renders five frames, the blank, and five figure options');
    say(SESS.DESKS[3].modes.includes('classify') === false, 'Classify is not offered on the logical formats');
  }

  // Regressions for defects a person found by reading items, every one of which had passed the suite.
  // Each check names the item class it guards, so the next reader knows what it is for.
  console.log('\ncontent regressions found by reading items');
  {
    const many = (id, tier, n) => harvest(id, tier, n, checkItem);
    const d13 = [...many('d13', 'standard', 40)];
    say(d13.length > 0 && d13.every(it => { const late = it.stimulus.text.match(/(\d{4})(?!.*\d{4})/)?.[1]; return late && it.questionText.includes(late); }),
      'd13 asks about the year the table actually shows');
    const a08 = many('a08', 'standard', 60);
    say(a08.every(it => !/ full\./.test(it.stimulus.text) && /of a (barrel|gallon)/.test(it.stimulus.text)),
      'a08 measures amounts in a unit, so no vessel is filled past its brim');
    const d05 = many('d05', 'warmup', 60);
    say(d05.every(it => { const net = it.correct.value, o = it.options.find(x => x.errorType === 'wrong-quantity');
      const gross = Number(it.stimulus.text.match(/£([\d,]+\.\d\d)/)[1].replace(/,/g, ''));
      return !o || Math.abs(o.value - (gross - net)) < 0.011; }), 'd05 offers the tax itself, gross less net, as its wrong-quantity option');
    const c02 = many('c02', 'hard', 40);
    say(c02.every(it => { const [p1, p2] = it.stimulus.chart.pies; const d = p1.segments.map((s, i) => p2.segments[i].value - s.value);
      const top = Math.max(...d); return d.filter(v => v === top).length === 1 && it.options.find(o => o.role === 'correct').value !== p1.segments[d.indexOf(top)].label; }),
      'c02 never ties the largest share rise, and the share shortcut never lands on the answer');
    say(c02.every(it => !/smaller share of a larger/.test(it.stimulus.text)), 'c02 does not announce its own trap');
    const svg = chartSvg(c02[0].stimulus.chart);
    const xs = [...svg.matchAll(/class="legend-t" x="([\d.]+)"/g)].map(m => Number(m[1]));
    say(xs.length >= 5 && xs.every(x => x < 640), `the two-pie legend draws every category inside the canvas (${xs.length} entries)`);
    const a17 = chartSvg(many('a17', 'standard', 1)[0].stimulus.chart);
    say([...a17.matchAll(/class="axis-label"[^>]*>([^<]+)</g)].every(m => m[1].length <= 44), 'no axis-label line is longer than the axis can show');
    const d14 = many('d14', 'warmup', 60);
    const BANDS = { rowed: [4.2, 6.4], ran: [4.0, 8.2], swam: [1.0, 2.0] };
    say(d14.every(it => { const m = it.stimulus.text.match(/(rowed|ran|swam) the first (\d+) metres in (\d+) seconds.*second \d+ metres in (\d+) seconds/);
      const [lo, hi] = BANDS[m[1]]; return [m[3], m[4]].every(t => m[2] / t >= lo - 1e-9 && m[2] / t <= hi + 1e-9); }),
      'd14 leg speeds are ones a rower, a runner or a swimmer can actually reach');
    // Copy rules over every archetype: no "Foods's", no "1 tags", no sentence opening in lower case,
    // no raw floating-point tails in a worked answer.
    let bad = [];
    for (const a of ALL) for (const it of harvest(a.id, a.tiers[0], 8, checkItem)) {
      const stem = [it.stimulus.text ?? '', ...(it.stimulus.lines ?? []), it.questionText].join(' ');
      const notes = it.options.map(o => o.note ?? '').join(' ');
      if (/[a-z]s's\b/.test(stem.replace(/\bWes's\b/g, '')) || /s's share/.test(notes)) bad.push(`${a.id} possessive`);
      if (/(^|[.?!] )[a-z]/.test(stem) && !it.stimulus.series) bad.push(`${a.id} lower-case start`);
      if (/\b1 (?!in |of |per |to |buys )[a-z]+s\b/.test(it.questionText)) bad.push(`${a.id} count of one`);
      if ((it.workings?.steps ?? []).some(s => /\d\.\d{9,}/.test(s))) bad.push(`${a.id} raw float`);
    }
    say(bad.length === 0, `copy rules hold across all ${ALL.length} archetypes` + (bad.length ? `: ${[...new Set(bad)].join(', ')}` : ''));
  }

  console.log('\nthe practice site: reports, wording and release hygiene');
  {
    // Report a problem. The issue must carry what a maintainer needs to judge the question, keep the
    // answer key folded away, and fall back to a short link when the full one would be too long.
    const run = SESS.createRun({ desk: 1, mode: 'practice', tier: 'standard', groups: ['money'], length: 4,
      toggles: defaultsFor('practice', 1), sessionSeed: 77 });
    const wrongAt = run.current.options.findIndex(o => o.role === 'distractor');
    run.choose(wrongAt); run.commit();
    const ctx = R.reportContext(run);
    const rep = reportText(ctx, 'wrong-answer', 'I think it is B');
    const it = run.current;
    say(ctx.submitted && ctx.chosenDisplay === it.options[wrongAt].display, 'a report records the answer that was given');
    say(rep.body.includes(it.questionText) && it.options.every(o => rep.body.includes(o.display)),
      'a report quotes the question and every option');
    say(rep.body.indexOf('<details>') > -1 && rep.body.indexOf('marked correct') > rep.body.indexOf('<details>'),
      'the answer key sits inside a folded section, so a report does not spoil the question');
    say(rep.body.includes(`\`${it.seed}\``) && rep.body.includes(APP_VERSION) && rep.body.includes(`tools/reproduce.mjs ${it.archetypeId} ${it.seed}`),
      'a report carries the seed, the version and the command that rebuilds the question');
    say(rep.title.startsWith(`[question] ${it.archetypeId}`) && rep.body.includes('I think it is B'), 'the title names the question type and the note is kept');
    say(REASONS.every(([k]) => reportText(ctx, k).body.includes(REASONS.find(r => r[0] === k)[1])), 'every reason reads through to the issue');
    const url = bestUrl(rep);
    say(url.url.startsWith(`https://github.com/${REPO}/issues/new?`) && !url.needsPaste && url.url.length <= MAX_URL,
      'a normal report fits in one GitHub link');
    const huge = reportText({ ...ctx, item: { ...it, stimulus: { text: 'x'.repeat(9000) } } }, 'other');
    const cut = bestUrl(huge);
    say(cut.needsPaste && cut.url.length <= MAX_URL && issueUrl(huge.title, huge.body).length > MAX_URL,
      'a report too long for a link falls back to a short body plus the clipboard');

    // The home screen and the About page, through a minimal stand-in for the page.
    const saved = globalThis.document;
    const nodes = {};
    const node = sel => (nodes[sel] ??= { innerHTML: '', textContent: '', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null });
    globalThis.document = { querySelector: node };
    R.renderHome();
    const home = nodes['#screen'].innerHTML;
    say((home.match(/class="practice-card"/g) ?? []).length === 5 && (home.match(/data-quick="practice"/g) ?? []).length === 5
      && (home.match(/data-quick="exam"/g) ?? []).length === 5, 'the home screen offers Practise and Timed test for all five areas');
    R.renderAbout();
    say(nodes['#screen'].innerHTML.includes(`https://github.com/${REPO}`) && nodes['#screen'].innerHTML.includes(APP_VERSION),
      'the About page links the repository and shows the version');
    R.chrome('home');
    say(!/archetype/i.test(nodes['#nav-train'].innerHTML + nodes['#progress-summary'].innerHTML + home),
      'the home screen and navigation never say "archetype"');
    globalThis.document = saved;

    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    say(pkg.version === APP_VERSION, `the app reports the same version as package.json (${APP_VERSION})`);

    // The project is independent: no test provider or product is named anywhere in the repository.
    const root = new URL('..', import.meta.url).pathname;
    // The names are written backwards so that this file does not itself name them.
    const back = s => [...s].reverse().join('').replace(/[-+.]/g, '\\$&');
    const NAMES = ['LHS', 'lartneCtnelaT', 'tsriFsetaudarG', 'scirtemyP', 'ytiniffpaC', 'axeneK', 'ellivaS', 'e-tuc',
      'evitcaretnI yfireV', 'laciremuN yfireV', 'evitcudnI yfireV', 'evitcudeD yfireV'];
    const BANNED = new RegExp(`\\b(?:${NAMES.map(back).join('|')})\\b|\\b${back('+G')}(?![0-9A-Z])`);
    const hits = [];
    const walk = dir => { for (const f of readdirSync(dir)) {
      if (['.git', 'node_modules', 'logs'].includes(f)) continue;
      const p = join(dir, f), st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(js|mjs|md|json|html|css|yml|yaml|txt)$/.test(f) && !p.endsWith('audit.html')) {
        const m = readFileSync(p, 'utf8').match(BANNED);
        if (m) hits.push(`${p.slice(root.length)}: ${m[0]}`);
      } } };
    walk(root);
    say(hits.length === 0, 'no test provider or product is named anywhere in the repository' + (hits.length ? `: ${hits.slice(0, 4).join(', ')}` : ''));
  }
}
