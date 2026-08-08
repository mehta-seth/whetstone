// localStorage read and write, mastery bookkeeping, CSV export.
// Storage is required and correct here: this is a local page served over http.
import { byId } from './archetypes/index.js';

const K = {
  sessions: 'whetstone:sessions',
  mastery:  'whetstone:mastery',
  presets:  'whetstone:presets',
  flags:    'whetstone:flags',
  settings: 'whetstone:settings',
  active:   'whetstone:activeSession',   // in-progress run, so a reload does not lose it
  // The spec requires classification accuracy to be stored separately from solving
  // accuracy, because they are different skills. The spec lists no key for it, so one
  // is added here on the same footing as whetstone:activeSession above. It is deliberately
  // not merged into whetstone:mastery: naming an archetype is not solving it, and letting
  // Classify sessions move the mastery scores would corrupt the selection weights.
  classify: 'whetstone:classify',
};
export const KEYS = K;


export function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); }
  catch { return fallback; }
}
export function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.error('whetstone: storage write failed', e); return false; }
}

export const sessions  = () => read(K.sessions, []);
export const mastery   = () => read(K.mastery, {});
export const presets   = () => read(K.presets, {});
export const flags     = () => read(K.flags, []);
export const settings  = () => read(K.settings, {});
export const active    = () => read(K.active, null);
export const classify  = () => read(K.classify, {});

export const saveSettings = s => write(K.settings, { ...settings(), ...s });
export const savePreset   = (name, toggles) => write(K.presets, { ...presets(), [name]: toggles });
export const saveActive   = s => write(K.active, s);
export const clearActive  = () => localStorage.removeItem(K.active);

export function addFlag(entry) {
  const all = flags(); all.push(entry); write(K.flags, all); return all.length;
}

// An attempt is an answered item. Skipped and timed-out items are logged in the
// session but never touch attempts, correct or medianMs, or one rushed exam would
// wreck every mastery score at once.
export function applyResponse(response) {
  if (response.skipped) return;
  // A Classify response names an archetype rather than solving an item, so it goes to its own
  // key and never touches mastery, medianMs or the error counts.
  if (response.mode === 'classify') { applyClassification(response); return; }
  const m = mastery();
  const a = m[response.archetypeId] ?? { attempts: 0, correct: 0, recentMs: [], medianMs: null, lastSeen: null, errorCounts: {} };
  a.attempts += 1;
  if (response.correct) a.correct += 1;
  // PROBLEM 2. THE SPEED TERM COUNTS CORRECT RESPONSES ONLY, and before this it counted every
  // answered item. 13.2 divides targetSeconds by medianMs and caps the term at 1, so a fast wrong
  // answer scored full marks on speed:
  //
  //   8 attempts, 0 correct, answered in 2s     mastery 0.417   weight 0.583
  //   8 attempts, 0 correct, answered in 150s   mastery 0.283   weight 0.717
  //
  // Guessing instantly on your weakest archetype lowered its selection weight by 19%, so the
  // adaptive engine showed you LESS of what you were worst at. That inverts the one thing the tool
  // exists to do. The spec already excludes skips from medianMs for the same reason, that a rushed
  // session would otherwise wreck every score at once; a fast wrong answer is the same event with a
  // keystroke attached. Accuracy still counts every attempt, so guessing is not rewarded twice.
  if (response.correct) {
    a.recentMs = [...(a.recentMs ?? []), response.msToSubmit].slice(-10);
    const sorted = [...a.recentMs].sort((x, y) => x - y);
    const mid = sorted.length >> 1;
    a.medianMs = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  a.lastSeen = new Date().toISOString();
  if (!response.correct && response.errorType) {
    a.errorCounts[response.errorType] = (a.errorCounts[response.errorType] ?? 0) + 1;
  }
  m[response.archetypeId] = a;
  write(K.mastery, m);
}

// Classification bookkeeping. Kept parallel to applyResponse but writing to its own key.
export function applyClassification(response) {
  if (response.skipped) return;
  const m = classify();
  const a = m[response.archetypeId] ?? { attempts: 0, correct: 0, confusions: {} };
  a.attempts += 1;
  if (response.classifiedCorrectly) a.correct += 1;
  else if (response.chosenArchetypeId) {
    a.confusions[response.chosenArchetypeId] = (a.confusions[response.chosenArchetypeId] ?? 0) + 1;
  }
  m[response.archetypeId] = a;
  write(K.classify, m);
}

export function finishSession(session) {
  const all = sessions();
  all.push({ ...session, finishedAt: new Date().toISOString() });
  write(K.sessions, all);
  clearActive();
}

export function abandonSession(session) {
  const all = sessions();
  all.push({ ...session, abandoned: true, finishedAt: new Date().toISOString() });
  write(K.sessions, all);
  clearActive();
}

const CSV_COLUMNS = ['date', 'session_id', 'desk', 'mode', 'tier', 'archetype_id', 'archetype_name',
  'group', 'seed', 'answer_type', 'chosen_value', 'correct_value', 'correct', 'error_type',
  'setup_text', 'ms_to_setup', 'ms_to_submit', 'target_seconds', 'skipped', 'flagged',
  // Columns 21 and 22, and the spec is amended to match. The export exists to
  // capture the cost of the FIRST question on a shared stimulus against the ones that follow it,
  // and until now those two fields lived on the Response and in localStorage but never reached
  // the CSV, so the one number that session was for could not be analysed outside the browser.
  // Empty on Desk 01, where every item owns its stimulus.
  'stimulus_id', 'first_on_stimulus'];

const cell = v => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function toCsv(list = sessions()) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const s of list) {
    if (s.abandoned) continue;
    for (const r of s.responses ?? []) {
      const arch = byId[r.archetypeId] ?? {};
      // The 10.5 column list is pinned, so a Classify row reuses chosen_value and correct_value
      // for the archetype named and the archetype it actually was. Without this the row records
      // nothing about the classification, which would make the exported history lossy for a
      // whole mode. The `mode` column is what tells the two kinds of row apart in pandas.
      const isClassify = r.mode === 'classify';
      const chosen  = isClassify ? r.chosenArchetypeId : r.chosenValue;
      const correct = isClassify ? r.archetypeId : r.correctValue;
      rows.push([s.startedAt?.slice(0, 10), s.id, s.desk, s.mode, s.tier, r.archetypeId,
        arch.name, arch.group, r.seed, r.answerType, chosen, correct,
        r.correct, r.errorType, r.setupText, r.msToFirstSetupKey, r.msToSubmit,
        r.targetSeconds, r.skipped, r.flagged,
        r.stimulusId ?? '', r.firstOnStimulus ?? ''].map(cell).join(','));
    }
  }
  return rows.join('\n');
}

// A page served over HTTP cannot write to the filesystem, so this
// downloads. Keep the file in logs/, which is not version controlled. The weekly task is
// two steps, not one.
export function downloadCsv() {
  const name = `whetstone-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(new Blob([toCsv()], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  // PROBLEM 4. THE ANCHOR HAS TO BE IN THE DOCUMENT. Clicking a detached one works in Chrome
  // and has historically not worked in Safari, and this app is served from a Mac. Silent failure is
  // the bad case: The spec's weekly task is one click and there would be nothing to say it had not
  // happened. Removed again straight away so the DOM contract in 11.4 is unchanged between calls.
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
