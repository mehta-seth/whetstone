// Hash router, screen mounting, keyboard handling.
import * as R from './render.js';
import { renderDashboard } from './dashboard.js';
import * as store from './store.js';
import { DESKS, createRun, inScope } from './session.js';
import { defaultsFor, changedKeys, TIERS } from './toggles.js';
import { makeClock, mmss, trackVisibility, elapsedSince } from './timer.js';

const $ = sel => document.querySelector(sel);

let run = null;               // the live session, if any
let sessionClock = null;
let itemClock = null;
let untrack = null;

const uiState = {};           // per desk

// Settings persist in localStorage, so a browser that used an older build can hold a
// tier name no archetype declares any more. Left unchecked that silently filters the
// pool to nothing and the setup screen offers a session it cannot build, so an
// unrecognised value falls back rather than propagating.
const validTier = t => (TIERS.some(x => x.id === t) ? t : 'standard');

function ui(deskId) {
  if (!uiState[deskId]) {
    const saved = store.settings().setup?.[deskId] ?? {};
    uiState[deskId] = {
      mode: saved.mode ?? 'practice',
      tier: validTier(saved.tier),
      groups: saved.groups ?? [],
      length: saved.length ?? DESKS[deskId].items,
      overrides: saved.overrides ?? {},
      optsOpen: false,
    };
  }
  return uiState[deskId];
}
function persist(deskId) {
  const s = ui(deskId);
  store.saveSettings({ setup: { ...(store.settings().setup ?? {}), [deskId]: {
    mode: s.mode, tier: s.tier, groups: s.groups, length: s.length, overrides: s.overrides } } });
}

function teardown() {
  sessionClock?.stop(); itemClock?.stop(); untrack?.();
  sessionClock = itemClock = untrack = null;
  $('#session-bar').innerHTML = '';
}

// FIX C. Returning to a live session rebuilds what teardown stopped. The clocks restart from their
// elapsed time under fix B, so a lap through Analytics costs you the real seconds it took and not
// a fresh allowance.
function resumeClocks() {
  if (!run || run.finished) return;
  if (!sessionClock) startSessionClock();
  if (!untrack) untrack = trackVisibility(e => run.noteBlur(e));
}

// ---------- setup screen ----------
function mountSetup(deskId) {
  const state = ui(deskId);
  R.renderSetup(deskId, state, () => startSession(deskId));
  const screen = $('#screen');

  screen.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode; state.overrides = {}; persist(deskId); mountSetup(deskId);
  }));
  screen.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.group;
    state.groups = state.groups.includes(g) ? state.groups.filter(x => x !== g) : [...state.groups, g];
    persist(deskId); mountSetup(deskId);
  }));
  screen.querySelectorAll('[data-tier]').forEach(b => b.addEventListener('click', () => {
    state.tier = b.dataset.tier; persist(deskId); mountSetup(deskId);
  }));
  screen.querySelectorAll('[data-length]').forEach(b => b.addEventListener('click', () => {
    state.length = Number(b.dataset.length); persist(deskId); mountSetup(deskId);
  }));
  screen.querySelectorAll('[data-order]').forEach(b => b.addEventListener('click', () => {
    state.optsOpen = true;
    setOverride(deskId, 'optionOrder', b.dataset.order); mountSetup(deskId);
  }));
  screen.querySelectorAll('[data-toggle]').forEach(cb => cb.addEventListener('change', () => {
    state.optsOpen = true;
    setOverride(deskId, cb.dataset.toggle, cb.checked); mountSetup(deskId);
  }));
  screen.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
    state.overrides = {}; state.optsOpen = true; persist(deskId); mountSetup(deskId);
  });
  screen.querySelector('[data-act="preset"]')?.addEventListener('click', () => {
    const name = prompt('Name this preset');
    if (!name) return;
    store.savePreset(name, { ...defaultsFor(state.mode, deskId), ...state.overrides });
    R.toast(`Preset "${name}" saved`);
  });
}

function setOverride(deskId, key, value) {
  const state = ui(deskId);
  const d = defaultsFor(state.mode, deskId);
  if (d[key] === value) delete state.overrides[key];
  else state.overrides[key] = value;
  persist(deskId);
}

// ---------- session ----------
function startSession(deskId, restore = null) {
  const state = ui(deskId);
  const toggles = { ...defaultsFor(state.mode, deskId), ...state.overrides };
  if (!inScope({ desk: deskId, tier: state.tier, groups: state.groups }).length) {
    R.toast('Nothing in scope. Widen the filters.'); return;
  }
  store.saveSettings({ lastDesk: deskId });
  run = createRun(restore ?? {
    desk: deskId, mode: state.mode, tier: state.tier,
    groups: state.groups, length: state.length, toggles,
  });
  if (!run.items.length) { R.toast('Could not generate any items. Widen the filters.'); return; }
  store.saveActive({ ...run.session, index: 0 });

  untrack = trackVisibility(e => run.noteBlur(e));
  startSessionClock();
  location.hash = '#session';
  draw();
}

// Built here rather than inline so that returning to a live session can rebuild it. Starts from the
// elapsed time, never from zero.
function startSessionClock() {
  if (!run || !run.session.toggles.sessionClock) return;
  sessionClock = makeClock({
    durationMs: run.durationMs,
    onTick: ({ remaining }) => paintBar(remaining),
    onExpire: () => { run.expire(); showReview(); },
  });
  sessionClock.start(elapsedSince(run.session.startedAt));
}

function paintBar(remaining) {
  if (!run || run.finished) return;
  R.renderSessionBar(run, remaining ?? (sessionClock ? sessionClock.remaining() : null));
  if (itemClock) {
    const el = $('#item-clock');
    if (el) el.textContent = mmss(Math.max(0, run.perItemMs(run.current) - itemClock.elapsed()));
  }
}

function draw() {
  if (!run) { location.hash = '#home'; return; }
  paintBar(sessionClock?.remaining() ?? null);
  R.renderQuestion(run, { choose, advance, back: () => { if (run.back()) draw(); } });
  itemClock?.stop();
  if (run.session.toggles.perItemClock && !run.cur.submitted) {
    itemClock = makeClock({
      durationMs: run.perItemMs(run.current),
      onTick: () => paintBar(sessionClock?.remaining() ?? null),
      onExpire: () => { if (!run.cur.submitted) { run.commit({ timedOut: true }); R.toast('Out of time on that item'); advanceAfterCommit(); } },
    });
    itemClock.start(run.cur.accumulatedMs ?? 0);
  }
}

// Choosing repaints the two slots, never the document.
//
// This used to call draw(), which assigns #screen.innerHTML wholesale. Three things followed, all of
// them things a person notices and a test never would. The scroll position reset to the top, so on a
// seven-entity table you scrolled back down for every answer. Keyboard focus fell to body, so Tab
// restarted from the sidebar. Any chart SVG was rebuilt and flickered.
//
// And a fourth that is worse than cosmetic: draw() recreates the per-item clock and starts it from
// zero, so in Tempo changing your mind once bought a fresh 83 seconds and in Classify a fresh 10.
// The two modes whose whole purpose is time pressure had none. Not calling draw() here is the fix
// for that as well, because the clock is only ever built by draw().
function choose(i) {
  if (!run.choose(i)) return;
  if (!R.paintOptions(run)) draw();      // fall back if the slots are somehow absent
}

function advance() {
  const t = run.session.toggles;
  if (!run.cur.submitted) {
    if (!run.canAdvance()) { R.toast('Blanks are blocked in this mode. Pick an option.'); return; }
    run.commit();
    // The reveal is a slot repaint too, so submitting does not throw away your scroll position
    // just as you want to read the feedback.
    if (t.instantFeedback) { itemClock?.stop(); if (!R.paintOptions(run)) draw(); return; }
  }
  advanceAfterCommit();
}

function advanceAfterCommit() {
  itemClock?.stop();
  if (!run.next()) { showReview(); return; }
  draw();
}

function skip() {
  if (!run.skipIsAllowed()) { R.toast('Blanks are blocked in this mode.'); return; }
  if (!run.cur.submitted) run.commit({ skipped: true });
  advanceAfterCommit();
}

function showReview() {
  teardown();
  R.renderReview(run);
  location.hash = '#review';
}

// ---------- routing ----------
function route() {
  const hash = location.hash || '#home';
  if (hash !== '#session' && hash !== '#review') teardown();
  R.chrome(hash.slice(1), run && !run.finished
    ? `${run.index + 1}/${run.items.length}` : null);

  if (hash === '#session') {
    if (run && !run.finished) { resumeClocks(); draw(); } else location.hash = '#home';
    return;
  }
  if (hash === '#review') { if (run) R.renderReview(run); else location.hash = '#home'; return; }
  if (hash === '#desk1') return mountSetup(1);
  if (hash === '#desk2') return mountSetup(2);
  if (hash === '#analytics') return mountDashboard();

  const saved = store.active();
  if (saved && !saved.finishedAt) {
    return R.renderResumePrompt(saved,
      () => { R.toast('Rebuilding from the stored seed'); resume(saved); },
      () => { store.abandonSession(saved); R.toast('Session abandoned'); location.hash = '#home'; route(); });
  }
  R.renderHome();
}

function mountDashboard() {
  const deskId = store.settings().lastDesk ?? 1;
  const { csvButton } = renderDashboard(deskId, () => mountDashboard());
  csvButton?.addEventListener('click', () => {
    const name = store.downloadCsv();
    R.toast(`${name} downloaded. Saved to logs/, which stays out of version control.`);
  });
}

// Responses are written on every answer, so a reload mid-session must not lose
// them. The item list is rebuilt from the stored seed, which is why the seed is
// stored in the first place.
function resume(saved) {
  const deskState = ui(saved.desk);
  deskState.mode = saved.mode; deskState.tier = saved.tier;
  deskState.groups = saved.groups ?? []; deskState.length = saved.length;
  startSession(saved.desk, {
    desk: saved.desk, mode: saved.mode, tier: saved.tier, groups: saved.groups,
    length: saved.length, toggles: saved.toggles, sessionSeed: saved.sessionSeed,
    id: saved.id, startedAt: saved.startedAt,
  });
  if (!run) return;
  for (const r of saved.responses ?? []) {
    const i = run.items.findIndex(it => it.id === r.itemId);
    if (i >= 0) {
      Object.assign(run.state[i], {
        chosenIndex: r.chosenIndex, setupText: r.setupText ?? '', submitted: true,
        skipped: r.skipped, flagged: r.flagged, accumulatedMs: r.msToSubmit,
        msToFirstSetupKey: r.msToFirstSetupKey, shownAt: null,
      });
      run.session.responses.push(r);
    }
  }
  const firstOpen = run.state.findIndex(s => !s.submitted);
  run.goto(firstOpen === -1 ? run.items.length - 1 : firstOpen);
  draw();
}

// ---------- keyboard ----------
// One rule: everything is ignored while focus is inside a text input, so typing 3
// in the Setup box types a 3. Tab is never trapped.
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!run || run.finished || location.hash !== '#session') return;
  if (e.key >= '1' && e.key <= '8') {
    const i = Number(e.key) - 1;
    if (i < run.optionCount()) { e.preventDefault(); choose(i); }
  } else if (e.key === 'Enter') { e.preventDefault(); advance(); }
  else if (e.key === 'Escape') { e.preventDefault(); skip(); }
  else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    R.toast(run.flag() ? 'Flagged for review' : 'Flag removed');
    paintBar(sessionClock?.remaining() ?? null);
  }
});

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { location.hash = go.dataset.go; }
});


window.addEventListener('hashchange', route);
route();
