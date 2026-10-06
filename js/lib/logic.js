// Finite-model machinery for the deductive desk.
//
// THE ANSWER IS CONSTRUCTED AND THE ENUMERATION IS THE CHECK. Every deductive item starts from a
// hidden world drawn first, and every clue is a statement true of that world. Whether the clues
// settle the question is decided by enumerating every world they allow: five people over five days
// is 120 orders, six people split into two teams of three is 20 splits, four yes/no facts is 16
// truth assignments. That is exhaustive, so it is a definition rather than a search. Nothing is
// approximated and no heuristic can miss a case, which is the deductive version of the numerical
// rule that an answer is evaluated from its formula and never solved for.
//
// DISTRACTORS FOLLOW THE HOUSE RULE. A wrong option is what a named misreading of the clues
// produces: drop one clue, reverse one, read "the day before" as "earlier", read "exactly two days
// between" as "two days apart", miss a "not". Each misreading is applied to the clue set and the
// same enumeration says what it would lead you to answer.

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
export const numberWord = n => NUMBER_WORDS[n] ?? String(n);
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Given names chosen so that no two share an initial within a draw and none reads as a real
// public figure. Drawn per item, so a name carries no information about its role.
export const PEOPLE = ['Aisha', 'Bruno', 'Chloe', 'Dev', 'Elena', 'Farid', 'Grace', 'Hugo', 'Isla',
  'Jonah', 'Kemi', 'Leon', 'Maya', 'Nikhil', 'Orla', 'Priya', 'Quentin', 'Rosa', 'Sami', 'Tara',
  'Umar', 'Vera', 'Wes', 'Yara', 'Zeke'];
export const COMPANIES = ['Ashby Foods', 'Brindle Paper', 'Calder Tools', 'Dunmore Print',
  'Elstree Glass', 'Fenwick Steel', 'Garnet Labs', 'Hollis Packaging', 'Ivers Freight',
  'Juniper Textiles', 'Kestrel Paints', 'Larch Timber'];

// n distinct names with distinct initials, returned in alphabetical order so the roster in the
// stem never orders people by their role in the puzzle.
export function drawNames(rng, n, pool = PEOPLE) {
  const byInitial = new Map();
  for (const name of rng.shuffle(pool)) if (!byInitial.has(name[0])) byInitial.set(name[0], name);
  return [...byInitial.values()].slice(0, n).sort();
}

export const listJoin = xs => xs.length <= 1 ? xs.join('')
  : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

// ---------------------------------------------------------------- worlds

const permCache = new Map();
export function permutations(n) {
  if (permCache.has(n)) return permCache.get(n);
  const out = [];
  const go = (prefix, rest) => {
    if (!rest.length) { out.push(prefix); return; }
    rest.forEach((x, i) => go([...prefix, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  go([], [...Array(n).keys()]);
  permCache.set(n, out);
  return out;
}

// A sequencing world: `order[slot]` is the person in that slot, `slot[person]` the inverse.
const seqCache = new Map();
export function sequenceWorlds(n) {
  if (seqCache.has(n)) return seqCache.get(n);
  const worlds = permutations(n).map(order => {
    const slot = Array(n);
    order.forEach((p, s) => { slot[p] = s; });
    return { order, slot };
  });
  seqCache.set(n, worlds);
  return worlds;
}

// A grouping world: `team[person]` is 0 or 1, with exactly `size` people on team 0.
const splitCache = new Map();
export function splitWorlds(n, size) {
  const key = `${n}:${size}`;
  if (splitCache.has(key)) return splitCache.get(key);
  const out = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    let ones = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) ones++;
    if (ones !== size) continue;
    out.push({ team: [...Array(n).keys()].map(i => (mask & (1 << i)) ? 0 : 1) });
  }
  splitCache.set(key, out);
  return out;
}

// A propositional world: `v[atom]` is true or false.
export function truthWorlds(k) {
  return [...Array(1 << k).keys()].map(m => ({ v: [...Array(k).keys()].map(i => !!(m & (1 << i))) }));
}

export const consistent = (worlds, clues) => worlds.filter(w => clues.every(c => c.holds(w)));
export const valuesOf = (worlds, f) => new Set(worlds.map(f));

// ---------------------------------------------------------------- sequencing clues
//
// Each clue is data plus two functions. `holds` is the semantics, `key` is a canonical identity so
// the generator never states the same fact twice. The wording lives in the scenario, so the
// semantics and the English are written once each and never interleaved.

export const seq = {
  before:   (a, b) => ({ type: 'before', a, b, key: `before:${a}:${b}`, holds: w => w.slot[a] < w.slot[b] }),
  dayBefore:(a, b) => ({ type: 'dayBefore', a, b, key: `dayBefore:${a}:${b}`, holds: w => w.slot[b] === w.slot[a] + 1 }),
  on:       (a, d) => ({ type: 'on', a, d, key: `on:${a}:${d}`, holds: w => w.slot[a] === d }),
  notOn:    (a, d) => ({ type: 'notOn', a, d, key: `notOn:${a}:${d}`, holds: w => w.slot[a] !== d }),
  gap:      (a, b, k) => ({ type: 'gap', a, b, k, key: `gap:${Math.min(a, b)}:${Math.max(a, b)}:${k}`,
                            holds: w => Math.abs(w.slot[a] - w.slot[b]) === k + 1 }),
  // The misreading of `gap`: "exactly two days between" taken as "two days apart".
  apart:    (a, b, k) => ({ type: 'apart', a, b, k, key: `apart:${Math.min(a, b)}:${Math.max(a, b)}:${k}`,
                            holds: w => Math.abs(w.slot[a] - w.slot[b]) === k }),
  end:      (a, last) => ({ type: 'end', a, last, key: `end:${a}`, holds: w => w.slot[a] === 0 || w.slot[a] === last }),
  either:   (a, d1, d2) => ({ type: 'either', a, d1, d2, key: `either:${a}:${Math.min(d1, d2)}:${Math.max(d1, d2)}`,
                              holds: w => w.slot[a] === d1 || w.slot[a] === d2 }),
  apartDays:(a, b) => ({ type: 'apartDays', a, b, key: `apartDays:${Math.min(a, b)}:${Math.max(a, b)}`,
                         holds: w => Math.abs(w.slot[a] - w.slot[b]) !== 1 }),
  adjacent: (a, b) => ({ type: 'adjacent', a, b, key: `adjacent:${Math.min(a, b)}:${Math.max(a, b)}`,
                         holds: w => Math.abs(w.slot[a] - w.slot[b]) === 1 }),
};

// Which clue types each tier may draw. Warm-up is order and exclusion; standard adds the two that
// need counting; hard adds disjunction and a negative adjacency, which are the ones people misread.
export const SEQ_TYPES = {
  warmup:   ['before', 'before', 'dayBefore', 'notOn', 'notOn'],
  standard: ['before', 'before', 'dayBefore', 'notOn', 'gap', 'end'],
  hard:     ['before', 'dayBefore', 'notOn', 'gap', 'end', 'either', 'apartDays'],
};

// A random clue of an allowed type that is TRUE of the hidden world.
export function trueSeqClue(rng, w, n, types) {
  for (let guard = 0; guard < 200; guard++) {
    const t = rng.pick(types);
    const a = rng.int(0, n - 1), b = rng.int(0, n - 1);
    if (['before', 'dayBefore', 'gap', 'apartDays'].includes(t) && a === b) continue;
    const sa = w.slot[a], sb = w.slot[b];
    switch (t) {
      case 'before': return sa < sb ? seq.before(a, b) : seq.before(b, a);
      case 'dayBefore':
        if (Math.abs(sa - sb) !== 1) continue;
        return sa < sb ? seq.dayBefore(a, b) : seq.dayBefore(b, a);
      case 'notOn': {
        const d = rng.int(0, n - 1);
        if (d === sa) continue;
        return seq.notOn(a, d);
      }
      case 'gap': {
        const k = Math.abs(sa - sb) - 1;
        if (k < 1) continue;
        return seq.gap(a, b, k);
      }
      case 'end':
        if (sa !== 0 && sa !== n - 1) continue;
        return seq.end(a, n - 1);
      case 'either': {
        let d = rng.int(0, n - 1);
        if (d === sa) continue;
        return rng.next() < 0.5 ? seq.either(a, sa, d) : seq.either(a, d, sa);
      }
      case 'apartDays':
        if (Math.abs(sa - sb) === 1) continue;
        return seq.apartDays(a, b);
    }
  }
  return null;
}

// The named misreadings of a sequencing clue. Each returns a replacement clue, or null where the
// misreading does not apply to that clue type. `missed-clue` is handled by the caller, since it is
// the absence of a clue rather than a different one.
export const SEQ_MISREADINGS = {
  'reversed-order': c => c.type === 'before' ? seq.before(c.b, c.a)
    : c.type === 'dayBefore' ? seq.dayBefore(c.b, c.a) : null,
  'next-read-as-earlier': c => c.type === 'dayBefore' ? seq.before(c.a, c.b) : null,
  'gap-off-by-one': c => c.type === 'gap' ? seq.apart(c.a, c.b, c.k) : null,
  'missed-negation': c => c.type === 'notOn' ? seq.on(c.a, c.d)
    : c.type === 'apartDays' ? seq.adjacent(c.a, c.b) : null,
};

// Remove every clue whose removal leaves `settled` true, latest first, so the stem carries no
// redundant statement. A redundant clue is not harmless: it inflates how often a name is mentioned,
// which is a scanning shortcut the audit measures.
export function prune(clues, settled) {
  let kept = clues.slice();
  for (let i = kept.length - 1; i >= 0; i--) {
    const without = [...kept.slice(0, i), ...kept.slice(i + 1)];
    if (settled(without)) kept = without;
  }
  return kept;
}

// For each named misreading, what would a solver who made it answer? Returns a Map from each wrong
// answer value to the misreading that best explains it, plus the clue it came from, so the option
// note can quote the exact sentence that was misread.
//
// BEST EXPLAINS, NOT FIRST FOUND. One wrong option is often reachable by several misreadings, and a
// fixed precedence let the most generous one, reversing a comparison, claim most options in the
// library. The label goes instead to the misreading that leaves the FEWEST answers open, since a
// misreading that leads to this option and only this option is the likelier cause of picking it.
// Ties fall back to `order`, specific before generic.
//
// `answers(clueSet)` returns the set of answer values the clue set leaves possible. A misreading that
// produces a contradiction yields nothing, since a solver who meets a contradiction notices it.
export function misreadingAnswers({ clues, answers, correct, misreadings, order }) {
  const best = new Map();
  const offer = (value, errorType, clue, spread) => {
    if (value === correct) return;
    const rank = order.indexOf(errorType);
    const cur = best.get(value);
    if (!cur || spread < cur.spread || (spread === cur.spread && rank < cur.rank)) {
      best.set(value, { errorType, clue, spread, rank });
    }
  };
  for (const errorType of order) {
    clues.forEach((c, i) => {
      const rest = [...clues.slice(0, i), ...clues.slice(i + 1)];
      let set;
      if (errorType === 'missed-clue') set = answers(rest);
      else {
        const swap = misreadings[errorType]?.(c);
        if (!swap) return;
        set = answers([...rest, swap]);
      }
      for (const v of set) offer(v, errorType, c, set.size);
    });
  }
  return best;
}

// ---------------------------------------------------------------- grouping clues

export const grp = {
  same:  (a, b) => ({ type: 'same', a, b, key: `same:${Math.min(a, b)}:${Math.max(a, b)}`, holds: w => w.team[a] === w.team[b] }),
  diff:  (a, b) => ({ type: 'diff', a, b, key: `diff:${Math.min(a, b)}:${Math.max(a, b)}`, holds: w => w.team[a] !== w.team[b] }),
  on:    (a, t) => ({ type: 'on', a, t, key: `on:${a}:${t}`, holds: w => w.team[a] === t }),
  // "If A is on team s, then B is on team t."
  ifThen:(a, s, b, t) => ({ type: 'ifThen', a, s, b, t, key: `ifThen:${a}:${s}:${b}:${t}`,
                            holds: w => w.team[a] !== s || w.team[b] === t }),
};

export const GRP_TYPES = {
  warmup:   ['same', 'diff', 'diff', 'on'],
  standard: ['same', 'diff', 'on', 'ifThen'],
  hard:     ['same', 'diff', 'ifThen', 'ifThen'],
};

export function trueGrpClue(rng, w, n, types) {
  for (let guard = 0; guard < 200; guard++) {
    const t = rng.pick(types);
    const a = rng.int(0, n - 1), b = rng.int(0, n - 1);
    if (t !== 'on' && a === b) continue;
    switch (t) {
      case 'same': if (w.team[a] !== w.team[b]) continue; return grp.same(a, b);
      case 'diff': if (w.team[a] === w.team[b]) continue; return grp.diff(a, b);
      case 'on': return grp.on(a, w.team[a]);
      case 'ifThen': {
        // Draw an implication that is true of the hidden split and is not vacuous in BOTH
        // directions, so it carries information: either its antecedent holds (and so does its
        // consequent), or its consequent fails (so the antecedent must fail too).
        const s = rng.int(0, 1), tt = rng.int(0, 1);
        const c = grp.ifThen(a, s, b, tt);
        if (!c.holds(w)) continue;
        const antecedentTrue = w.team[a] === s, consequentTrue = w.team[b] === tt;
        if (!antecedentTrue && consequentTrue) continue;
        return c;
      }
    }
  }
  return null;
}

export const GRP_MISREADINGS = {
  'missed-negation': c => c.type === 'diff' ? grp.same(c.a, c.b) : null,
  'converse-conditional': c => c.type === 'ifThen' ? grp.ifThen(c.b, c.t, c.a, c.s) : null,
};

// ---------------------------------------------------------------- specs
//
// Clues travel as plain specs in item.params and in test/fixtures.json, so a fixture can pin an
// exact clue set and a flagged item can be rebuilt from its record.
export const specOf = c => Object.fromEntries(Object.entries(c).filter(([k, v]) => typeof v !== 'function' && k !== 'key'));

export function seqFromSpec(s) {
  switch (s.type) {
    case 'before': return seq.before(s.a, s.b);
    case 'dayBefore': return seq.dayBefore(s.a, s.b);
    case 'on': return seq.on(s.a, s.d);
    case 'notOn': return seq.notOn(s.a, s.d);
    case 'gap': return seq.gap(s.a, s.b, s.k);
    case 'apart': return seq.apart(s.a, s.b, s.k);
    case 'end': return seq.end(s.a, s.last);
    case 'either': return seq.either(s.a, s.d1, s.d2);
    case 'apartDays': return seq.apartDays(s.a, s.b);
    case 'adjacent': return seq.adjacent(s.a, s.b);
    default: throw new Error(`unknown sequencing clue ${s.type}`);
  }
}

export function grpFromSpec(s) {
  switch (s.type) {
    case 'same': return grp.same(s.a, s.b);
    case 'diff': return grp.diff(s.a, s.b);
    case 'on': return grp.on(s.a, s.t);
    case 'ifThen': return grp.ifThen(s.a, s.s, s.b, s.t);
    default: throw new Error(`unknown grouping clue ${s.type}`);
  }
}

// How often each entity is named across the clues. A scanner who picks the most-mentioned name is
// the deductive analogue of "pick the biggest number", so the audit reads this as a visible column.
export function mentionCounts(clues, n) {
  const m = Array(n).fill(0);
  for (const c of clues) {
    if (c.a !== undefined) m[c.a]++;
    if (c.b !== undefined && c.b !== c.a) m[c.b]++;
  }
  return m;
}
