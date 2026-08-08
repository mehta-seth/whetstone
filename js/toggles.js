// Every behavioural difference between modes is a toggle. Modes are presets over
// those toggles, not separate code paths.
export const TOGGLE_DEFS = [
  { key: 'setupBox',       label: 'Setup box',        effect: 'Show the expression input. Captures comprehension time' },
  { key: 'backNav',        label: 'Back navigation',  effect: 'Allow returning to earlier questions' },
  { key: 'optionLetters',  label: 'Option letters',   effect: 'Render A to E badges rather than bare radios' },
  { key: 'perItemClock',   label: 'Per-item clock',   effect: 'Show a countdown for the current item at target tempo' },
  { key: 'sessionClock',   label: 'Session clock',    effect: 'Show the whole-session countdown' },
  { key: 'instantFeedback',label: 'Instant feedback', effect: 'Reveal correct or incorrect immediately after each answer' },
  { key: 'allowSkip',      label: 'Allow skip',       effect: 'Esc moves on without answering. Block blanks overrides this' },
  { key: 'blockBlanks',    label: 'Block blanks',     effect: 'Refuse to advance on an unanswered item' },
  { key: 'showArchetype',  label: 'Show archetype name', effect: 'Name the question type on the question screen' },
  { key: 'showSpread',     label: 'Show option spread',  effect: 'After answering, show the gap between the two closest options' },
  { key: 'adaptive',       label: 'Adaptive weighting',  effect: 'Weight selection toward weak archetypes. Off means uniform' },
  { key: 'timerWarning',   label: 'Timer warning',    effect: 'Visual pulse in the final 60 seconds' },
];

export const ORDER_CHOICES = ['ascending', 'shuffled', 'realistic'];

// Mode defaults, the spec. Two deliberate departures, both recorded:
//   Exam on desk 1 uses 'realistic' rather than 'shuffled'. Option sets in this
//   format are ascending far more often than chance, and a uniform shuffle of five
//   options lands ascending once in 120, so 'shuffled' would train option-scanning
//   habits the format does not reward.
//   Block blanks takes precedence over allow skip where both are on, which is
//   every exam session. The spec requires blanks to be blocked in exam mode.
const D = {
  practice: { setupBox: 0, backNav: 1, optionLetters: 0, perItemClock: 0, sessionClock: 0, instantFeedback: 1, allowSkip: 1, blockBlanks: 0, showArchetype: 1, showSpread: 1, adaptive: 1, timerWarning: 0, optionOrder: 'ascending' },
  tempo:    { setupBox: 0, backNav: 0, optionLetters: 0, perItemClock: 1, sessionClock: 1, instantFeedback: 1, allowSkip: 1, blockBlanks: 0, showArchetype: 0, showSpread: 1, adaptive: 1, timerWarning: 1, optionOrder: 'shuffled' },
  exam1:    { setupBox: 0, backNav: 0, optionLetters: 0, perItemClock: 0, sessionClock: 1, instantFeedback: 0, allowSkip: 1, blockBlanks: 1, showArchetype: 0, showSpread: 0, adaptive: 0, timerWarning: 1, optionOrder: 'realistic' },
  exam2:    { setupBox: 0, backNav: 1, optionLetters: 1, perItemClock: 0, sessionClock: 1, instantFeedback: 0, allowSkip: 1, blockBlanks: 1, showArchetype: 0, showSpread: 0, adaptive: 0, timerWarning: 1, optionOrder: 'ascending' },
  classify: { setupBox: 0, backNav: 0, optionLetters: 0, perItemClock: 1, sessionClock: 1, instantFeedback: 1, allowSkip: 1, blockBlanks: 0, showArchetype: 0, showSpread: 0, adaptive: 1, timerWarning: 1, optionOrder: 'shuffled' },
  review:   { setupBox: 0, backNav: 0, optionLetters: 0, perItemClock: 1, sessionClock: 0, instantFeedback: 1, allowSkip: 1, blockBlanks: 0, showArchetype: 1, showSpread: 1, adaptive: 1, timerWarning: 0, optionOrder: 'shuffled' },
};

// Difficulty bands, in ascending order. An archetype declares which it appears in.
export const TIERS = [
  { id: 'warmup',   name: 'Warm-up'  },
  { id: 'standard', name: 'Standard' },
  { id: 'hard',     name: 'Hard'     },
];

export const MODES = [
  { id: 'practice', name: 'Practice', desc: 'No clock, feedback after every question' },
  { id: 'tempo',    name: 'Tempo',    desc: 'Per-item clock at target pace' },
  { id: 'exam',     name: 'Exam',     desc: 'One clock, feedback at the end only' },
  { id: 'classify', name: 'Classify', desc: 'Name the archetype, do not solve it' },
  { id: 'review',   name: 'Review due', desc: 'Archetypes that are weak, or mastered but going stale' },
];

const bool = v => v === 1 || v === true;

export function defaultsFor(mode, desk) {
  const key = mode === 'exam' ? (desk === 2 ? 'exam2' : 'exam1') : mode;
  const raw = D[key] ?? D.practice;
  const out = {};
  for (const k of Object.keys(raw)) out[k] = k === 'optionOrder' ? raw[k] : bool(raw[k]);
  return out;
}

export function resolve(mode, desk, overrides = {}) {
  return { ...defaultsFor(mode, desk), ...overrides };
}

export function changedKeys(resolved, mode, desk) {
  const d = defaultsFor(mode, desk);
  return Object.keys(d).filter(k => resolved[k] !== d[k]);
}

// Blanks blocked wins wherever both are set, which is every exam session.
export const skipAllowed = t => t.allowSkip && !t.blockBlanks;
