// node test/probes/option-algebra.mjs
//
// Is the answer recoverable by combining the OTHER options, with no stimulus and no stem?
//
// The headline is not "zero". Strict uniqueness never occurs, but the residual NARROWING is real: the
// method surfaces a set of expressible options, the answer is always inside it where it is expressible
// at all, and a small surviving set is a better-than-chance guess. So the figure that matters is the
// expected hit rate from guessing inside the surviving set, against a 20% baseline, and the worst case
// over items rather than the average.
import { makeRng } from '../../js/lib/rng.js';
import { checkItem } from '../../js/lib/validate.js';
import { archetypes } from '../../js/archetypes/index.js';
const ALGEBRAIC = new Set(['number','currency','percentage','countWithUnit','fraction','ratio','signedDirection']);
const near = (a, b) => Math.abs(a - b) < Math.max(1e-9, Math.abs(b) * 1e-9);

function expressible(vals) {
  const out = [];
  for (let t = 0; t < vals.length; t++) {
    const A = vals[t], D = vals.filter((_, i) => i !== t);
    let found = false;
    for (let i = 0; i < D.length && !found; i++) {
      if (near(D[i] * 2, A) || near(D[i] / 2, A)) found = true;
      for (let j = i + 1; j < D.length && !found; j++) {
        if (near(D[i] + D[j], A) || near(D[i] - D[j], A) || near(D[j] - D[i], A)) found = true;
        for (let k = j + 1; k < D.length && !found; k++) {
          for (const s of [[1,1,1],[1,1,-1],[1,-1,1],[-1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]) {
            if (near(s[0]*D[i] + s[1]*D[j] + s[2]*D[k], A)) { found = true; break; }
          }
        }
      }
    }
    if (found) out.push(t);
  }
  return out;
}
const harvest = (a, n = 200) => {
  const items = []; let seed = 8814092, att = 0;
  while (items.length < n && att < n * 400) {
    att++; const rng = makeRng(seed++);
    let b = null;
    try { b = typeof a.generateAll === 'function' ? a.generateAll(rng, a.tiers[0], null, []) : a.generate(rng, a.tiers[0], null, []); } catch { continue; }
    if (!b) continue;
    const list = Array.isArray(b) ? b : [b];
    if (list.flatMap(checkItem).length) continue;
    items.push(...list);
  }
  return items;
};
console.log('NARROWING FROM OPTION-SET ALGEBRA');
console.log('Baseline is 20%. Severity bands as elsewhere: 1.6x chance is concentrated, 2.4x a leak.\n');
console.log('  id    answer in set   expected hit   x chance   smallest surviving set   sizes seen');
const rows = [];
for (const a of archetypes) {
  const items = harvest(a).filter(it => ALGEBRAIC.has(it.answerType));
  if (!items.length) continue;
  let rec = 0, hitSum = 0, worst = 99; const sizes = new Map(); let n = 0;
  for (const it of items) {
    const vals = it.options.map(o => o.value);
    if (!vals.every(v => typeof v === 'number' && Number.isFinite(v))) continue;
    n++;
    const ci = it.options.findIndex(o => o.role === 'correct');
    const e = expressible(vals);
    if (!e.includes(ci)) { hitSum += 0.2; sizes.set('none', (sizes.get('none') ?? 0) + 1); continue; }
    rec++;
    hitSum += 1 / e.length;
    worst = Math.min(worst, e.length);
    sizes.set(e.length, (sizes.get(e.length) ?? 0) + 1);
  }
  if (!n) continue;
  rows.push([a.id, 100*rec/n, 100*hitSum/n, (hitSum/n)/0.2, worst === 99 ? '-' : worst,
    [...sizes.entries()].sort((x,y) => String(x[0]).localeCompare(String(y[0]))).map(([k,v]) => `${k}:${v}`).join(' ')]);
}
rows.sort((x, y) => y[3] - x[3]);
for (const [id, rec, hit, mult, worst, sizes] of rows) {
  const flag = mult >= 2.4 ? '  <- LEAK' : mult >= 1.6 ? '  <- concentrated' : '';
  console.log(`  ${id}  ${rec.toFixed(0).padStart(11)}%  ${hit.toFixed(1).padStart(11)}%  ${mult.toFixed(2).padStart(7)}x  `
    + `${String(worst).padStart(20)}   ${sizes}${flag}`);
}
