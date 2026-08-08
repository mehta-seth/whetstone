// PATH DIFF. , and it exists because a diagnostic measured a code path the app does not
// run.
//
// b06's rank-pair target was drawn in `buildSolo`, which only `generate` and `generateAll` reach.
// `session.js` builds a shared stimulus with `makeStimulus({ family, rng })` and no opts, so in a
// real Desk 02 session the target was null and the weighting never ran. The audit harness calls
// `generateAll`. It therefore reported the answer at quantity-sold rank 4 in 31% of items while
// production delivered 72%, which is 3.6x chance and a rank leak, and signed earlier the carry-in
// off as closed on the 31%.
//
// Fixing b06 closes the instance. It says nothing about whether b01 to b08, c01, c02 or d13 have
// opts-dependent behaviour that `session.js` also never triggers. So the property is checked
// mechanically for every archetype instead: build items the way the SESSION does, build them the
// way the AUDIT does, and diff the diagnostics. Any archetype whose figures differ by more than
// sampling noise is a bug of this class.
//
// This is the design rules's newest non-negotiable: a diagnostic must exercise the code path
// production uses, and this diff is its enforcement.
import { makeRng } from '../../js/lib/rng.js';
import { checkItem } from '../../js/lib/validate.js';
import { archetypes } from '../../js/archetypes/index.js';
import { makeStimulus } from '../../js/lib/stimulus.js';

const N = Number(process.argv[2] ?? 150);
const ONLY = process.argv[3] ?? null;
// Three standard errors at n=150 on a share near a third is about 12 points, so anything at or
// above that is structural rather than noise. Reported alongside the raw maximum either way.
const NOISE = 12;

const rankOf = (arr, i) => [...arr].sort((a, b) => a - b).indexOf(arr[i]) + 1;
const asNumber = c => {
  if (typeof c === 'number') return c;
  const m = String(c).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// The two builders. `session` is what js/session.js does: a shared-stimulus archetype consumes a
// stimulus built with no options, and a self-contained one goes through the plain loop. `audit` is
// what audit/build.js does: generateAll where it exists, generate otherwise.
function viaSession(arch, seed, family) {
  const rng = makeRng(seed);
  if (typeof arch.build === 'function' && family) {
    const st = makeStimulus({ family, rng });
    if (!st) return null;
    return arch.build({ stimulus: st, rng: makeRng(seed), tier: arch.tiers[0], diag: [] });
  }
  return arch.generate(rng, arch.tiers[0], null, []);
}
function viaAudit(arch, seed) {
  const rng = makeRng(seed);
  return typeof arch.generateAll === 'function'
    ? arch.generateAll(rng, arch.tiers[0], null, [])
    : arch.generate(rng, arch.tiers[0], null, []);
}

function harvest(arch, build, base) {
  const items = [];
  let attempts = 0;
  for (let s = 0; items.length < N && attempts < N * 60; s++) {
    attempts++;
    let b = null;
    try { b = build(base + s); } catch { continue; }
    if (!b) continue;
    const list = Array.isArray(b) ? b : [b];
    if (list.flatMap(checkItem).length) continue;
    items.push(...list);
  }
  return { items, attempts };
}

// Position and, for a label answer, the answer's rank in every visible column. Those are the two
// diagnostics a leak actually hides in, and they are the two that disagreed on b06.
function profile(items) {
  const slots = [0, 0, 0, 0, 0];
  const cols = new Map();
  for (const it of items) {
    const vals = it.options.map(o => o.value);
    const numeric = vals.every(v => typeof v === 'number' && Number.isFinite(v));
    const order = numeric
      ? [...it.options].sort((a, b) => a.value - b.value)
      : [...it.options].sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0));
    const at = order.findIndex(o => o.role === 'correct');
    if (at >= 0 && at < 5) slots[at]++;

    const t = it.stimulus?.table, corr = it.correlation;
    const view = Array.isArray(t?.keys) ? { keys: t.keys, head: t.head, rows: t.body }
      : corr?.keys ? { keys: corr.keys, head: Object.keys(corr.columns),
          rows: corr.keys.map((_, r) => Object.keys(corr.columns).map(h => corr.columns[h][r])) }
      : null;
    if (!view) continue;
    const row = view.keys.indexOf(it.correct.value);
    if (row < 0) continue;
    view.head.forEach((h, c) => {
      const column = view.rows.map(r => asNumber(r[c]));
      if (column.some(v => v === null) || new Set(column).size !== column.length) return;
      if (!cols.has(h)) cols.set(h, new Map());
      const m = cols.get(h);
      const r = rankOf(column, row);
      m.set(r, (m.get(r) ?? 0) + 1);
    });
  }
  const n = Math.max(1, items.length);
  return {
    n: items.length,
    slots: slots.map(v => 100 * v / n),
    cols: [...cols.entries()].map(([h, m]) => {
      const tot = [...m.values()].reduce((a, b) => a + b, 0);
      return { head: h, top: 100 * Math.max(...m.values()) / tot,
        topRank: [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] };
    }),
  };
}

console.log(`PATH DIFF, ${N} items per path per archetype.`);
console.log('  session = the builder js/session.js uses.  audit = the builder build.js uses.');
console.log(`  A gap at or above ${NOISE} points is structural: three standard errors at this n is about 12.\n`);
console.log('  id    family      worst gap  where');

const failures = [];
for (const arch of (ONLY ? archetypes.filter(a => a.id === ONLY) : archetypes)) {
  const families = typeof arch.build === 'function' ? (arch.families ?? [null]) : [null];
  for (const family of families) {
    const a = harvest(arch, s => viaSession(arch, s, family), 4400000);
    const b = harvest(arch, s => viaAudit(arch, s), 4400000);
    if (!a.items.length || !b.items.length) {
      console.log(`  ${arch.id.padEnd(6)}${String(family ?? '-').padEnd(12)}   no items on one path`
        + `  (session ${a.items.length}, audit ${b.items.length})`);
      continue;
    }
    const pa = profile(a.items), pb = profile(b.items);
    let worst = 0, where = 'position';
    for (let i = 0; i < 5; i++) {
      const d = Math.abs(pa.slots[i] - pb.slots[i]);
      if (d > worst) { worst = d; where = `slot ${i + 1}, ${pa.slots[i].toFixed(0)}% session vs ${pb.slots[i].toFixed(0)}% audit`; }
    }
    for (const ca of pa.cols) {
      const cb = pb.cols.find(x => x.head === ca.head);
      if (!cb) continue;
      const d = Math.abs(ca.top - cb.top);
      if (d > worst) { worst = d; where = `${ca.head}, top rank ${ca.top.toFixed(0)}% session vs ${cb.top.toFixed(0)}% audit`; }
    }
    const flag = worst >= NOISE ? '  <- PATHS DISAGREE' : '';
    if (worst >= NOISE) failures.push(`${arch.id}${family ? '/' + family : ''}: ${where}`);
    console.log(`  ${arch.id.padEnd(6)}${String(family ?? '-').padEnd(12)}${worst.toFixed(1).padStart(9)}   ${where}${flag}`);
  }
}

console.log('');
if (failures.length) {
  console.log('PATHS DISAGREE, which means the audit figure does not describe what a session builds:');
  failures.forEach(f => console.log('  ' + f));
  process.exitCode = 1;
} else {
  console.log('Every archetype reports the same profile on both paths.');
}
