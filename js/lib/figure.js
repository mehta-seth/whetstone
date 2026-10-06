// Figure series: one spec, two renderers (SVG for the app and the audit page, text for the terminal
// and the review screen), the same arrangement as table.js and chart.js.
//
// A figure is four attributes, each independent of the others:
//   orient  an arrow in the centre cell, one of eight directions, clockwise from straight up
//   shade   the arrow's fill, white, grey or black
//   pos     a marker in one of the eight border cells, clockwise from the top left
//   mark    the marker's shape, circle, square or triangle
//
// WHY THESE FOUR. Each is visible at a glance and none can hide another. The arrow is chosen over a
// symmetric shape because a rotation rule on a square or a circle is invisible, and an invisible rule
// is an unanswerable item that every arithmetic check would pass. The arrow distinguishes all eight
// orientations, so every orientation rule is on screen.
//
// IDENTIFIABILITY IS CHECKED PER ATTRIBUTE. Because the attributes are independent, the series is
// unambiguous exactly when each attribute's five shown values admit one prediction across every rule
// in that attribute's library. `predictions` enumerates the library, so "the figure that comes next"
// is a definition rather than a judgement.

export const ORIENT_NAMES = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
export const SHADE_NAMES = ['white', 'grey', 'black'];
export const POS_NAMES = ['top left', 'top middle', 'top right', 'middle right',
  'bottom right', 'bottom middle', 'bottom left', 'middle left'];
export const MARK_NAMES = ['circle', 'square', 'triangle'];

export const ATTRS = {
  orient: { size: 8, cyclic: true },
  shade:  { size: 3, cyclic: false },
  pos:    { size: 8, cyclic: true },
  mark:   { size: 3, cyclic: false },
};
export const ATTR_KEYS = Object.keys(ATTRS);

const mod = (v, n) => ((v % n) + n) % n;

// The rule library. A rule is { kind, ...params } and `at(rule, t)` gives its value at frame t.
export function at(rule, t, size) {
  switch (rule.kind) {
    case 'const': return rule.v;
    case 'step':  return mod(rule.v + rule.k * t, size);
    case 'alt':   return t % 2 === 0 ? rule.v : rule.w;
    case 'cycle': return mod(rule.v + rule.dir * t, size);
    default: throw new Error(`unknown figure rule ${rule.kind}`);
  }
}

// Every rule an attribute admits. Cyclic attributes step by any non-zero amount; three-valued ones
// cycle forwards or backwards. Both admit constancy and a two-value alternation.
export function library(attr) {
  const { size, cyclic } = ATTRS[attr];
  const out = [];
  for (let v = 0; v < size; v++) {
    out.push({ kind: 'const', v });
    for (let w = 0; w < size; w++) if (w !== v) out.push({ kind: 'alt', v, w });
    if (cyclic) for (let k = 1; k < size; k++) out.push({ kind: 'step', v, k });
    else for (const dir of [1, -1]) out.push({ kind: 'cycle', v, dir });
  }
  return out;
}
const LIB = Object.fromEntries(ATTR_KEYS.map(a => [a, library(a)]));

// The set of next values every rule consistent with `shown` predicts.
export function predictions(attr, shown) {
  const { size } = ATTRS[attr];
  const out = new Set();
  for (const r of LIB[attr]) {
    if (shown.every((x, t) => at(r, t, size) === x)) out.add(at(r, shown.length, size));
  }
  return out;
}

export const figureKey = f => ATTR_KEYS.map(a => f[a]).join('.');
export const sameFigure = (a, b) => figureKey(a) === figureKey(b);

export function validFigure(f) {
  return !!f && ATTR_KEYS.every(a => Number.isInteger(f[a]) && f[a] >= 0 && f[a] < ATTRS[a].size);
}

export function figureText(f) {
  return `${SHADE_NAMES[f.shade]} arrow pointing ${ORIENT_NAMES[f.orient]}, ${MARK_NAMES[f.mark]} ${POS_NAMES[f.pos]}`;
}

// Border cells clockwise from the top left, as (column, row) on a 3 by 3 grid.
const CELLS = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];

// Colours read app tokens with fallbacks, so the standalone audit page renders without the app CSS.
const C = {
  frame: 'var(--fig-frame, #9aa1ac)', grid: 'var(--fig-grid, #e2e5ea)',
  ink: 'var(--fig-ink, #14161a)', grey: 'var(--fig-grey, #9aa1ac)', paper: 'var(--fig-paper, #ffffff)',
  mark: 'var(--fig-mark, #14524a)',
};

export function figureSvg(f, { size = 76, label = null } = {}) {
  const shade = [C.paper, C.grey, C.ink][f.shade];
  // An arrow pointing up from the centre, rotated about the centre in 45 degree steps.
  const arrow = `<g transform="rotate(${f.orient * 45} 50 50)">`
    + `<path d="M50 34 L60 46 L54 46 L54 66 L46 66 L46 46 L40 46 Z" fill="${shade}" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/></g>`;
  const [col, row] = CELLS[f.pos];
  const cx = 100 / 6 + col * (100 / 3), cy = 100 / 6 + row * (100 / 3);
  const marker = f.mark === 0 ? `<circle cx="${cx}" cy="${cy}" r="7" fill="${C.mark}"/>`
    : f.mark === 1 ? `<rect x="${cx - 6.5}" y="${cy - 6.5}" width="13" height="13" fill="${C.mark}"/>`
    : `<polygon points="${cx},${cy - 8} ${cx + 8},${cy + 6} ${cx - 8},${cy + 6}" fill="${C.mark}"/>`;
  const grid = [100 / 3, 200 / 3].map(g =>
    `<line x1="${g}" y1="2" x2="${g}" y2="98" stroke="${C.grid}" stroke-width="1"/>`
    + `<line x1="2" y1="${g}" x2="98" y2="${g}" stroke="${C.grid}" stroke-width="1"/>`).join('');
  const name = label ?? figureText(f);
  return `<svg class="fig" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${name}">`
    + `<rect x="2" y="2" width="96" height="96" rx="4" fill="${C.paper}" stroke="${C.frame}" stroke-width="2"/>`
    + grid + arrow + marker + '</svg>';
}

// The empty frame that stands for the figure being asked for.
export function blankSvg(size = 76) {
  return `<svg class="fig fig-blank" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="the next figure">`
    + `<rect x="2" y="2" width="96" height="96" rx="4" fill="none" stroke="${C.frame}" stroke-width="2" stroke-dasharray="6 5"/>`
    + `<text x="50" y="62" text-anchor="middle" font-size="34" fill="${C.frame}" font-family="var(--sans, sans-serif)">?</text></svg>`;
}

// Named failures for the validator, same convention as checkChart.
export function checkFigureStimulus(it) {
  const f = [];
  const frames = it.stimulus?.figures;
  if (!Array.isArray(frames) || frames.length !== 5) { f.push('figure-frame-count'); return f; }
  if (!frames.every(validFigure)) f.push('figure-invalid-frame');
  const opts = it.options ?? [];
  if (!opts.every(o => validFigure(o.figure))) f.push('figure-option-missing');
  else if (new Set(opts.map(o => figureKey(o.figure))).size !== opts.length) f.push('figure-duplicate-option');
  // The series must move. Five identical frames ask for nothing.
  if (frames.every(fr => sameFigure(fr, frames[0]))) f.push('figure-static-series');
  // Every attribute must be identifiable, and its one prediction must be what the correct option shows.
  const correct = opts.find(o => o.role === 'correct')?.figure;
  for (const a of ATTR_KEYS) {
    const p = predictions(a, frames.map(fr => fr[a]));
    if (p.size !== 1) { f.push('figure-ambiguous'); break; }
    if (correct && !p.has(correct[a])) { f.push('figure-answer-not-predicted'); break; }
  }
  return f;
}
