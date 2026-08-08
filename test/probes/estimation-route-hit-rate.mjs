// Standing tool. Every archetype exporting estimate(params) must have its route land on
// the CORRECT option. A route that lands on a distractor teaches the wrong method, which is worse
// than no route, so this is swept rather than trusted. Rounding inputs to two significant figures
// is the measured rule: one figure compounds past the option gap on any multi-factor product.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { archetypes } = await import('../../js/archetypes/index.js');
const { makeRng } = await import('../../js/lib/rng.js');
const { checkItem } = await import('../../js/lib/validate.js');
const { estimationRoute } = await import('../../js/lib/precision.js');
const N = Number(process.argv[2] ?? 200);
for (const arch of archetypes.filter(a => typeof a.estimate === 'function')) {
  let n = 0, hit = 0, seed = 8814092, att = 0, err = 0, sample = null;
  while (n < N && att < N * 400) {
    att++; let b = null;
    try { b = arch.generate(makeRng(seed++), arch.tiers[0], null, []); } catch { continue; }
    if (!b || checkItem(b).length) continue;
    n++;
    const r = estimationRoute(b, arch);
    if (!r) { err++; continue; }
    if (r.correct) hit++;
    if (!sample) sample = `${r.text}  ->  ${r.landsOn.display}`;
  }
  console.log(`  ${arch.id}  route lands on the answer in ${hit}/${n}  (${(100*hit/n).toFixed(1)}%)${err?`  no-route ${err}`:''}`);
  console.log(`        e.g. ${sample}`);
}
