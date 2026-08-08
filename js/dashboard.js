// Analytics panels and the visible weight table. The spec.
//
// The weight table is required, not optional. Adaptation you can inspect and switch off is
// trustworthy; invisible adaptation is not. It shows every archetype in scope with its mastery
// score and its expected share of the next session, and the adaptive toggle that switches it off
// is reachable from this page.
//
// "Overridable" is read as nothing beyond what already exists: the adaptive toggle turns the
// weighting off, and the group and tier filters on the setup screen already steer selection. A
// per-archetype mute or boost would duplicate the group filter at finer grain for a need that has
// not appeared, and the spec says to ask before adding.
import { summarise, reviewDue, masteryFor } from './adaptive.js';
import { allArchetypes, inScope, DESKS } from './session.js';
import { byId } from './archetypes/index.js';
import * as store from './store.js';
import { AT_TARGET_MASTERY, AT_TARGET_MIN_ATTEMPTS, ARCHETYPE_SHARE_CAP } from './lib/constants.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Share of the library at target above which breadth stops being the binding constraint.
const COVERAGE_GOAL_PCT = 90;
const pc = (n, d) => (d ? Math.round(100 * n / d) : 0);
const secs = ms => ms ? Math.round(ms / 1000) + 's' : 'n/a';

// Every non-abandoned session, oldest first.
const played = () => store.sessions().filter(s => !s.abandoned && (s.responses ?? []).length);

function solved() {
  const out = [];
  for (const s of played()) for (const r of s.responses ?? []) if (r.mode !== 'classify') out.push(r);
  return out;
}

// Panel 1. Archetypes at target, as a count and a list, plus a coverage note.
function atTargetPanel(rows) {
  const at = rows.filter(r => r.atTarget);
  const total = allArchetypes.length;
  const share = pc(at.length, total);
  return `
    <h2>At target</h2>
    <p class="purpose"><b>${at.length}</b> of ${total} at target, meaning mastery
      ${AT_TARGET_MASTERY} or better across at least ${AT_TARGET_MIN_ATTEMPTS} attempts.</p>
    ${at.length ? `<ul class="tag-list">${at.map(r =>
      `<li>${esc(r.name)} <span class="empty mono">${r.mastery.toFixed(2)}</span></li>`).join('')}</ul>`
      : '<p class="empty">Nothing at target yet.</p>'}
    <div class="coverage-note${share >= COVERAGE_GOAL_PCT ? ' hit' : ''}">
      ${share >= COVERAGE_GOAL_PCT
        ? `<b>${share}% of the library is at target.</b> Breadth is no longer the constraint;
           from here, Review due and Tempo are worth more than new coverage.`
        : `${share}% of the library is at target. Breadth first: an archetype you have never
           seen costs more on the clock than one you are merely slow at.`}
    </div>`;
}

// Panel 2. Accuracy by archetype, worst first.
function accuracyPanel(rows) {
  const measured = rows.filter(r => r.attempts > 0).sort((a, b) => a.mastery - b.mastery);
  if (!measured.length) return '<h2>Accuracy by archetype</h2><p class="empty">No answered items yet.</p>';
  return `
    <h2>Accuracy by archetype, worst first</h2>
    <table class="grid"><thead><tr><th>Archetype</th><th>Group</th><th class="num">Attempts</th>
      <th class="num">Correct</th><th class="num">Accuracy</th><th class="num">Median</th>
      <th class="num">Target</th></tr></thead><tbody>
      ${measured.map(r => `<tr${r.atTarget ? ' class="at-target"' : ''}>
        <td>${esc(r.name)}</td><td class="empty">${esc(r.group)}</td>
        <td class="num">${r.attempts}</td><td class="num">${r.correct}</td>
        <td class="num">${pc(r.correct, r.attempts)}%</td>
        <td class="num">${secs(r.medianMs)}</td>
        <td class="num empty">${byId[r.id]?.targetSeconds ?? ''}s</td></tr>`).join('')}
    </tbody></table>`;
}

// Panel 3. Comprehension time against arithmetic time, as a split bar per archetype.
// This is the most diagnostically useful number the app produces: the Setup box timestamps the
// moment the question was understood, so the split says whether the time goes on reading or on
// calculating. Only sessions with the Setup box on contribute.
function splitPanel() {
  const acc = {};
  for (const r of solved()) {
    if (r.msToFirstSetupKey == null || r.skipped) continue;
    const a = acc[r.archetypeId] ?? (acc[r.archetypeId] = { comp: [], total: [] });
    a.comp.push(r.msToFirstSetupKey);
    a.total.push(r.msToSubmit);
  }
  const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
  const rows = Object.entries(acc).map(([id, a]) => {
    const comp = med(a.comp), total = med(a.total);
    return { id, name: byId[id]?.name ?? id, comp, arith: Math.max(0, total - comp), total, n: a.comp.length };
  }).sort((a, b) => b.comp / b.total - a.comp / a.total);
  if (!rows.length) {
    return `<h2>Comprehension against arithmetic</h2>
      <p class="empty">Nothing yet. Turn the Setup box on and type the expression before computing;
      the first keystroke is what splits the two.</p>`;
  }
  const widest = Math.max(...rows.map(r => r.total));
  return `
    <h2>Comprehension against arithmetic</h2>
    <p class="purpose">Median split per archetype, from the first keystroke in the Setup box.
      Sorted by the share spent reading rather than calculating.</p>
    <div class="split-list">${rows.map(r => `
      <div class="split-row">
        <div class="split-label">${esc(r.name)} <span class="empty">${r.n}</span></div>
        <div class="split-bar" style="width:${Math.round(100 * r.total / widest)}%">
          <span class="seg-comp" style="flex:${r.comp}" title="comprehension ${secs(r.comp)}"></span>
          <span class="seg-arith" style="flex:${r.arith}" title="arithmetic ${secs(r.arith)}"></span>
        </div>
        <div class="split-nums mono">${secs(r.comp)} + ${secs(r.arith)}</div>
      </div>`).join('')}</div>
    <div class="legend"><span class="key seg-comp"></span> comprehension
      <span class="key seg-arith"></span> arithmetic</div>`;
}

// Panel 4. Error types ranked, phrased as the spec asks: "wrong percentage base: 7 of your last 12".
function errorPanel() {
  const wrong = solved().filter(r => !r.correct && !r.skipped && r.errorType);
  const recent = wrong.slice(-12);
  const counts = {};
  for (const r of wrong) counts[r.errorType] = (counts[r.errorType] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!ranked.length) return '<h2>Error types ranked</h2><p class="empty">No errors logged yet.</p>';
  const recentCount = k => recent.filter(r => r.errorType === k).length;
  return `
    <h2>Error types ranked</h2>
    <table class="grid"><thead><tr><th>Mistake family</th><th class="num">All time</th>
      <th class="num">Share</th><th>Recent</th></tr></thead><tbody>
      ${ranked.map(([k, n]) => `<tr><td class="mono">${esc(k)}</td><td class="num">${n}</td>
        <td class="num">${pc(n, wrong.length)}%</td>
        <td class="empty">${recentCount(k)} of your last ${recent.length} errors</td></tr>`).join('')}
    </tbody></table>`;
}

// Panel 5. Accuracy trend across sessions.
function trendPanel() {
  const pts = played().map(s => {
    const a = (s.responses ?? []).filter(r => !r.skipped && r.mode !== 'classify');
    return { date: s.startedAt?.slice(0, 10), mode: s.mode, n: a.length,
      acc: a.length ? a.filter(r => r.correct).length / a.length : null };
  }).filter(p => p.acc !== null);
  if (pts.length < 2) return '<h2>Accuracy trend</h2><p class="empty">Two finished sessions needed before a trend means anything.</p>';
  const W = 640, H = 130, pad = 22;
  const x = i => pad + i * (W - 2 * pad) / Math.max(1, pts.length - 1);
  const y = v => H - pad - v * (H - 2 * pad);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.acc).toFixed(1)}`).join(' ');
  return `
    <h2>Accuracy trend</h2>
    <svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="accuracy by session">
      ${[0, 0.5, 1].map(v => `<line x1="${pad}" y1="${y(v)}" x2="${W - pad}" y2="${y(v)}" class="gl"></line>
        <text x="2" y="${y(v) + 4}" class="ax">${v * 100}%</text>`).join('')}
      <path d="${path}" class="tl"></path>
      ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.acc).toFixed(1)}" r="3.5"
        class="tp"><title>${esc(p.date)} ${esc(p.mode)}: ${Math.round(100 * p.acc)}% of ${p.n}</title></circle>`).join('')}
    </svg>`;
}

// Panel 6. The weight table. Required by 5.3, not optional.
function weightPanel(rows, deskId, adaptiveOn) {
  const total = rows.reduce((s, r) => s + r.weight, 0);
  const length = DESKS[deskId].items;
  const cap = Math.max(Math.ceil(ARCHETYPE_SHARE_CAP * length), Math.ceil(length / Math.max(1, rows.length)));
  const sorted = [...rows].sort((a, b) => b.weight - a.weight);
  return `
    <h2>The weight table</h2>
    <p class="purpose">Every archetype in scope for ${DESKS[deskId].name}, with its mastery score and its
      expected share of the next ${length} item session. Adaptive weighting is currently
      <b>${adaptiveOn ? 'on' : 'off, so selection is uniform'}</b>. No archetype may exceed
      ${cap} items in one session, and none may appear twice in a row.</p>
    <div class="btn-row" style="justify-content:flex-start">
      <button class="btn" data-act="toggle-adaptive">Turn adaptive weighting ${adaptiveOn ? 'off' : 'on'}</button>
    </div>
    <table class="grid"><thead><tr><th>Archetype</th><th class="num">Attempts</th>
      <th class="num">Mastery</th><th class="num">Weight</th><th class="num">Expected items</th>
      <th>Share of the next session</th></tr></thead><tbody>
      ${sorted.map(r => {
        const share = adaptiveOn ? r.weight / total : 1 / rows.length;
        const expected = Math.min(cap, share * length);
        return `<tr${r.atTarget ? ' class="at-target"' : ''}>
          <td>${esc(r.name)}${r.atTarget ? ' <span class="empty">at target</span>' : ''}</td>
          <td class="num">${r.attempts}</td><td class="num">${r.mastery.toFixed(2)}</td>
          <td class="num">${r.weight.toFixed(2)}</td>
          <td class="num">${expected.toFixed(1)}</td>
          <td><span class="wbar" style="width:${Math.round(100 * share / Math.max(...sorted.map(z =>
            adaptiveOn ? z.weight / total : 1 / rows.length)))}%"></span></td></tr>`;
      }).join('')}
    </tbody></table>`;
}

// Classification accuracy, stored separately from solving accuracy because they are different
// skills. The spec requires the separation; this panel is where it becomes visible.
function classifyPanel() {
  const m = store.classify();
  const rows = Object.entries(m).map(([id, a]) => ({
    id, name: byId[id]?.name ?? id, attempts: a.attempts, correct: a.correct,
    top: Object.entries(a.confusions ?? {}).sort((x, y) => y[1] - x[1])[0] ?? null,
  })).sort((a, b) => (a.correct / a.attempts) - (b.correct / b.attempts));
  if (!rows.length) {
    return `<h2>Classification</h2>
      <p class="empty">No Classify sessions yet. That mode trains the first ten seconds of an item,
      which is where knowing where to start comes from. It is scored separately from solving.</p>`;
  }
  return `
    <h2>Classification</h2>
    <p class="purpose">Naming the archetype without solving it. Stored separately from solving
      accuracy, because they are different skills.</p>
    <table class="grid"><thead><tr><th>Archetype</th><th class="num">Seen</th>
      <th class="num">Named right</th><th>Most often mistaken for</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.attempts}</td>
        <td class="num">${pc(r.correct, r.attempts)}%</td>
        <td class="empty">${r.top ? esc(byId[r.top[0]]?.name ?? r.top[0]) + ` (${r.top[1]})` : 'nothing'}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

export function renderDashboard(deskId, onToggleAdaptive) {
  const pool = inScope({ desk: deskId });
  const mastery = store.mastery();
  const rows = summarise(pool, mastery);
  const settings = store.settings();
  const adaptiveOn = settings.dashboardAdaptive !== false;
  const due = reviewDue(pool, mastery);

  $('#screen').innerHTML = `
    <div class="eyebrow">REVIEW</div><h1>Analytics</h1>
    <p class="purpose">${DESKS[deskId].name}. ${rows.length} archetypes in scope
      ${due.length ? `· ${due.length} due for review` : '· nothing due'}.</p>
    <div class="panel">${atTargetPanel(rows)}</div>
    <div class="panel">${weightPanel(rows, deskId, adaptiveOn)}</div>
    <div class="panel">${accuracyPanel(rows)}</div>
    <div class="panel">${splitPanel()}</div>
    <div class="panel">${errorPanel()}</div>
    <div class="panel">${trendPanel()}</div>
    <div class="panel">${classifyPanel()}</div>
    <div class="btn-row"><button class="btn" data-act="csv">Export CSV</button></div>`;

  $('#screen').querySelector('[data-act="toggle-adaptive"]')?.addEventListener('click', () => {
    store.saveSettings({ dashboardAdaptive: !adaptiveOn });
    onToggleAdaptive?.(!adaptiveOn);
  });
  return { csvButton: $('#screen').querySelector('[data-act="csv"]') };
}
