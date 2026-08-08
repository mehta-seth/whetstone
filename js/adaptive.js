// Mastery scores and selection weights, the spec.
// The dashboard weight table lands earlier. The engine itself is here so
// that the adaptive toggle is live rather than inert, and so an earlier round extends
// this file instead of refactoring session.js.
import {
  REVIEW_DOUBLE_BELOW, REVIEW_DOUBLE_CAP,
  MASTERY_ACCURACY_WEIGHT, MASTERY_SPEED_WEIGHT, MASTERY_PRIOR_CORRECT,
  MASTERY_PRIOR_ATTEMPTS, UNSEEN_SPEED, AT_TARGET_MASTERY, AT_TARGET_MIN_ATTEMPTS,
  STALENESS_WEIGHT, STALENESS_FULL_DAYS, WEIGHT_FLOOR, ARCHETYPE_SHARE_CAP,
  REVIEW_WEAK_MASTERY, REVIEW_WEAK_ATTEMPTS, REVIEW_DECAY_DAYS, REVIEW_MAX_LENGTH,
} from './lib/constants.js';

const EMPTY = { attempts: 0, correct: 0, medianMs: null, lastSeen: null, errorCounts: {} };

export function daysSince(iso) {
  if (!iso) return STALENESS_FULL_DAYS;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export function masteryFor(record, targetSeconds) {
  const r = record ?? EMPTY;
  // Smoothed. Raw accuracy is far too jumpy at low attempt counts: one wrong
  // answer out of one attempt is not zero ability.
  const accuracy = (r.correct + MASTERY_PRIOR_CORRECT) / (r.attempts + MASTERY_PRIOR_ATTEMPTS);
  // Correct but slow still fails a timed test. Unseen archetypes get 0.5
  // explicitly rather than a division by an undefined median.
  const speed = r.medianMs > 0 ? Math.min(targetSeconds * 1000 / r.medianMs, 1) : UNSEEN_SPEED;
  return MASTERY_ACCURACY_WEIGHT * accuracy + MASTERY_SPEED_WEIGHT * speed;
}

export const atTarget = (record, targetSeconds) =>
  (record?.attempts ?? 0) >= AT_TARGET_MIN_ATTEMPTS && masteryFor(record, targetSeconds) >= AT_TARGET_MASTERY;

export function weightFor(record, targetSeconds) {
  const staleness = STALENESS_WEIGHT * Math.min(daysSince(record?.lastSeen) / STALENESS_FULL_DAYS, 1);
  return Math.max((1 - masteryFor(record, targetSeconds)) + staleness, WEIGHT_FLOOR);
}

export function reviewDue(pool, masteryMap) {
  return pool.filter(a => {
    const r = masteryMap[a.id];
    if (!r) return false;
    if (r.attempts >= REVIEW_WEAK_ATTEMPTS && masteryFor(r, a.targetSeconds) < REVIEW_WEAK_MASTERY) return true;
    return atTarget(r, a.targetSeconds) && daysSince(r.lastSeen) >= REVIEW_DECAY_DAYS;
  });
}
// The spec pins one item per matching archetype. Below REVIEW_DOUBLE_BELOW matches that is too
// short to be worth opening, so each archetype gets two items up to REVIEW_DOUBLE_CAP. Breadth
// stays the point of the mode; depth is what Tempo with adaptive weighting on is for.
export function reviewPlan(due) {
  if (!due.length) return [];
  if (due.length >= REVIEW_DOUBLE_BELOW) return due.slice(0, REVIEW_MAX_LENGTH);
  // PROBLEM 7. `doubled` was built, never read except for its length, and its length is always
  // 2 x due.length. A half-finished edit that read as though two different plans were in play.
  //
  // Interleaved so the two items from one archetype are never consecutive, which is the same rule
  // selectArchetypes applies.
  const out = [];
  for (let pass = 0; pass < 2; pass++) for (const a of due) out.push(a);
  return out.slice(0, Math.min(REVIEW_DOUBLE_CAP, 2 * due.length));
}
export const reviewLength = due => reviewPlan(due).length;

// Weighted sampling with replacement, subject to a per-archetype cap and no two
// consecutive items from the same archetype. The cap is relaxed when 25% of the
// length would make the session impossible to fill, and the consecutive rule is
// dropped when only one archetype is in scope, which is otherwise a deadlock.
export function selectArchetypes({ pool, length, masteryMap = {}, adaptive = true, rng }) {
  if (!pool.length) return [];
  const cap = Math.max(Math.ceil(ARCHETYPE_SHARE_CAP * length), Math.ceil(length / pool.length));
  const weights = pool.map(a => adaptive ? weightFor(masteryMap[a.id], a.targetSeconds) : 1);
  const used = new Map();
  const out = [];
  const noRepeatRule = pool.length > 1;

  for (let i = 0; i < length; i++) {
    const eligible = pool
      .map((a, idx) => ({ a, w: weights[idx] }))
      .filter(({ a }) => (used.get(a.id) ?? 0) < cap)
      .filter(({ a }) => !(noRepeatRule && out.length && out.at(-1).id === a.id));
    const choices = eligible.length ? eligible : pool.map((a, idx) => ({ a, w: weights[idx] }));
    const total = choices.reduce((s, c) => s + c.w, 0);
    let t = rng.float(0, total);
    let picked = choices.at(-1).a;
    for (const c of choices) { t -= c.w; if (t <= 0) { picked = c.a; break; } }
    out.push(picked);
    used.set(picked.id, (used.get(picked.id) ?? 0) + 1);
  }
  return out;
}

export function summarise(pool, masteryMap) {
  return pool.map(a => {
    const r = masteryMap[a.id];
    return {
      id: a.id, name: a.name, group: a.group,
      attempts: r?.attempts ?? 0, correct: r?.correct ?? 0,
      medianMs: r?.medianMs ?? null,
      mastery: masteryFor(r, a.targetSeconds),
      weight: weightFor(r, a.targetSeconds),
      atTarget: atTarget(r, a.targetSeconds),
    };
  });
}
