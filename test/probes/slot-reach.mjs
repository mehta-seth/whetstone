// Run from the repo root: node test/probes/slot-reach.mjs
// Restored from the pre-release tree, where audit/build.js already cited it.
// Can a session-level slot-balancing pass actually move the pooled distribution?
// It can only choose among items an archetype is CAPABLE of producing. So: for each
// numeric archetype, what share of its items land in slot 1 or slot 5?
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { archetypes } = await import('../../js/archetypes/index.js');
const { makeRng } = await import('../../js/lib/rng.js');
const { checkItem } = await import('../../js/lib/validate.js');
const CAT = new Set(['label','month','verdict']);
const N = 60;
let capable = [], incapable = [], deskRows = {};
for (const arch of archetypes) {
  if (CAT.has(arch.answerType)) continue;
  let ext = 0, tot = 0, seed = 8814092, att = 0;
  while (tot < N && att < N * 400) {
    att++; let b = null;
    try { const rng = makeRng(seed++);
      b = typeof arch.generateAll === 'function' ? arch.generateAll(rng, arch.tiers[0], null, []) : arch.generate(rng, arch.tiers[0], null, []); } catch {}
    if (!b) continue;
    const list = Array.isArray(b) ? b : [b];
    if (list.flatMap(checkItem).length) continue;
    for (const it of list) {
      const vals = it.options.map(o => o.value).filter(v => typeof v === 'number');
      if (vals.length !== 5) continue;
      const s = [...vals].sort((x,y)=>x-y).indexOf(it.correct.value);
      tot++; if (s === 0 || s === 4) ext++;
    }
  }
  const pct = 100*ext/tot;
  (pct > 2 ? capable : incapable).push(`${arch.id} ${pct.toFixed(0)}%`);
  for (const d of arch.desks) (deskRows[d] ??= []).push({ id: arch.id, pct });
}
console.log(`\nSHARE OF ITEMS LANDING IN SLOT 1 OR SLOT 5, per numeric archetype\n`);
console.log(`  can reach an extreme slot (${capable.length}): ${capable.join(', ')}`);
console.log(`\n  CANNOT, at 0-2% (${incapable.length}): ${incapable.join(', ')}`);
for (const d of Object.keys(deskRows).sort()) {
  const rs = deskRows[d];
  const mean = rs.reduce((s,r)=>s+r.pct,0)/rs.length;
  const able = rs.filter(r=>r.pct>2);
  console.log(`\n  desk ${d}: ${rs.length} numeric archetypes, ${able.length} can reach an extreme.`);
  console.log(`    uniform pooled extreme share ${mean.toFixed(1)}% against 40% expected.`);
  const best = rs.slice().sort((a,b)=>b.pct-a.pct);
  console.log(`    ceiling if selection over-weighted the top 3 to 100%: `
    + `${best.slice(0,3).map(r=>r.id+' '+r.pct.toFixed(0)+'%').join(', ')}`);
}
