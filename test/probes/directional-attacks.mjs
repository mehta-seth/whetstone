// Set SIZE is not the whole story. If a relation has a consistent DIRECTION, the candidate does not
// have to guess inside the surviving set: they learn which role the answer occupies. a05 shows the
// case, because two of its distractors are exact multiples of the answer by construction.
import { makeRng } from '../../js/lib/rng.js';
import { checkItem } from '../../js/lib/validate.js';
import { archetypes } from '../../js/archetypes/index.js';
const ALGEBRAIC = new Set(['number','currency','percentage','countWithUnit','fraction','ratio','signedDirection']);
const near = (a, b) => Math.abs(a - b) < Math.max(1e-9, Math.abs(b) * 1e-9);
const harvest = (a, n = 200) => {
  const items = []; let seed = 8814092, att = 0;
  while (items.length < n && att < n * 400) {
    att++; const rng = makeRng(seed++);
    let b = null;
    try { b = typeof a.generateAll === 'function' ? a.generateAll(rng, a.tiers[0], null, []) : a.generate(rng, a.tiers[0], null, []); } catch { continue; }
    if (!b) continue;
    const l = Array.isArray(b) ? b : [b];
    if (l.flatMap(checkItem).length) continue;
    items.push(...l);
  }
  return items;
};
// ATTACK: find every pair in exact ratio 2. If there is exactly one, guess its smaller member.
// Then the same guessing the larger. Then: a geometric triple in ratio 1:2:4, guess the middle.
const attacks = {
  'unique 2:1 pair, take the smaller': vals => {
    const pairs = [];
    for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals.length; j++)
      if (i !== j && near(vals[i], 2 * vals[j])) pairs.push([vals[j], vals[i]]);
    return pairs.length === 1 ? pairs[0][0] : null;
  },
  'unique 2:1 pair, take the larger': vals => {
    const pairs = [];
    for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals.length; j++)
      if (i !== j && near(vals[i], 2 * vals[j])) pairs.push([vals[j], vals[i]]);
    return pairs.length === 1 ? pairs[0][1] : null;
  },
  '1:2:4 triple, take the middle': vals => {
    const hits = [];
    for (const a of vals) for (const b of vals) for (const c of vals)
      if (near(b, 2 * a) && near(c, 2 * b)) hits.push(b);
    return new Set(hits.map(v => v.toFixed(6))).size === 1 ? hits[0] : null;
  },
};
console.log('DIRECTIONAL ATTACKS. Hit rate is over ALL items, so a blank attack scores zero.\n');
console.log('  id    ' + Object.keys(attacks).map(k => k.padStart(36)).join(''));
for (const a of archetypes) {
  const items = harvest(a).filter(it => ALGEBRAIC.has(it.answerType));
  if (!items.length) continue;
  const line = [];
  let worst = 0;
  for (const fn of Object.values(attacks)) {
    let hit = 0;
    for (const it of items) {
      const vals = it.options.map(o => o.value);
      if (!vals.every(v => typeof v === 'number')) continue;
      const g = fn(vals);
      if (g !== null && near(g, it.correct.value)) hit++;
    }
    const pc = 100 * hit / items.length;
    worst = Math.max(worst, pc);
    line.push(`${pc.toFixed(1)}%`.padStart(36));
  }
  if (worst >= 5) console.log(`  ${a.id}  ${line.join('')}   ${worst >= 40 ? '<- EXPLOITABLE' : worst >= 20 ? '<- usable' : ''}`);
}
console.log('\n(archetypes where every attack scores under 5% are omitted)');
