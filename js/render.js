// Question, review, setup and home screens. All screen content renders into
// #screen; the DOM contract in index.html is fixed.
import { DESKS, inScope, groupsForDesk, allArchetypes } from './session.js';
import { TOGGLE_DEFS, MODES, TIERS, ORDER_CHOICES, defaultsFor, changedKeys, skipAllowed } from './toggles.js';
import { summarise, reviewDue, reviewLength } from './adaptive.js';
import * as store from './store.js';
import { mmss } from './timer.js';
import { tableHtml } from './lib/table.js';
import { precisionOf, precisionStatement, estimationRoute } from './lib/precision.js';
import { chartSvg } from './lib/chart.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
// The feedback screen needs the archetype MODULE, not just its name, because the
// estimation route lives on the module. Built once from the array session.js already exports.
const ARCH_BY_ID = Object.fromEntries(allArchetypes.map(a => [a.id, a]));

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 1800);
}

// `live` adds a way back into a session in progress.
//
// The sidebar had no #session entry, so once you navigated away mid-session the only routes back
// were the resume prompt on #home and typing the hash. Both were broken: the prompt restarted the
// clock from full duration, and the hash drew the question with no clock at all and nothing on
// screen to say so. Fix B repaired the offset; this makes the way back visible.
export function chrome(route, live = null) {
  $('#brand').textContent = 'WHETSTONE';
  const nav = (items) => items.map(([href, label, extra]) =>
    `<a class="nav-item" href="${href}"${route === href.slice(1) ? ' aria-current="page"' : ''}>`
    + `<span>${label}</span>${extra ? `<span class="mono">${extra}</span>` : ''}</a>`).join('');
  $('#nav-train').innerHTML = `<div class="nav-label">TRAIN</div>` +
    nav([['#home', 'Overview'], ['#desk1', 'Problem Solving'], ['#desk2', 'Data Interpretation']]
      .concat(live ? [['#session', 'Session in progress', live]] : []));
  $('#nav-review').innerHTML = `<div class="nav-label">REVIEW</div>` + nav([['#analytics', 'Analytics']]);

  const rows = summarise(allArchetypes, store.mastery());
  const at = rows.filter(r => r.atTarget).length;
  $('#progress-summary').innerHTML =
    `<div class="streak">${streakDays()} day streak</div>`
    + `<div class="progress-line">${at} / ${allArchetypes.length} archetypes at target</div>`;

  $('#key-hints').innerHTML =
    `<kbd>1</kbd>–<kbd>5</kbd> pick · <kbd>&crarr;</kbd> submit · <kbd>Esc</kbd> skip · <kbd>F</kbd> flag`
    + `<span class="empty"> · 1–8 in Classify</span>`;
}

function streakDays() {
  const days = new Set(store.sessions().filter(s => !s.abandoned).map(s => s.startedAt?.slice(0, 10)));
  let n = 0;
  for (let i = 0; ; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    if (days.has(d)) n++; else if (i > 0) break;
  }
  return n;
}

export function renderHome() {
  const rows = summarise(allArchetypes, store.mastery());
  const deskCard = d => {
    const pool = inScope({ desk: d.id });
    const mine = rows.filter(r => pool.some(p => p.id === r.id));
    const at = mine.filter(r => r.atTarget).length;
    return `<button class="deck" data-go="#desk${d.id}">
      <div class="eyebrow">${d.eyebrow}</div><h3>${d.name}</h3>
      <div class="stat">${d.items} in ${d.minutes}m</div>
      <div class="stat"><b>${at}/${mine.length}</b> at target${mine.length ? '' : ', nothing built yet'}</div></button>`;
  };
  const recent = store.sessions().filter(s => !s.abandoned).slice(-5).reverse();
  const weakest = rows.filter(r => r.attempts > 0).sort((a, b) => a.mastery - b.mastery).slice(0, 4);
  $('#screen').innerHTML = `
    <h1>Overview</h1><p class="purpose">Small sessions, every day.</p>
    <div class="deck-grid">${Object.values(DESKS).map(deskCard).join('')}</div>
    <hr class="rule">
    <h2>Last 5 sessions</h2>
    ${recent.length ? `<table class="grid"><thead><tr><th>Date</th><th>Format</th><th>Mode</th>
      <th class="num">Items</th><th class="num">Accuracy</th></tr></thead><tbody>${recent.map(s => {
        const a = (s.responses ?? []).filter(r => !r.skipped);
        const pc = a.length ? Math.round(100 * a.filter(r => r.correct).length / a.length) : 0;
        return `<tr><td>${esc(s.startedAt?.slice(0, 10))}</td><td>${DESKS[s.desk]?.name ?? s.desk}</td><td>${esc(MODES.find(m => m.id === s.mode)?.name ?? s.mode)}</td>
          <td class="num">${(s.responses ?? []).length}</td><td class="num">${a.length ? pc + '%' : 'n/a'}</td></tr>`;
      }).join('')}</tbody></table>` : `<p class="empty">No sessions yet. Pick a format above.</p>`}
    <hr class="rule">
    <h2>Weakest right now</h2>
    ${weakest.length ? `<table class="grid"><thead><tr><th>Archetype</th><th class="num">Attempts</th>
      <th class="num">Mastery</th></tr></thead><tbody>${weakest.map(r =>
        `<tr><td>${esc(r.name)}</td><td class="num">${r.attempts}</td>
         <td class="num">${r.mastery.toFixed(2)}</td></tr>`).join('')}</tbody></table>`
      : `<p class="empty">Nothing measured yet.</p>`}`;
}

// A pill with nothing behind it at the other filter's setting is marked, and the
// marker is on the markup so it can be asserted.
export const pill = (kind, value, label, on, count) =>
  `<button class="pill" data-${kind}="${value}" aria-pressed="${on}"${
    count === 0 ? ' data-empty="true"' : ''}>${esc(label)}${
    count !== undefined ? `<span class="count">${count}</span>` : ''}</button>`;

export function renderSetup(deskId, ui, onStart) {
  const desk = DESKS[deskId];
  const groups = groupsForDesk(deskId);
  const resolved = { ...defaultsFor(ui.mode, deskId), ...ui.overrides };
  const changed = changedKeys(resolved, ui.mode, deskId);
  const pool = inScope({ desk: deskId, tier: ui.tier, groups: ui.groups });
  const rows = summarise(pool, store.mastery());
  const weak = rows.filter(r => r.mastery < 0.6 && r.attempts >= 3).length;
  const due = reviewDue(inScope({ desk: deskId }), store.mastery());

  const modeCard = m => {
    // Review due is the only mode that can be unavailable, and only when nothing matches. That
    // matches the behaviour on myquantjourney.app.
    const off = m.id === 'review' && due.length === 0;
    const label = m.id === 'review' ? (due.length ? `Review due · ${due.length}` : 'Nothing due') : m.name;
    const desc = m.id === 'review' && due.length
      ? `${reviewLength(due)} items across ${due.length} archetype${due.length === 1 ? '' : 's'}`
      : m.id === 'classify' ? '10s an item, name it without solving' : m.desc;
    return `<button class="mode" data-mode="${m.id}" aria-pressed="${ui.mode === m.id}" ${off ? 'disabled' : ''}>
      <div class="name">${esc(label)}</div>
      <div class="desc">${esc(desc)}</div></button>`;
  };

  $('#screen').innerHTML = `
    <div class="eyebrow">${desk.eyebrow}</div>
    <h1>${desk.name}</h1><p class="purpose">${desk.purpose}</p>
    <div class="card">
      <div class="field-label">MODE</div>
      <div class="modes">${MODES.map(modeCard).join('')}</div>
      <div class="field-label">GROUPS</div>
      <div class="pills">${groups.length
        ? groups.map(([g]) => pill('group', g, g[0].toUpperCase() + g.slice(1), ui.groups.includes(g),
            inScope({ desk: deskId, tier: ui.tier, groups: [g] }).length)).join('')
        : '<span class="empty">No archetypes built for this format yet.</span>'}</div>
      <div class="field-label">DIFFICULTY</div>
      <div class="pills">${TIERS.map(t => [t.id, t.name])
        .map(([t, l]) => pill('tier', t, l, ui.tier === t,
          inScope({ desk: deskId, tier: t, groups: ui.groups }).length)).join('')}</div>
      <div class="field-label">LENGTH</div>
      <div class="pills">${ui.mode === 'review'
        ? `<span class="empty">Set by the engine: ${reviewLength(due)} items across ${due.length} archetype${due.length === 1 ? '' : 's'}</span>`
        : desk.lengths.map(n => pill('length', n, n, ui.length === n)).join('')}</div>

      <details class="opts" ${ui.optsOpen ? 'open' : ''}>
        <summary>Session options (${changed.length} changed from ${ui.mode} defaults)</summary>
        <div class="toggle-grid">${TOGGLE_DEFS.map(t => `
          <label class="toggle" title="${esc(t.effect)}">
            <input type="checkbox" data-toggle="${t.key}" ${resolved[t.key] ? 'checked' : ''}>
            <span>${t.label}</span>${changed.includes(t.key) ? '<span class="changed">changed</span>' : ''}
          </label>`).join('')}</div>
        <div class="field-label">OPTION ORDER</div>
        <div class="pills">${ORDER_CHOICES.map(o => pill('order', o,
          o[0].toUpperCase() + o.slice(1), resolved.optionOrder === o)).join('')}</div>
        <div class="btn-row">
          <button class="btn" data-act="reset">Reset to mode defaults</button>
          <button class="btn" data-act="preset">Save as my preset</button>
        </div>
      </details>

      <div class="scope"><b>${pool.length}</b> archetype${pool.length === 1 ? '' : 's'} in scope${
        ui.groups.length ? '' : ' · all groups'} · <b>${weak}</b> flagged weak${
        pool.length === 1 ? ' · one archetype only, so the no-repeat rule is off' : ''}</div>
      <div class="btn-row"><button class="btn btn-primary" data-act="start" ${pool.length ? '' : 'disabled'}>
        Start the session</button></div>
    </div>`;
  $('#screen').querySelector('[data-act="start"]')?.addEventListener('click', onStart);
}

export function renderSessionBar(run, remainingMs) {
  const t = run.session.toggles;
  const bar = $('#session-bar');
  const warn = t.timerWarning && remainingMs !== null && remainingMs <= 60000;
  bar.innerHTML = `
    <span class="qcount">Question ${run.index + 1}</span>
    <span class="empty">of ${run.items.length}</span>
    ${t.sessionClock && remainingMs !== null ? `<span class="clock${warn ? ' warn' : ''}">${mmss(remainingMs)}</span>` : ''}
    ${t.perItemClock ? `<span class="clock" id="item-clock"></span>` : ''}
    <button class="btn flagbtn" data-act="flag" aria-pressed="${run.cur.flagged}">Flag</button>`;
  bar.querySelector('[data-act="flag"]').addEventListener('click', () => {
    toast(run.flag() ? 'Flagged for review' : 'Flag removed');
    renderSessionBar(run, remainingMs);
  });
}

// ---------- the question screen, split into pure builders ----------
//
// The markup is built by functions that return strings and take no DOM, and only the two
// thin renderers below touch the document. The spec forbids adding a dependency, so there is
// no jsdom to render into and no way to assert on the interface at all; six sessions of UI features
// shipped with zero assertions against any of them. This is the same arrangement lib/table.js uses:
// one spec, several consumers, never parallel implementations.
//
// The shell carries two SLOTS. Choosing an option repaints only those, which is what stops a click
// from tearing down the stimulus, resetting the scroll position, dropping keyboard focus and
// rebuilding any chart SVG. It is also what stops the per-item clock being recreated, since the
// clock is rebuilt by draw().

export function optionsHtml(run) {
  const it = run.current, s = run.cur, t = run.session.toggles;
  const revealed = t.instantFeedback && s.submitted;
  if (run.isClassify) {
    const choices = it.classifyChoices ?? [];
    return choices.map((c, i) => {
      let cls = 'option';
      if (revealed && c.id === it.archetypeId) cls += ' correct';
      if (revealed && i === s.chosenIndex && c.id !== it.archetypeId) cls += ' chosen-wrong';
      return `<li><button class="${cls}" data-opt="${i}" aria-pressed="${s.chosenIndex === i}"${
        revealed ? ' aria-disabled="true"' : ''}>
        <span class="badge">${i + 1}</span>
        <span class="val">${esc(c.name)}</span>
        <span class="verdict empty">${esc(c.group)}</span></button></li>`;
    }).join('');
  }
  return it.options.map((o, i) => {
    let cls = 'option';
    if (revealed && o.role === 'correct') cls += ' correct';
    if (revealed && i === s.chosenIndex && o.role !== 'correct') cls += ' chosen-wrong';
    const badge = t.optionLetters ? LETTERS[i] : i + 1;
    const verdict = revealed && o.role === 'correct' ? 'correct'
      : revealed && i === s.chosenIndex ? 'your answer' : '';
    return `<li><button class="${cls}" data-opt="${i}" aria-pressed="${s.chosenIndex === i}"${
      revealed ? ' aria-disabled="true"' : ''}>
      <span class="badge">${badge}</span><span class="val">${esc(o.display)}</span>
      ${verdict ? `<span class="verdict">${verdict}</span>` : ''}</button></li>`;
  }).join('');
}

export function feedbackHtml(run) {
  const it = run.current, s = run.cur, t = run.session.toggles;
  if (!(t.instantFeedback && s.submitted)) return '';
  if (run.isClassify) {
    const choices = it.classifyChoices ?? [];
    const picked = s.chosenIndex === null ? null : choices[s.chosenIndex];
    return `<div class="feedback">${picked && picked.id === it.archetypeId
      ? '<span class="ok">Right archetype.</span>'
      : `<span class="no">Not that one.</span> <span class="why">This is ${esc(run.currentName)}.</span>`}</div>`;
  }
  const chosen = s.chosenIndex === null ? null : it.options[s.chosenIndex];
  const head = chosen && chosen.role === 'correct'
    ? '<span class="ok">Correct.</span>'
    : `<span class="no">Not this one.</span> <span class="why">${
        chosen ? esc(chosen.note) : 'Nothing selected'}. The answer is ${esc(it.correct.display)}.</span>`;
  const steps = (it.workings?.steps ?? []).map(x => `<li>${esc(x)}</li>`).join('');
  // THE ESTIMATION ROUTE GOES ABOVE THE EXACT CHAIN.
  //
  // Measured over 7,600 items: 40.3% of numeric items separate the answer from every distractor at
  // ONE significant figure and 91.4% at two. Every worked solution below renders the exact chain to
  // four decimal places, so until now the feedback layer demonstrated the slow method on items built
  // to reward the fast one. On a test that permits a calculator and prices items at 83 or 45 seconds,
  // the estimate is what tells you whether an item is worth attempting, what catches a mis-keyed
  // digit, and what eliminates three options before any computing happens.
  //
  // ORDER IS THE POINT. The route is rendered first and the exact chain becomes the verification you
  // would not have performed under the clock. Where one figure resolves the item the chain is
  // collapsed by default, because on those items it is not the method and opening it is a choice.
  const route = estimationRoute(it, ARCH_BY_ID[it.archetypeId]);
  const prec = precisionOf(it);
  const stmt = precisionStatement(it);
  const routeHtml = route ? `<div class="estimate">
      <span class="estimate-label">Estimate first</span>
      <span class="estimate-run">${esc(route.text)}</span>
      <span class="estimate-lands">lands on ${esc(route.landsOn.display)}${
        route.correct ? '' : ', which is a distractor: the estimate is too crude for this item'}</span>
    </div>` : '';
  const precHtml = stmt ? `<div class="precision">${esc(stmt)}</div>` : '';
  // A one-figure item's chain is closed even when setupBox is on, since setupBox opening the chain
  // exists to show the arithmetic beside your own setup and on these items the arithmetic is noise.
  const chainOpen = t.setupBox && prec?.figures !== 1;
  return `<div class="feedback">${head}</div>${routeHtml}${precHtml}${
    steps ? `<details class="working" ${chainOpen ? 'open' : ''}>
      <summary>${esc(it.workings.formulaText ?? 'How it is worked')}</summary>
      <ol class="steps">${steps}</ol></details>` : ''
    }${t.showSpread ? `<div class="spread">Closest two options differ by ${spread(it)}</div>` : ''}`;
}

export function nextLabel(run) {
  const revealed = run.session.toggles.instantFeedback && run.cur.submitted;
  return revealed ? (run.index === run.items.length - 1 ? 'Finish' : 'Next') : 'Submit';
}

export function questionHtml(run) {
  const it = run.current, t = run.session.toggles;
  const cl = run.isClassify;
  return `
    <div class="segbar">${run.items.map((_, i) =>
      `<span class="seg${i < run.index ? ' done' : i === run.index ? ' now' : ''}"></span>`).join('')}</div>
    <div class="two-col">
      <section class="stimulus">
        ${!cl && t.showArchetype ? `<div class="arch-name">${esc(it.archetypeId.toUpperCase())} · ${esc(run.currentName ?? '')}</div>` : ''}
        ${it.stimulus.text ? `<p>${esc(it.stimulus.text)}</p>` : ''}
        ${it.stimulus.table ? tableHtml(it.stimulus.table) : ''}
        ${it.stimulus.chart ? chartSvg(it.stimulus.chart) : ''}
        ${cl ? `<p class="qtext">${esc(it.questionText)}</p>` : ''}
      </section>
      <section>
        <p class="qtext">${cl ? 'Which archetype is this? Do not solve it.' : esc(it.questionText)}</p>
        <ul class="options" data-slot="options">${optionsHtml(run)}</ul>
        ${!cl && t.setupBox ? `<div class="setup-row"><label for="setup">SETUP</label>
          <input id="setup" type="text" spellcheck="false" autocomplete="off"
                 placeholder="type the expression before computing" value="${esc(run.cur.setupText)}"></div>` : ''}
        <div data-slot="feedback">${feedbackHtml(run)}</div>
        <div class="btn-row">
          ${!cl && t.backNav ? `<button class="btn" data-act="back" ${run.index === 0 ? 'disabled' : ''}>Back</button>` : ''}
          <button class="btn btn-primary" data-act="next">${nextLabel(run)}</button>
        </div>
      </section>
    </div>`;
}

// Called on an item change only. Wires the listeners once, by delegation on the option list, so a
// slot repaint cannot orphan them.
export function renderQuestion(run, handlers) {
  const screen = $('#screen');
  screen.innerHTML = questionHtml(run);
  screen.querySelector('[data-slot="options"]')?.addEventListener('click', e => {
    const b = e.target.closest('[data-opt]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    handlers.choose(Number(b.dataset.opt));
  });
  screen.querySelector('[data-act="next"]')?.addEventListener('click', handlers.advance);
  screen.querySelector('[data-act="back"]')?.addEventListener('click', handlers.back);
  const setup = $('#setup');
  if (setup) setup.addEventListener('input', () => run.setupKey(setup.value));
}

export const renderClassify = renderQuestion;

// Called on choose and on submit. Touches the two slots and the button label, nothing else, so the
// stimulus, the scroll position, the focus ring and the running clock all survive.
export function paintOptions(run) {
  const screen = $('#screen');
  const opts = screen.querySelector('[data-slot="options"]');
  if (!opts) return false;
  opts.innerHTML = optionsHtml(run);
  const fb = screen.querySelector('[data-slot="feedback"]');
  if (fb) fb.innerHTML = feedbackHtml(run);
  const next = screen.querySelector('[data-act="next"]');
  if (next) next.textContent = nextLabel(run);
  return true;
}

// The closest pair, as a share of the LARGER magnitude.
//
// This divided by the lower neighbour, which can legitimately be zero: a13 carries a "Does not
// change" option at zero and the spec exempts zero-magnitude verdicts from the ratio guards
// precisely because they are valid. That gap became Infinity, Math.min discarded it, and the line
// silently reported the SECOND closest pair on the one archetype where the sign is the whole
// question. Dividing by the larger magnitude also matches validate's own minimum-gap definition,
// "2% of the larger", so the number on screen and the invariant behind it now agree.
function spread(it) {
  const vals = it.options.map(o => o.value).filter(v => typeof v === 'number');
  if (vals.length < 2) return 'n/a';
  const sorted = [...vals].sort((a, b) => a - b);
  let best = Infinity, pair = null;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d < best) { best = d; pair = [sorted[i - 1], sorted[i]]; }
  }
  if (!pair) return 'n/a';
  const larger = Math.max(Math.abs(pair[0]), Math.abs(pair[1]));
  return larger > 0 ? `${(100 * best / larger).toFixed(1)}%` : 'n/a';
}

// PROBLEM 1. A short session says so.
//
// `session.length` used to be the DELIVERED count, so a Desk 02 exam that asked for twenty items and
// built nineteen recorded nineteen and nothing anywhere disagreed. Both numbers are stored now, and a
// shortfall is stated here rather than left to be noticed. It is worth saying loudly: a score out of
// a denominator you did not choose is not a measurement of the skill, which is the whole purpose of
// Exam mode.
export function shortfallNotice(run) {
  const asked = run.session.requestedLength, got = run.items.length;
  if (!asked || got >= asked) return '';
  return `<p class="shortfall"><b>${got} items, not the ${asked} you asked for.</b> `
    + 'Some tables could not host every question type in scope. Treat the score as out of '
    + `${got}, and do not compare it with a full-length run.</p>`;
}

export function renderReview(run) {
  $('#session-bar').innerHTML = '';
  const st = run.stats();
  const rows = run.items.map((it, i) => {
    const r = run.responseFor(i);
    if (run.isClassify) {
      const picked = r && r.chosenIndex !== null ? it.classifyChoices[r.chosenIndex] : null;
      return `<tr class="${r && !r.correct ? 'wrong' : ''}">
        <td class="num">${i + 1}</td><td>${esc(run.names[i])}</td>
        <td colspan="2">${picked ? esc(picked.name) : r?.skipped ? 'skipped' : 'blank'}</td>
        <td>${r?.correct ? 'named right' : 'wrong archetype'}</td>
        <td class="num">n/a</td><td class="num">${r ? Math.round(r.msToSubmit / 1000) + 's' : 'n/a'}</td></tr>`;
    }
    const chosen = r && r.chosenIndex !== null ? it.options[r.chosenIndex] : null;
    const wrong = r && !r.correct;
    return `<tr class="expandable${wrong ? ' wrong' : ''}" data-row="${i}">
      <td class="num">${i + 1}</td><td>${esc(run.names[i])}</td>
      <td class="num">${chosen ? esc(chosen.display) : r?.skipped ? 'skipped' : 'blank'}</td>
      <td class="num">${esc(it.correct.display)}</td>
      <td>${r?.correct ? 'correct' : chosen ? esc(chosen.note) : r?.timedOut ? 'ran out of time' : 'not answered'}</td>
      <td class="num">${r?.msToFirstSetupKey ? Math.round(r.msToFirstSetupKey / 1000) + 's' : 'n/a'}</td>
      <td class="num">${r ? Math.round(r.msToSubmit / 1000) + 's' : 'n/a'}</td></tr>
      <tr class="detail" data-detail="${i}" hidden><td colspan="7">
        <div class="steps">${it.workings.steps.map(esc).join('<br>')}</div>
        <ul>${it.options.map(o => `<li><b class="mono">${esc(o.display)}</b> ${
          o.role === 'correct' ? 'correct' : esc(o.note)}${
          o.errorType ? ` <span class="empty mono">${esc(o.errorType)}</span>` : ''}</li>`).join('')}</ul>
      </td></tr>`;
  }).join('');

  $('#screen').innerHTML = `
    <div class="eyebrow">SESSION REVIEW</div>
    <h1>${st.correct} of ${st.answered} correct</h1>
    ${shortfallNotice(run)}
    <p class="purpose">${st.skipped ? st.skipped + ' not answered. ' : ''}Seed
      <span class="mono">${run.session.sessionSeed}</span>${
      run.session.blurEvents.length ? ` · ${run.session.blurEvents.length} tab switch(es) over five seconds` : ''}</p>
    <table class="grid"><thead><tr><th class="num">#</th><th>Archetype</th><th class="num">Yours</th>
      <th class="num">Correct</th><th>What went wrong</th><th class="num">Comprehension</th>
      <th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="btn-row"><button class="btn" data-go="#home">Done</button></div>`;

  $('#screen').querySelectorAll('[data-row]').forEach(tr => tr.addEventListener('click', () => {
    const d = $(`[data-detail="${tr.dataset.row}"]`);
    d.hidden = !d.hidden;
  }));
}

// Analytics now lives in js/dashboard.js, which the spec names as the home for the analytics panels
// and their SVG charts. Left here as a pointer so nothing imports a function that moved.

export function renderResumePrompt(saved, onResume, onDiscard) {
  $('#screen').innerHTML = `
    <div class="eyebrow">UNFINISHED SESSION</div>
    <h1>Pick up where you left off?</h1>
    <p class="purpose">${DESKS[saved.desk].name}, ${esc(saved.mode)} mode, started
      ${esc(saved.startedAt?.slice(0, 16).replace('T', ' '))}, ${(saved.responses ?? []).length} answered.</p>
    <div class="btn-row"><button class="btn" data-act="discard">Discard</button>
      <button class="btn btn-primary" data-act="resume">Resume</button></div>`;
  $('#screen').querySelector('[data-act="resume"]').addEventListener('click', onResume);
  $('#screen').querySelector('[data-act="discard"]').addEventListener('click', onDiscard);
}
