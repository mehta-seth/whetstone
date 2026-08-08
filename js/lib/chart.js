// Chart stimulus. The shape deliberately copies lib/table.js: one spec object,
// then renderers that only ever read it. The app screen, the audit page and the terminal
// summary all consume the same spec, so a chart can never look right in the app and wrong
// in the audit page it is being reviewed against.
//
//   chartSpec({ kind, ... })   normalises and freezes the description
//   chartSvg(spec)             the SVG both the app and the audit page embed
//   chartText(spec)            fixed-width rendition for the terminal block
//   validate.chart(spec)       the invariants, in js/lib/validate.js
//
// THE READING RULE, the spec as amended earlier.
//
// The spec asks that any value the candidate must read off the chart be exactly recoverable, and
// 12.4 asked for a coarse interval with "nonzero" reading error. Those contradict. Taken
// literally, 12.1 puts 45 horizontal lines on a17's 0 to 22 axis, which is unreadable.
//
// The amendment: a readable value lands on a drawn gridline, or exactly midway between two
// adjacent ones, and never finer. Midpoint reading is exact for a human; quarter-position
// reading is not. Whenever any value sits at a midpoint the axis label must state the
// precision, which is what licenses the half-gridline read. A label such as "Sales in
// millions of dollars (rounded to the nearest 0.5 million)" on an axis running 0 to 22 with
// gridlines every 1 makes every bar exactly readable whether it sits on a line or midway
// between two. So the amendment buys exactness rather than compromising for it.
//
// GRID is therefore the unit of value legality, not the gridline interval:
//   grid = interval        every value on a line
//   grid = interval / 2    values may sit at midpoints, precisionNote required
// Nothing finer is admissible and checkChart rejects it.

const GEOM = {
  width: 700, height: 400,
  padTop: 34, padRight: 18, padBottom: 62, padLeft: 66,
  pie: { width: 700, height: 400, cx: 250, cy: 205, r: 132 },
};

// Six marker shapes, so a line chart stays readable without relying on colour. The spec
// The spec asks for this explicitly, and the general quality floor asks for it anyway.
export const MARKERS = ['circle', 'square', 'triangle', 'diamond', 'cross', 'wedge'];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Values are compared against the grid in integer units to keep floating point out of the
// invariant. 12.5 on a grid of 0.5 becomes 25 on a grid of 1, which is exact.
const unitsOf = (value, grid) => Math.round(value / grid);
export const onGrid = (value, grid) => Math.abs(value - unitsOf(value, grid) * grid) < 1e-9;

// A value is at a midpoint when it needs the half-interval to be expressed at all.
export const atMidpoint = (value, interval) =>
  !onGrid(value, interval) && onGrid(value, interval / 2);

export function axisTicks(interval, max) {
  const out = [];
  for (let k = 0; k * interval <= max + 1e-9; k++) out.push(Number((k * interval).toFixed(10)));
  return out;
}

// One place where a value becomes a y coordinate, and its exact inverse. The renderer test
// harness recovers every plotted value through unproject and asserts equality, which is how
// "exactly recoverable from the rendered SVG" is checked rather than asserted.
export const projector = ({ axisMax, top, height }) => ({
  project:   v => top + height * (1 - v / axisMax),
  unproject: y => axisMax * (1 - (y - top) / height),
});

function frame({ axisMax, interval, axisLabel, categories }) {
  const plot = {
    left: GEOM.padLeft, top: GEOM.padTop,
    width: GEOM.width - GEOM.padLeft - GEOM.padRight,
    height: GEOM.height - GEOM.padTop - GEOM.padBottom,
  };
  const { project } = projector({ axisMax, top: plot.top, height: plot.height });
  const ticks = axisTicks(interval, axisMax);
  const dp = interval < 1 ? String(interval).split('.')[1].length : 0;
  const lines = ticks.map(v => {
    const y = project(v).toFixed(2);
    return `<line class="grid" x1="${plot.left}" y1="${y}" x2="${plot.left + plot.width}" y2="${y}"/>`
      + `<text class="tick" x="${plot.left - 8}" y="${(project(v) + 4).toFixed(2)}">${v.toFixed(dp)}</text>`;
  }).join('');
  const band = plot.width / Math.max(1, categories.length);
  const cats = categories.map((c, i) =>
    `<text class="cat" x="${(plot.left + band * (i + 0.5)).toFixed(2)}" y="${plot.top + plot.height + 20}">${esc(c)}</text>`).join('');
  return {
    plot, project, band, ticks,
    svg: `<g class="frame">${lines}`
      + `<line class="axis" x1="${plot.left}" y1="${plot.top + plot.height}" x2="${plot.left + plot.width}" y2="${plot.top + plot.height}"/>`
      + `<line class="axis" x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.top + plot.height}"/>`
      + `<text class="axis-label" x="14" y="${plot.top + plot.height / 2}" transform="rotate(-90 14 ${plot.top + plot.height / 2})">${esc(axisLabel)}</text>`
      + cats + `</g>`,
  };
}

// ---------------------------------------------------------------------------------------
// Spec. Every kind carries `interval` and `grid` so one predicate covers all of them.
// `precisionNote` is folded into the axis label rather than kept beside it, because the
// candidate has to see it while reading the axis, not underneath the chart.
// ---------------------------------------------------------------------------------------
export function chartSpec(input) {
  const s = { ...input };
  s.caption = s.caption ?? null;
  s.note = s.note ?? null;
  if (s.kind === 'pie') {
    s.segments = s.segments.map(x => ({ ...x }));
    return Object.freeze(s);
  }
  // Two pies. Each half is a complete pie spec in its own right, so checkPie can be applied
  // to either without special-casing, and the pair-level constraints sit above them.
  if (s.kind === 'pies') {
    s.pies = s.pies.map(x => ({ ...x, labelMode: x.labelMode ?? 'percent', segments: x.segments.map(y => ({ ...y })) }));
    return Object.freeze(s);
  }
  // 100% stacked has no value axis at all: 12.6 rules out gridlines every 10% as too coarse
  // to make an interesting item, so the segments carry their own percentages instead.
  if (s.kind === 'stacked100') {
    s.bars = s.bars.map(x => ({ ...x, values: [...x.values] }));
    return Object.freeze(s);
  }
  s.interval = s.interval;
  s.grid = s.grid ?? s.interval;
  s.axisMax = s.axisMax ?? Math.ceil(Math.max(...readableValues(s)) / s.interval) * s.interval;
  s.axisLabel = s.precisionNote ? `${s.label} (${s.precisionNote})` : s.label;
  return Object.freeze(s);
}

// Every value a candidate must read off the chart, which is what the grid rule applies to.
// The spec's second sentence exempts values that are only compared, and no kind here has any.
export function readableValues(s) {
  switch (s.kind) {
    case 'bar':      return s.bars.map(b => b.value);
    case 'grouped':  return s.groups.flatMap(g => g.values);
    case 'line':     return s.series.flatMap(x => x.values);
    // 12.6: reading a stacked segment means differencing two boundaries, so the cumulative
    // sums are what the candidate actually reads, and they are what must land on the grid.
    case 'stacked':  return s.bars.flatMap(b => cumulative(b.values));
    default:         return [];
  }
}

const cumulative = vals => vals.reduce((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], []);

// ---------------------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------------------
const CSS = `<style>
.grid{stroke:var(--chart-grid,#d8d4cc);stroke-width:1}
.axis{stroke:var(--chart-axis,#6b6459);stroke-width:1.5}
.tick,.cat,.legend-t,.seg-l{font:12px var(--font-ui,system-ui);fill:var(--chart-ink,#3d3831)}
.tick{text-anchor:end}.cat{text-anchor:middle}
.axis-label{font:12px var(--font-ui,system-ui);fill:var(--chart-ink,#3d3831);text-anchor:middle}
.cap{font:600 13px var(--font-ui,system-ui);fill:var(--chart-ink,#3d3831)}
.bar{fill:var(--chart-1,#8a7f6d)}
.s0{fill:var(--chart-1,#8a7f6d)}.s1{fill:var(--chart-2,#5f7a6b)}.s2{fill:var(--chart-3,#8f6b5c)}
.s3{fill:var(--chart-4,#6b7285)}.s4{fill:var(--chart-5,#a08a5c)}.s5{fill:var(--chart-6,#7d6a7a)}
.l0{stroke:var(--chart-1,#8a7f6d)}.l1{stroke:var(--chart-2,#5f7a6b)}.l2{stroke:var(--chart-3,#8f6b5c)}
.l3{stroke:var(--chart-4,#6b7285)}.l4{stroke:var(--chart-5,#a08a5c)}.l5{stroke:var(--chart-6,#7d6a7a)}
.ln{fill:none;stroke-width:2}
.wedge{stroke:var(--chart-bg,#fdfcfa);stroke-width:1.5}
.seg-l{text-anchor:middle}
</style>`;

const marker = (shape, x, y, cls) => {
  const r = 4;
  switch (shape) {
    case 'square':   return `<rect class="${cls}" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/>`;
    case 'triangle': return `<polygon class="${cls}" points="${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}"/>`;
    case 'diamond':  return `<polygon class="${cls}" points="${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}"/>`;
    case 'cross':    return `<path class="${cls}" d="M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}" stroke-width="2"/>`;
    case 'wedge':    return `<polygon class="${cls}" points="${x - r},${y + r} ${x + r},${y + r} ${x},${y - r}"/>`;
    default:         return `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}"/>`;
  }
};

const legend = (entries, y) => `<g class="legend">` + entries.map((e, i) => {
  const x = GEOM.padLeft + i * Math.min(150, (GEOM.width - GEOM.padLeft - GEOM.padRight) / entries.length);
  return `<rect class="key s${i}" x="${x}" y="${y - 9}" width="11" height="11"/>`
    + `<text class="legend-t" x="${x + 16}" y="${y}">${esc(e)}</text>`;
}).join('') + `</g>`;

function barSvg(s) {
  const f = frame({ ...s, categories: s.bars.map(b => b.label) });
  const w = f.band * 0.56;
  const body = s.bars.map((b, i) => {
    const y = f.project(b.value), x = f.plot.left + f.band * (i + 0.5) - w / 2;
    return `<rect class="bar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}"`
      + ` height="${(f.plot.top + f.plot.height - y).toFixed(2)}" data-value="${b.value}"/>`;
  }).join('');
  return wrap(s, f.svg + body);
}

function groupedSvg(s) {
  const f = frame({ ...s, categories: s.groups.map(g => g.label) });
  const n = s.groups[0].values.length;
  const gw = f.band * 0.72, bw = gw / n;
  const body = s.groups.map((g, gi) => g.values.map((v, bi) => {
    const y = f.project(v);
    const x = f.plot.left + f.band * (gi + 0.5) - gw / 2 + bi * bw;
    return `<rect class="s${bi}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(bw * 0.86).toFixed(2)}"`
      + ` height="${(f.plot.top + f.plot.height - y).toFixed(2)}" data-value="${v}"/>`;
  }).join('')).join('');
  return wrap(s, f.svg + body + legend(s.seriesLabels, GEOM.height - 14));
}

function lineSvg(s) {
  const f = frame({ ...s, categories: s.categories });
  const body = s.series.map((se, i) => {
    const pts = se.values.map((v, k) =>
      [f.plot.left + f.band * (k + 0.5), f.project(v)]);
    return `<polyline class="ln l${i}" points="${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}"/>`
      + pts.map(([x, y], k) => marker(MARKERS[i % MARKERS.length], x.toFixed(2), y.toFixed(2), `s${i}`)
        + `<circle class="hit" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.01" data-value="${se.values[k]}"/>`).join('');
  }).join('');
  return wrap(s, f.svg + body + legend(s.series.map(x => x.label), GEOM.height - 14));
}

function stackedSvg(s) {
  const f = frame({ ...s, categories: s.bars.map(b => b.label) });
  const w = f.band * 0.56;
  const body = s.bars.map((b, i) => {
    const x = f.plot.left + f.band * (i + 0.5) - w / 2;
    const cum = cumulative(b.values);
    // Bottom to top, so the legend order and the stacking order agree, which the spec requires.
    return b.values.map((v, k) => {
      const yTop = f.project(cum[k]), yBase = f.project(k ? cum[k - 1] : 0);
      return `<rect class="s${k}" x="${x.toFixed(2)}" y="${yTop.toFixed(2)}" width="${w.toFixed(2)}"`
        + ` height="${(yBase - yTop).toFixed(2)}" data-value="${v}" data-cum="${cum[k]}"/>`;
    }).join('');
  }).join('');
  return wrap(s, f.svg + body + legend(s.seriesLabels, GEOM.height - 14));
}

// 100% stacked. 12.6: gridlines every 10% would force every segment to a multiple of 10,
// which is too coarse to make an interesting item, so the segments carry their percentages
// and there is no value axis to read at all.
function stacked100Svg(s) {
  const plot = { left: GEOM.padLeft, top: GEOM.padTop,
    width: GEOM.width - GEOM.padLeft - GEOM.padRight,
    height: GEOM.height - GEOM.padTop - GEOM.padBottom };
  const band = plot.width / s.bars.length, w = band * 0.56;
  const body = s.bars.map((b, i) => {
    const x = plot.left + band * (i + 0.5) - w / 2;
    let acc = 0;
    return b.values.map((v, k) => {
      const y0 = plot.top + plot.height * (1 - (acc + v) / 100);
      const y1 = plot.top + plot.height * (1 - acc / 100);
      acc += v;
      const mid = (y0 + y1) / 2;
      return `<rect class="s${k}" x="${x.toFixed(2)}" y="${y0.toFixed(2)}" width="${w.toFixed(2)}"`
        + ` height="${(y1 - y0).toFixed(2)}" data-value="${v}"/>`
        + (v >= 10 ? `<text class="seg-l" x="${(x + w / 2).toFixed(2)}" y="${(mid + 4).toFixed(2)}">${v}%</text>` : '');
    }).join('')
      + `<text class="cat" x="${(plot.left + band * (i + 0.5)).toFixed(2)}" y="${plot.top + plot.height + 20}">${esc(b.label)}</text>`;
  }).join('');
  return wrap(s, body + legend(s.seriesLabels, GEOM.height - 14));
}

// Pie. Segments are always labelled, in percent or in absolute value and never both, per
// 12.5 as amended earlier: the minimum segment is 10%, not 5%. The total lives in the
// caption and never inside the chart. Angles come from the labelled figure so the wedge and
// its label can never disagree, and the last wedge closes on the first by construction
// rather than by arithmetic, so there is no rounding drift at 360 degrees.
function pieSvg(s, offsetX = 0, geom = GEOM.pie) {
  const { cx, cy, r } = geom;
  const total = s.segments.reduce((a, x) => a + x.value, 0);
  let acc = -90;
  const wedges = s.segments.map((seg, i) => {
    const sweep = 360 * seg.value / total;
    const a0 = acc, a1 = acc + sweep;
    acc = a1;
    const rad = d => d * Math.PI / 180;
    const x0 = cx + offsetX + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
    const x1 = cx + offsetX + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
    const large = sweep > 180 ? 1 : 0;
    const lr = r * 0.66, am = rad((a0 + a1) / 2);
    const lx = cx + offsetX + lr * Math.cos(am), ly = cy + lr * Math.sin(am);
    const d = i === s.segments.length - 1
      ? `M${cx + offsetX} ${cy}L${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${(cx + offsetX + r * Math.cos(rad(-90))).toFixed(2)} ${(cy + r * Math.sin(rad(-90))).toFixed(2)}Z`
      : `M${cx + offsetX} ${cy}L${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
    return `<path class="wedge s${i}" d="${d}" data-value="${seg.value}"/>`
      + `<text class="seg-l" x="${lx.toFixed(2)}" y="${(ly + 4).toFixed(2)}">${esc(seg.display)}</text>`;
  }).join('');
  const labels = s.segments.map((seg, i) =>
    `<rect class="key s${i}" x="${430 + offsetX}" y="${GEOM.padTop + 14 + i * 22 - 9}" width="11" height="11"/>`
    + `<text class="legend-t" x="${446 + offsetX}" y="${GEOM.padTop + 14 + i * 22}">${esc(seg.label)}</text>`).join('');
  return wedges + labels;
}

function piesSvg(s) {
  // Two pies, different totals. Both totals are stated in the caption, never on the chart,
  // so the absolute-versus-share reversal cannot be read off without using them.
  const g = { cx: 158, cy: 210, r: 104 };
  const one = pieSvg({ segments: s.pies[0].segments }, 0, g);
  const two = pieSvg({ segments: s.pies[1].segments }, 356, g);
  const titles = s.pies.map((p, i) =>
    `<text class="cap" x="${(i ? 514 : 158)}" y="${GEOM.padTop + 4}" text-anchor="middle">${esc(p.label)}</text>`).join('');
  return wrap(s, titles + one + two);
}

function wrap(s, inner) {
  const cap = s.caption
    ? `<text class="cap" x="${GEOM.padLeft}" y="18">${esc(s.caption)}</text>` : '';
  const h = s.kind === 'pies' ? GEOM.height + 18 : GEOM.height;
  return `<svg class="stim-chart" viewBox="0 0 ${GEOM.width} ${h}" xmlns="http://www.w3.org/2000/svg"`
    + ` role="img" aria-label="${esc(s.caption ?? s.kind + ' chart')}">${CSS}${cap}${inner}</svg>`
    + (s.note ? `<p class="chart-note">${esc(s.note)}</p>` : '');
}

export function chartSvg(spec) {
  switch (spec.kind) {
    case 'bar':        return barSvg(spec);
    case 'grouped':    return groupedSvg(spec);
    case 'line':       return lineSvg(spec);
    case 'stacked':    return stackedSvg(spec);
    case 'stacked100': return stacked100Svg(spec);
    case 'pie':        return wrap(spec, pieSvg(spec));
    case 'pies':       return piesSvg(spec);
    default:           return '';
  }
}

// Fixed-width rendition for the terminal block in build.js. Not a picture of the
// chart, a listing of exactly the figures a solver can read off it, which is what the
// formula is checked against.
export function chartText(spec, indent = 11) {
  const p = ' '.repeat(indent);
  const out = [];
  if (spec.caption) out.push(p + spec.caption);
  const dp = spec.grid && spec.grid < 1 ? String(spec.grid).split('.')[1].length : 0;
  const num = v => v.toFixed(dp);
  switch (spec.kind) {
    case 'bar':
      out.push(p + `axis 0 to ${spec.axisMax} every ${spec.interval}   ${spec.axisLabel}`);
      for (const b of spec.bars) out.push(p + `  ${b.label.padEnd(14)} ${num(b.value).padStart(8)}`);
      break;
    case 'grouped':
      out.push(p + `axis 0 to ${spec.axisMax} every ${spec.interval}   ${spec.axisLabel}`);
      out.push(p + `  ${''.padEnd(14)}` + spec.seriesLabels.map(l => l.padStart(8)).join('') + '     total');
      for (const g of spec.groups) {
        out.push(p + `  ${g.label.padEnd(14)}` + g.values.map(v => num(v).padStart(8)).join('')
          + num(g.values.reduce((a, b) => a + b, 0)).padStart(10));
      }
      break;
    case 'line':
      out.push(p + `axis 0 to ${spec.axisMax} every ${spec.interval}   ${spec.axisLabel}`);
      out.push(p + `  ${''.padEnd(14)}` + spec.categories.map(c => String(c).padStart(8)).join(''));
      for (const se of spec.series) out.push(p + `  ${se.label.padEnd(14)}` + se.values.map(v => num(v).padStart(8)).join(''));
      break;
    case 'stacked':
      out.push(p + `axis 0 to ${spec.axisMax} every ${spec.interval}   ${spec.axisLabel}`);
      out.push(p + `  ${''.padEnd(14)}` + spec.seriesLabels.map(l => l.padStart(8)).join('') + '     total');
      for (const b of spec.bars) {
        out.push(p + `  ${b.label.padEnd(14)}` + b.values.map(v => num(v).padStart(8)).join('')
          + num(b.values.reduce((a, x) => a + x, 0)).padStart(10));
      }
      break;
    case 'stacked100':
      out.push(p + `every bar full height, segments labelled with their percentages`);
      out.push(p + `  ${''.padEnd(14)}` + spec.seriesLabels.map(l => l.padStart(8)).join('') + '     total');
      for (const b of spec.bars) {
        out.push(p + `  ${b.label.padEnd(14)}` + b.values.map(v => `${v}%`.padStart(8)).join('')
          + String(b.total).padStart(10));
      }
      break;
    case 'pie':
      for (const s of spec.segments) out.push(p + `  ${s.label.padEnd(20)} ${s.display.padStart(9)}`);
      break;
    case 'pies':
      out.push(p + `  ${''.padEnd(20)}` + spec.pies.map(x => x.label.padStart(12)).join(''));
      for (let i = 0; i < spec.pies[0].segments.length; i++) {
        out.push(p + `  ${spec.pies[0].segments[i].label.padEnd(20)}`
          + spec.pies.map(x => x.segments[i].display.padStart(12)).join(''));
      }
      out.push(p + `  ${'total'.padEnd(20)}` + spec.pies.map(x => String(x.total).padStart(12)).join(''));
      break;
  }
  if (spec.note) out.push(p + spec.note);
  return out.join('\n');
}
