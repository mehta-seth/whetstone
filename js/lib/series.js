// Number and letter series for the inductive desk: a rule library, an identifiability index over it,
// and the named wrong procedures a distractor is built from.
//
// IDENTIFIABLE MEANS ONE PREDICTION ACROSS THE WHOLE LIBRARY. Every sequence the library can produce
// is indexed by its first five terms. An item is shown only if its five terms predict exactly one
// sixth term across every rule in the library, so no rule a candidate could reasonably entertain
// gives a different answer. Measured on the probe that preceded this file: a five-term prefix was
// ambiguous 0.0% of the time and a four-term prefix 4.4%, Fibonacci-type rules 17.6%, which is why
// five terms are always shown.
//
// The generator draws from the same families and ranges the index enumerates, so every generated
// series is in the library by construction and the index is a check, not a filter on luck.

const R = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };
const nz = (a, b) => R(a, b).filter(x => x !== 0);
export const SHOWN = 5;
const LEN = SHOWN + 2;              // five shown, the answer, and the term after it

export const NUMBER_FAMILIES = {
  arith:      { text: p => `add ${p.d} each time`, grid: () => R(1, 40).flatMap(a => nz(-12, 12).map(d => ({ a, d }))),
                seq: p => R(0, LEN - 1).map(n => p.a + n * p.d) },
  geom:       { text: p => `multiply by ${p.r} each time`, grid: () => R(1, 12).flatMap(a => [2, 3].map(r => ({ a, r }))),
                seq: p => R(0, LEN - 1).map(n => p.a * p.r ** n) },
  interleave: { text: p => `two series alternate: one adds ${p.d1}, the other adds ${p.d2}`,
                grid: () => R(1, 25).flatMap(a1 => R(1, 25).flatMap(a2 => nz(-6, 6).flatMap(d1 => nz(-6, 6)
                  .filter(d2 => d1 !== d2 || a1 !== a2).map(d2 => ({ a1, a2, d1, d2 }))))),
                seq: p => R(0, LEN - 1).map(n => (n % 2 ? p.a2 + ((n - 1) / 2) * p.d2 : p.a1 + (n / 2) * p.d1)) },
  growing:    { text: p => `the amount added grows by ${p.dd} each time, starting at ${p.d0}`,
                grid: () => R(1, 30).flatMap(a => R(1, 8).flatMap(d0 => R(1, 5).map(dd => ({ a, d0, dd })))),
                seq: p => { const s = [p.a]; let d = p.d0; while (s.length < LEN) { s.push(s.at(-1) + d); d += p.dd; } return s; } },
  fibonacci:  { text: () => 'each term is the sum of the two before it',
                grid: () => R(1, 12).flatMap(a => R(1, 12).map(b => ({ a, b }))),
                seq: p => { const s = [p.a, p.b]; while (s.length < LEN) s.push(s.at(-1) + s.at(-2)); return s; } },
  multAdd:    { text: p => `multiply by ${p.m}, then ${p.c >= 0 ? `add ${p.c}` : `subtract ${-p.c}`}`,
                grid: () => R(1, 12).flatMap(a => [2, 3].flatMap(m => nz(-6, 6).map(c => ({ a, m, c })))),
                seq: p => { const s = [p.a]; while (s.length < LEN) s.push(p.m * s.at(-1) + p.c); return s; } },
  altOps:     { text: p => `alternately add ${p.p} and multiply by ${p.q}${p.mulFirst ? ', multiplying first' : ''}`,
                grid: () => R(1, 12).flatMap(a => R(1, 9).flatMap(pp => [2, 3].flatMap(q => [false, true].map(mulFirst => ({ a, p: pp, q, mulFirst }))))),
                seq: p => { const s = [p.a]; while (s.length < LEN) { const mul = (s.length % 2 === 1) === p.mulFirst; s.push(mul ? s.at(-1) * p.q : s.at(-1) + p.p); } return s; } },
  squares:    { text: p => `square numbers ${p.off ? (p.off > 0 ? `plus ${p.off}` : `minus ${-p.off}`) : ''}, from ${p.s + 1} squared`.replace('  ', ' '),
                grid: () => R(0, 6).flatMap(s => R(-6, 6).map(off => ({ s, off }))),
                seq: p => R(0, LEN - 1).map(n => (n + 1 + p.s) ** 2 + p.off) },
};

// Which families each tier draws from. Pure arithmetic stays in the library as a decoy, because an
// item has to be unambiguous against it, but is never generated: almost every wrong procedure on an
// arithmetic series reproduces the right answer, so it cannot carry named distractors.
export const NUMBER_TIERS = {
  warmup:   ['geom', 'interleave', 'growing'],
  standard: ['growing', 'fibonacci', 'multAdd', 'altOps', 'interleave'],
  hard:     ['altOps', 'multAdd', 'squares', 'fibonacci', 'growing'],
};

const indexCache = new Map();
export function numberIndex() {
  if (indexCache.has('num')) return indexCache.get('num');
  const idx = new Map();
  for (const fam of Object.values(NUMBER_FAMILIES)) for (const p of fam.grid()) {
    const s = fam.seq(p);
    const k = s.slice(0, SHOWN).join(',');
    if (!idx.has(k)) idx.set(k, new Set());
    idx.get(k).add(s[SHOWN]);
  }
  indexCache.set('num', idx);
  return idx;
}
export const numberPredictions = shown => numberIndex().get(shown.join(',')) ?? new Set();

// Letters as positions 1 to 26, never wrapping, so Z to A never has to be read as a step of one.
export const LETTER = i => String.fromCharCode(64 + i);
export const LETTER_FAMILIES = {
  arith:      { text: p => `move ${Math.abs(p.d)} letter${Math.abs(p.d) === 1 ? '' : 's'} ${p.d > 0 ? 'forward' : 'back'} each time`,
                grid: () => R(1, 26).flatMap(a => nz(-6, 6).map(d => ({ a, d }))), seq: NUMBER_FAMILIES.arith.seq },
  interleave: { text: p => `two series alternate: one moves ${p.d1}, the other ${p.d2}`,
                grid: () => R(1, 26).flatMap(a1 => R(1, 26).flatMap(a2 => nz(-4, 4).flatMap(d1 => nz(-4, 4)
                  .filter(d2 => d1 !== d2 || a1 !== a2).map(d2 => ({ a1, a2, d1, d2 }))))),
                seq: NUMBER_FAMILIES.interleave.seq },
  growing:    { text: p => `the step grows by ${p.dd} each time, starting at ${p.d0}`,
                grid: () => R(1, 26).flatMap(a => R(1, 4).flatMap(d0 => R(1, 2).map(dd => ({ a, d0, dd })))),
                seq: NUMBER_FAMILIES.growing.seq },
  zigzag:     { text: p => `alternately move ${p.f} forward and ${p.b} back`,
                grid: () => R(1, 26).flatMap(a => R(2, 6).flatMap(f => R(1, 4).filter(b => b < f).map(b => ({ a, f, b })))),
                seq: p => { const s = [p.a]; while (s.length < LEN) s.push(s.at(-1) + (s.length % 2 === 1 ? p.f : -p.b)); return s; } },
};
export const LETTER_TIERS = { warmup: ['arith', 'interleave'], standard: ['growing', 'zigzag', 'interleave'], hard: ['zigzag', 'growing', 'interleave'] };
export const inLetters = s => s.every(v => Number.isInteger(v) && v >= 1 && v <= 26);

export function letterIndex() {
  if (indexCache.has('let')) return indexCache.get('let');
  const idx = new Map();
  for (const fam of Object.values(LETTER_FAMILIES)) for (const p of fam.grid()) {
    const s = fam.seq(p);
    if (!inLetters(s.slice(0, SHOWN + 1))) continue;
    const k = s.slice(0, SHOWN).join(',');
    if (!idx.has(k)) idx.set(k, new Set());
    idx.get(k).add(s[SHOWN]);
  }
  indexCache.set('let', idx);
  return idx;
}
export const letterPredictions = shown => letterIndex().get(shown.join(',')) ?? new Set();

// The named wrong procedures, each applied to the five shown terms. Family-specific ones come
// first because they are what a candidate who half-saw the rule actually produces.
export function wrongProcedures(fam, p, s) {
  const [t0, t1, t2, t3, t4] = s;
  const out = [];
  const add = (errorType, value, note) => out.push({ errorType, value, note });
  if (fam === 'interleave') add('missed-alternation', t4 + (t4 - t2), 'continued the series the last term belongs to, rather than switching to the other one');
  if (fam === 'fibonacci') add('wrong-pair', t4 + t2, 'added the last term to the one two places back, rather than to the one just before it');
  if (fam === 'multAdd') add('dropped-step', t4 * p.m, `multiplied by ${p.m} and left out the ${p.c >= 0 ? 'addition' : 'subtraction'}`);
  if (fam === 'altOps') {
    const lastWasMul = s.length % 2 === 0 ? !p.mulFirst : p.mulFirst;
    add('repeated-operation', lastWasMul ? t4 * p.q : t4 + p.p, 'applied the same operation as the last step again, rather than alternating');
  }
  add('last-difference', t4 + (t4 - t3), 'assumed the last difference repeats, so the rule was read as adding a constant');
  add('first-difference', t4 + (t1 - t0), 'carried the first difference forward rather than the pattern of differences');
  add('skipped-term', s[SHOWN + 1], 'applied the rule twice, giving the term after the next one');
  if (t3 !== 0 && Number.isInteger(t4 * t4 / t3)) add('last-ratio', t4 * t4 / t3, 'assumed the last ratio repeats, so the rule was read as multiplying by a constant');
  return out;
}

// Parameter grids filtered to what an item can actually use, cached per family. Drawing from the
// filtered grid rather than drawing and rejecting took the letter series from 83% rejection to the
// figure the audit reports: most raw letter parameters walk off the end of the alphabet.
const gridCache = new Map();
export function usableNumberGrid(family) {
  const key = `n:${family}`;
  if (!gridCache.has(key)) {
    const fam = NUMBER_FAMILIES[family];
    gridCache.set(key, fam.grid().filter(p => {
      const s = fam.seq(p);
      return s.slice(0, SHOWN + 1).every(v => Number.isInteger(v) && v > 0 && v <= 999)
        && new Set(s.slice(0, SHOWN)).size === SHOWN;
    }));
  }
  return gridCache.get(key);
}
export function usableLetterGrid(family) {
  const key = `l:${family}`;
  if (!gridCache.has(key)) {
    const fam = LETTER_FAMILIES[family];
    gridCache.set(key, fam.grid().filter(p => {
      const s = fam.seq(p);
      // A step of one letter (L, K, J, I, H) is a reading exercise rather than a reasoning one, and its
      // off-by-one distractor is the last letter shown. It stays in the library as a decoy only.
      return inLetters(s.slice(0, SHOWN + 1)) && new Set(s.slice(0, SHOWN)).size === SHOWN
        && !(family === 'arith' && Math.abs(p.d) < 2);
    }));
  }
  return gridCache.get(key);
}
