// Every behavioural difference between modes is a toggle. Modes are presets over
// those toggles, not separate code paths.
export const TOGGLE_DEFS = [
  { key: 'setupBox',       label: 'Setup box',        effect: 'A box to write your working before answering. Times how long reading takes' },
  { key: 'backNav',        label: 'Back navigation',  effect: 'Allow returning to earlier questions' },
  { key: 'optionLetters',  label: 'Option letters',   effect: 'Render A to E badges rather than bare radios' },
  { key: 'perItemClock',   label: 'Per-item clock',   effect: 'Show a countdown for the current question at test pace' },
  { key: 'sessionClock',   label: 'Session clock',    effect: 'Show the whole-session countdown' },
  { key: 'instantFeedback',label: 'Instant feedback', effect: 'Reveal correct or incorrect immediately after each answer' },
  { key: 'allowSkip',      label: 'Allow skip',       effect: 'Esc moves on without answering. Block blanks overrides this' },
  { key: 'blockBlanks',    label: 'Block blanks',     effect: 'Refuse to advance on an unanswered item' },
  { key: 'showArchetype',  label: 'Show question type', effect: 'Name the type of question on the question screen' },
  { key: 'showSpread',     label: 'Show option spread',  effect: 'After answering, show the gap between the two closest options' },
  { key: 'adaptive',       label: 'Focus on weak areas', effect: 'Show the question types you get wrong more often. Off means every type equally' },
  { key: 'timerWarning',   label: 'Timer warning',    effect: 'Visual pulse in the final 60 seconds' },
  { key: 'typedAnswer',    label: 'Type the answer',  effect: 'Hide the options on numeric questions and type the value instead' },
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
  // The logical formats. No back navigation, since the general-ability tests are adaptive and never
  // return to an item. Ascending is safe here because every logical archetype supplies a sort key
  // that is either the natural order (names alphabetically, weekdays in order) or a seeded shuffle.
  exam3:    { setupBox: 0, backNav: 0, optionLetters: 0, perItemClock: 0, sessionClock: 1, instantFeedback: 0, allowSkip: 1, blockBlanks: 1, showArchetype: 0, showSpread: 0, adaptive: 0, timerWarning: 1, optionOrder: 'ascending' },
};
for (const d of Object.values(D)) d.typedAnswer = 0;

// Difficulty bands, in ascending order. An archetype declares which it appears in.
export const TIERS = [
  { id: 'warmup',   name: 'Warm-up'  },
  { id: 'standard', name: 'Standard' },
  { id: 'hard',     name: 'Hard'     },
];

export const MODES = [
  { id: 'practice', name: 'Practice', desc: 'No clock. The answer and an explanation after every question' },
  { id: 'tempo',    name: 'Tempo',    desc: 'A clock on every question, at test pace, with feedback as you go' },
  { id: 'exam',     name: 'Timed test', desc: 'One clock for the whole test, and your results at the end' },
  { id: 'classify', name: 'Classify', desc: 'Name the type of question without solving it, ten seconds each' },
  { id: 'review',   name: 'Review due', desc: 'The question types you find hardest, and any you have not seen for a while' },
];

const bool = v => v === 1 || v === true;

export function defaultsFor(mode, desk) {
  const key = mode === 'exam' ? (desk === 2 ? 'exam2' : desk >= 3 ? 'exam3' : 'exam1') : mode;
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
